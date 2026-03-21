"""
whatsapp_watcher.py — Production-grade WhatsApp watcher.

Architecture:
- Starts whatsapp_client.js once as a persistent subprocess
- Reads JSON lines from stdout as messages arrive (event-driven)
- On crash: detects reason, runs cleanup, waits, retries (max 5 times)
- Uses psutil to kill stale Chrome processes that hold the session lock
"""

import atexit
import json
import logging
import logging.handlers
import os
import re
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from filelock import FileLock

# ── Paths ─────────────────────────────────────────────────────────────────────

PROJECT_ROOT   = Path(__file__).parent.parent
JS_CLIENT      = Path(__file__).parent / "whatsapp_client.js"
PROCESSED_FILE = PROJECT_ROOT / ".whatsapp_processed.json"
SESSION_DIR    = PROJECT_ROOT / ".wwebjs_auth" / "session"

_processed_lock = FileLock(str(PROCESSED_FILE) + ".lock")

# ── Restart policy ────────────────────────────────────────────────────────────

MAX_RESTARTS        = 5    # give up after this many rapid failures
RESTART_DELAY       = 12   # seconds to wait before each restart
MIN_HEALTHY_UPTIME  = 60   # seconds — if ran this long, reset the counter

# ── Logger ────────────────────────────────────────────────────────────────────

_file_handler = logging.handlers.RotatingFileHandler(
    str(PROJECT_ROOT / "whatsapp_watcher.log"),
    maxBytes=5 * 1024 * 1024,
    backupCount=3,
)
_stream_handler = logging.StreamHandler()
_fmt = logging.Formatter("%(asctime)s [%(levelname)s] WhatsAppWatcher — %(message)s")
_file_handler.setFormatter(_fmt)
_stream_handler.setFormatter(_fmt)
logging.basicConfig(level=logging.INFO, handlers=[_file_handler, _stream_handler])
logger = logging.getLogger("WhatsAppWatcher")


# =============================================================================
# SESSION CLEANUP HELPERS
# =============================================================================

def _kill_stale_chrome() -> int:
    """Kill Chrome/Chromium processes that are locking our session directory.

    Only kills processes whose command-line contains the session path —
    never touches unrelated Chrome windows the user may have open.

    Returns the number of processes killed.
    """
    try:
        import psutil
    except ImportError:
        logger.warning("psutil not installed — cannot auto-kill stale Chrome. Run: uv add psutil")
        return 0

    session_str = str(SESSION_DIR).replace("\\", "/").lower()
    killed = 0

    for proc in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            name = (proc.info["name"] or "").lower()
            if "chrome" not in name and "chromium" not in name:
                continue

            cmdline = " ".join(proc.info["cmdline"] or []).replace("\\", "/").lower()
            if session_str not in cmdline:
                continue

            logger.info(f"Killing stale Chrome process PID {proc.pid} ({proc.info['name']})")
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except psutil.TimeoutExpired:
                proc.kill()
                logger.warning(f"Force-killed Chrome PID {proc.pid} (did not stop in 5 s)")
            killed += 1

        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    if killed:
        logger.info(f"Killed {killed} stale Chrome process(es).")
    else:
        logger.info("No stale Chrome processes found.")

    return killed


def _clean_session_locks() -> None:
    """Remove stale Chromium lock files from the session directory.

    Only runs after confirming no Chrome process is using the directory
    (call _kill_stale_chrome() first).
    """
    lock_names = ["SingletonLock", "SingletonSocket", "SingletonCookie"]
    for name in lock_names:
        lock_path = SESSION_DIR / name
        if lock_path.exists():
            try:
                lock_path.unlink()
                logger.info(f"Removed stale lock file: {name}")
            except OSError as e:
                logger.warning(f"Could not remove {name}: {e}")


def _clear_corrupted_session() -> None:
    """Delete the entire Chrome session profile when it is corrupted.

    Called after a TargetCloseError — the profile data itself is bad and
    cannot be recovered. Deleting it forces a fresh login (QR scan) but
    is the only reliable fix for a corrupted session.

    Must kill Chrome first — Windows denies rmtree if any process still
    holds a file handle inside the session directory.

    Falls back to 'rd /s /q' (Windows shell) if Python's rmtree is denied,
    then falls back to deleting only the SingletonLock so at least the next
    start is not blocked by the 'browser already running' error.
    """
    import shutil

    if not SESSION_DIR.exists():
        logger.info("Session directory already gone — nothing to delete.")
        return

    # Kill Chrome before attempting delete — avoids WinError 5 (Access Denied)
    killed = _kill_stale_chrome()
    if killed:
        logger.info("Waiting 3 s for OS to release file handles after Chrome kill...")
        time.sleep(3)

    # ── Attempt 1: Python rmtree ───────────────────────────────────────────────
    try:
        shutil.rmtree(SESSION_DIR)
        logger.warning(
            "Corrupted session deleted. "
            "WhatsApp will show a QR code on next start — re-scan with your phone."
        )
        return
    except OSError as e:
        logger.warning(f"rmtree failed ({e}) — trying Windows rd /s /q fallback...")

    # ── Attempt 2: Windows shell 'rd /s /q' ───────────────────────────────────
    # Uses the shell's built-in remove-directory which can delete locked files
    # that Python's rmtree cannot (e.g. CertificateRevocation/_metadata).
    if sys.platform == "win32":
        try:
            result = subprocess.run(
                ["cmd", "/c", "rd", "/s", "/q", str(SESSION_DIR)],
                capture_output=True, text=True, timeout=15,
            )
            if not SESSION_DIR.exists():
                logger.warning(
                    "Corrupted session deleted via rd /s /q. "
                    "WhatsApp will show a QR code on next start — re-scan with your phone."
                )
                return
            else:
                logger.warning(
                    f"rd /s /q finished but directory still exists (stderr: {result.stderr.strip()!r}). "
                    "Falling back to SingletonLock-only cleanup..."
                )
        except Exception as e:
            logger.warning(f"rd /s /q failed: {e} — falling back to lock-only cleanup...")

    # ── Attempt 3: Remove only the SingletonLock so next start is not blocked ──
    # The session data is still corrupted but at least the 'browser already running'
    # error will not fire. The TargetCloseError will repeat and we will retry.
    _clean_session_locks()
    logger.error(
        "Could not fully delete session directory. "
        "SingletonLock removed so next attempt can start, but session may still be corrupted. "
        "If this repeats, stop the system and manually delete: .wwebjs_auth/session/"
    )


def _full_session_cleanup() -> None:
    """Full pre-start cleanup: kill Chrome → remove locks → wait for OS to release handles."""
    logger.info("Running session cleanup...")
    killed = _kill_stale_chrome()
    if killed:
        # Wait longer so the OS fully releases all file handles from the killed processes.
        # 1s was too short — corrupted writes could still be in flight.
        logger.info("Waiting 3 s for OS to release file handles...")
        time.sleep(3)
    _clean_session_locks()
    logger.info("Session cleanup complete.")


# =============================================================================
# NODE VERSION CHECK
# =============================================================================

def _check_node_version() -> None:
    """Fail fast with a clear message if Node.js is missing."""
    try:
        result = subprocess.run(
            ["node", "--version"],
            capture_output=True, text=True, timeout=10,
        )
        logger.info(f"Node.js: {result.stdout.strip()}")
    except FileNotFoundError:
        raise RuntimeError(
            "Node.js not found in PATH. Install Node.js v16+ from https://nodejs.org/"
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("Node.js version check timed out.")


# =============================================================================
# WHATSAPP WATCHER CLASS
# =============================================================================

class WhatsAppWatcher:

    DEDUP_TTL_HOURS = 24

    def __init__(self, vault_path: str):
        self.vault_path = Path(vault_path)
        self.inbox      = self.vault_path / "Inbox" / "whatsapp"
        self.inbox.mkdir(parents=True, exist_ok=True)
        self._check_write_permissions()
        self._processed: set = self._load_processed()
        self._proc: subprocess.Popen | None = None

    # ── Startup check ─────────────────────────────────────────────────────────

    def _check_write_permissions(self) -> None:
        test = self.inbox / ".write_test"
        try:
            test.touch(); test.unlink()
        except OSError as e:
            raise RuntimeError(f"Inbox not writable: {self.inbox}\n{e}") from e

    # ── Dedup ──────────────────────────────────────────────────────────────────

    def _make_key(self, sender: str, text: str, message_id: str = "") -> str:
        if message_id:
            return f"id::{message_id}"
        return f"{sender}::{text[:80]}"

    def _load_processed(self) -> set:
        with _processed_lock:
            if not PROCESSED_FILE.exists():
                return set()
            try:
                data    = json.loads(PROCESSED_FILE.read_text(encoding="utf-8"))
                cutoff  = datetime.now(tz=timezone.utc) - timedelta(hours=self.DEDUP_TTL_HOURS)

                if "processed" in data and "entries" not in data:
                    logger.info("Migrating legacy dedup format — clearing old entries.")
                    return set()

                live_keys: set   = set()
                live_entries: list = []
                for entry in data.get("entries", []):
                    try:
                        if datetime.fromisoformat(entry["at"]) > cutoff:
                            live_keys.add(entry["key"])
                            live_entries.append(entry)
                    except (KeyError, ValueError):
                        pass

                expired = len(data.get("entries", [])) - len(live_entries)
                if expired:
                    logger.info(f"Dedup TTL: expired {expired} old entries.")
                self._write_entries(live_entries)
                return live_keys
            except Exception as e:
                logger.exception(f"Failed to load dedup set (starting fresh): {e}")
                return set()

    def _write_entries(self, entries: list) -> None:
        tmp = PROCESSED_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps({"entries": entries}, indent=2), encoding="utf-8")
        os.replace(str(tmp), str(PROCESSED_FILE))

    def _save_processed(self, key: str) -> None:
        self._processed.add(key)
        with _processed_lock:
            try:
                existing: list = []
                if PROCESSED_FILE.exists():
                    try:
                        data     = json.loads(PROCESSED_FILE.read_text(encoding="utf-8"))
                        existing = data.get("entries", [])
                    except Exception:
                        existing = []
                existing.append({"key": key, "at": datetime.now(tz=timezone.utc).isoformat()})
                self._write_entries(existing)
            except Exception as e:
                logger.exception(f"Could not save dedup entry: {e}")

    # ── Inbox file creation ────────────────────────────────────────────────────

    def _sanitize_name(self, name: str) -> str:
        clean = re.sub(r"[^\w\s+-]", "", name)
        clean = re.sub(r"[\s_]+", "_", clean).strip("_")
        clean = clean.replace("..", "").replace("/", "").replace("\\", "")
        return clean[:25] or "unknown"

    def _unique_inbox_path(self, sender: str) -> Path:
        safe_name = self._sanitize_name(sender)
        timestamp = datetime.now().strftime("%I_%M%p")
        candidate = self.inbox / f"whatsapp_{safe_name}_{timestamp}.txt"
        for counter in range(1, 1000):
            if not candidate.exists():
                return candidate
            candidate = self.inbox / f"whatsapp_{safe_name}_{timestamp}_{counter}.txt"
        ts = datetime.now().strftime("%H%M%S%f")
        return self.inbox / f"whatsapp_{safe_name}_{ts}.txt"

    def _create_inbox_file(self, sender: str, text: str, message_id: str = "") -> None:
        key = self._make_key(sender, text, message_id)
        if key in self._processed:
            return
        filepath = self._unique_inbox_path(sender)
        content  = f"From: {sender}\nSource: WhatsApp\n\nBody:\n{text}\n"
        try:
            filepath.write_text(content, encoding="utf-8")
            self._save_processed(key)
            logger.info(f"Inbox file created: {filepath.name}")
        except Exception as e:
            logger.exception(f"Failed to write inbox file: {e}")

    # ── Subprocess cleanup ────────────────────────────────────────────────────

    def _stop_proc(self) -> None:
        """Terminate the Node.js process and wait for it to exit."""
        if self._proc and self._proc.poll() is None:
            logger.info("Terminating WhatsApp Node.js process...")
            self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                logger.warning("Node.js did not stop in 5 s — force-killing.")
                self._proc.kill()
                self._proc.wait()
            logger.info("Node.js process stopped.")
        self._proc = None

    # ── Single run attempt ────────────────────────────────────────────────────

    def _run_once(self) -> str:
        """Start the JS client, read messages until it exits.

        Returns a crash-reason string:
            'clean_exit'       — process exited with code 0
            'browser_running'  — 'browser already running' error detected
            'auth_failure'     — WhatsApp auth failed
            'crash'            — any other non-zero exit
        """
        if not JS_CLIENT.exists():
            logger.error(f"JS client not found: {JS_CLIENT}")
            sys.exit(1)

        self._proc = subprocess.Popen(
            ["node", str(JS_CLIENT)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            cwd=str(PROJECT_ROOT),
        )
        atexit.register(self._stop_proc)

        crash_reason = "crash"
        stderr_lines: list[str] = []

        # ── stderr reader thread ───────────────────────────────────────────
        def _read_stderr() -> None:
            nonlocal crash_reason
            for line in self._proc.stderr:
                line = line.strip()
                if not line:
                    continue
                logger.info(f"[JS] {line}")
                stderr_lines.append(line)
                # Detect specific crash reasons from Puppeteer output
                low = line.lower()
                if "browser is already running" in low:
                    crash_reason = "browser_running"
                elif "auth failure" in low or "auth failed" in low:
                    crash_reason = "auth_failure"
                elif "targetcloseerror" in low or "target closed" in low:
                    crash_reason = "target_closed"

        stderr_thread = threading.Thread(target=_read_stderr, daemon=True)
        stderr_thread.start()

        logger.info("WhatsApp client started — waiting for messages...")

        try:
            for raw_line in self._proc.stdout:
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                try:
                    msg = json.loads(raw_line)

                    # Validate schema — reject unexpected or malformed payloads
                    if not isinstance(msg, dict):
                        logger.error(f"Expected JSON object from JS client, got: {type(msg).__name__}")
                        continue
                    sender     = msg.get("sender", "")
                    text       = msg.get("text", "")
                    message_id = msg.get("message_id", "")

                    if not isinstance(sender, str) or not isinstance(text, str):
                        logger.error(f"Invalid field types in JS message — sender:{type(sender).__name__} text:{type(text).__name__}")
                        continue

                    # Enforce reasonable field lengths to prevent log/file bloat
                    sender     = sender[:100].strip() or "Unknown"
                    text       = text[:4000].strip()
                    message_id = str(message_id)[:128] if message_id else ""

                    if text:
                        self._create_inbox_file(sender, text, message_id)
                except json.JSONDecodeError:
                    logger.error(f"Malformed JSON from JS client: {raw_line[:200]!r}")

        except KeyboardInterrupt:
            logger.info("KeyboardInterrupt received — stopping.")
            self._stop_proc()
            return "clean_exit"

        finally:
            # Wait for stderr thread to finish draining
            stderr_thread.join(timeout=3)

        # ── Determine exit reason ─────────────────────────────────────────
        exit_code = self._proc.wait()
        self._proc = None

        if exit_code == 0:
            # Only treat as a true clean exit if the session ran long enough.
            # A very short "clean" exit (< 30s) means the event loop emptied
            # before the client was fully established — treat it as a crash.
            return "clean_exit"  # caller checks uptime separately

        # If stderr already flagged a specific reason, use it
        if crash_reason != "crash":
            return crash_reason

        # Scan buffered stderr for keywords we may have missed
        full_stderr = " ".join(stderr_lines).lower()
        if "browser is already running" in full_stderr:
            return "browser_running"
        if "auth failure" in full_stderr or "auth failed" in full_stderr:
            return "auth_failure"
        if "targetcloseerror" in full_stderr or "target closed" in full_stderr:
            return "target_closed"

        return "crash"

    # ── Main run loop (with restart logic) ───────────────────────────────────

    def run(self) -> None:
        _check_node_version()

        attempt = 0

        while True:
            # ── Pre-start cleanup ──────────────────────────────────────────
            _full_session_cleanup()

            start_time = time.monotonic()
            logger.info(
                f"Starting WhatsApp client (attempt {attempt + 1}/{MAX_RESTARTS})..."
            )

            crash_reason = self._run_once()
            uptime = time.monotonic() - start_time

            # ── Clean exit — only truly stop if it ran long enough ────────
            if crash_reason == "clean_exit":
                if uptime >= MIN_HEALTHY_UPTIME:
                    logger.info(f"WhatsApp client exited cleanly after {uptime:.0f}s.")
                    return
                else:
                    # Short clean exit = event loop emptied before client was
                    # stable. Treat as a crash so we restart.
                    logger.warning(
                        f"WhatsApp client exited cleanly but only ran {uptime:.1f}s "
                        f"(< {MIN_HEALTHY_UPTIME}s) — restarting as if crashed."
                    )
                    crash_reason = "crash"

            # ── Auth failure — no point retrying ──────────────────────────
            if crash_reason == "auth_failure":
                logger.critical(
                    "WhatsApp authentication failed. "
                    "Delete .wwebjs_auth/ and re-scan the QR code."
                )
                sys.exit(1)

            # ── Corrupted session (TargetCloseError) ───────────────────────
            # Chrome launched but the page crashed immediately — session data
            # is corrupted from a previous force-kill. Delete it and retry.
            # The next attempt will show a QR code for re-authentication.
            if crash_reason == "target_closed":
                logger.warning(
                    "TargetCloseError detected — session data is corrupted. "
                    "Deleting session and triggering fresh login..."
                )
                _clear_corrupted_session()

            # ── Reset attempt counter if the session was healthy ──────────
            if uptime >= MIN_HEALTHY_UPTIME:
                logger.info(
                    f"Session ran for {uptime:.0f}s (>{MIN_HEALTHY_UPTIME}s) "
                    "— resetting restart counter."
                )
                attempt = 0
            else:
                attempt += 1

            # ── Max attempts exceeded — give up ───────────────────────────
            if attempt >= MAX_RESTARTS:
                logger.critical(
                    f"WhatsApp client crashed {MAX_RESTARTS} times in a row. "
                    "Giving up. Fix the underlying issue and restart the system."
                )
                sys.exit(1)

            # ── Log reason and wait before retry ──────────────────────────
            reason_msg = {
                "browser_running": "Stale Chrome session — cleanup will run before next attempt.",
                "target_closed":   "Corrupted session — deleted profile, next attempt will show QR.",
                "crash":           f"Client crashed (uptime {uptime:.1f}s).",
            }.get(crash_reason, f"Unknown exit reason: {crash_reason}")

            logger.warning(
                f"Restart {attempt}/{MAX_RESTARTS} in {RESTART_DELAY}s — {reason_msg}"
            )
            time.sleep(RESTART_DELAY)


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    vault = PROJECT_ROOT / "vault" / "AI_Employee_Vault"
    WhatsAppWatcher(str(vault)).run()
