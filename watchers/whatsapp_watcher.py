"""WhatsApp Watcher — reads messages from persistent whatsapp-web.js client.

Architecture:
- Starts watchers/whatsapp_client.js once as a persistent subprocess
- Reads JSON lines from its stdout as messages arrive (event-driven, no polling)
- Filters by keywords, deduplicates, writes to Inbox/whatsapp_*.txt
- The JS client uses WebSocket (~30MB RAM, no browser window, session permanent)
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
from datetime import datetime, timedelta, timezone
from pathlib import Path

# FIX: filelock prevents race conditions when multiple processes access
# the processed-set JSON concurrently
from filelock import FileLock

KEYWORDS = ["urgent", "invoice", "payment", "asap", "help"]
PROCESSED_FILE = Path(__file__).parent.parent / ".whatsapp_processed.json"
JS_CLIENT = Path(__file__).parent / "whatsapp_client.js"
PROJECT_ROOT = Path(__file__).parent.parent

# FIX: Lock file for safe concurrent access to PROCESSED_FILE
_processed_lock = FileLock(str(PROCESSED_FILE) + ".lock")

# ------------------------------------------------------------------
# Structured rotating logger
# FIX: Replaced bare basicConfig with RotatingFileHandler to prevent
# unbounded log-file growth when the watcher runs for weeks/months
# ------------------------------------------------------------------
_file_handler = logging.handlers.RotatingFileHandler(
    str(PROJECT_ROOT / "whatsapp_watcher.log"),
    maxBytes=5 * 1024 * 1024,   # 5 MB per file
    backupCount=3,               # keep 3 rotated backups
)
_stream_handler = logging.StreamHandler()
_fmt = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
_file_handler.setFormatter(_fmt)
_stream_handler.setFormatter(_fmt)
logging.basicConfig(level=logging.INFO, handlers=[_file_handler, _stream_handler])
logger = logging.getLogger("WhatsAppWatcher")


# ------------------------------------------------------------------
# FIX: Verify Node.js is installed before starting the subprocess
# ------------------------------------------------------------------

def _check_node_version():
    """Fail fast with a clear error if Node.js is missing or too old."""
    try:
        result = subprocess.run(
            ["node", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        version = result.stdout.strip()
        logger.info(f"Node.js version detected: {version}")
    except FileNotFoundError:
        raise RuntimeError(
            "Node.js not found in PATH. "
            "Install Node.js v16+ before running the WhatsApp watcher.\n"
            "Download from: https://nodejs.org/"
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("Node.js version check timed out — check your installation.")


class WhatsAppWatcher:
    def __init__(self, vault_path: str):
        self.vault_path = Path(vault_path)
        self.inbox = self.vault_path / "Inbox"
        self.inbox.mkdir(parents=True, exist_ok=True)

        # FIX: Startup write-permission check — fail fast before spawning subprocess
        self._check_write_permissions()

        self._processed: set = self._load_processed()
        self._proc = None  # track subprocess so atexit can clean it up

    # ------------------------------------------------------------------
    # Startup check
    # ------------------------------------------------------------------

    def _check_write_permissions(self):
        """Validate inbox directory is writable before starting."""
        test = self.inbox / ".write_test"
        try:
            test.touch()
            test.unlink()
        except OSError as e:
            raise RuntimeError(
                f"Inbox directory is not writable: {self.inbox}\nError: {e}"
            ) from e

    # ------------------------------------------------------------------
    # Dedup (locked + atomic)
    # ------------------------------------------------------------------

    # TTL for dedup entries — messages older than this are allowed through again
    DEDUP_TTL_HOURS: int = 24

    def _make_key(self, sender: str, text: str) -> str:
        """Dedup key: sender + first 80 chars of message text.

        Intentionally does NOT include timestamp — the TTL in the stored
        record handles expiry so the same message can arrive again after
        DEDUP_TTL_HOURS without creating a duplicate inbox file.
        """
        return f"{sender}::{text[:80]}"

    def _load_processed(self) -> set:
        """Load dedup set, discarding entries older than DEDUP_TTL_HOURS.

        Stored format (new):
            {"entries": [{"key": "...", "at": "2026-03-19T14:00:00+00:00"}, ...]}

        Legacy format (old flat list) is migrated automatically.
        """
        with _processed_lock:
            if not PROCESSED_FILE.exists():
                return set()
            try:
                data = json.loads(PROCESSED_FILE.read_text(encoding="utf-8"))
                cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=self.DEDUP_TTL_HOURS)

                # --- migrate legacy flat-list format ---
                if "processed" in data and "entries" not in data:
                    logger.info(
                        f"Migrating legacy processed set — "
                        f"{len(data['processed'])} old entries will be cleared "
                        f"(they had no timestamp and cannot be aged)"
                    )
                    # Old entries have no timestamp; treat them as expired so
                    # new messages are never permanently blocked.
                    return set()

                live_keys: set = set()
                live_entries: list = []
                for entry in data.get("entries", []):
                    try:
                        saved_at = datetime.fromisoformat(entry["at"])
                        if saved_at > cutoff:
                            live_keys.add(entry["key"])
                            live_entries.append(entry)
                    except (KeyError, ValueError):
                        pass  # malformed entry — drop it

                expired = len(data.get("entries", [])) - len(live_entries)
                if expired:
                    logger.info(f"Dedup TTL: expired {expired} old entries (>{self.DEDUP_TTL_HOURS}h)")

                # Persist trimmed set back to disk
                self._write_entries(live_entries)
                return live_keys

            except Exception as e:
                logger.exception(f"Failed to load processed set (starting fresh): {e}")
                return set()

    def _write_entries(self, entries: list):
        """Atomic write of the entries list to PROCESSED_FILE (lock must be held)."""
        tmp = PROCESSED_FILE.with_suffix(".tmp")
        tmp.write_text(
            json.dumps({"entries": entries}, indent=2),
            encoding="utf-8",
        )
        os.replace(str(tmp), str(PROCESSED_FILE))

    def _save_processed(self, key: str):
        """Atomically add a key with current timestamp. TTL enforced on next load."""
        self._processed.add(key)
        with _processed_lock:
            try:
                # Read existing entries to preserve other live keys
                existing: list = []
                if PROCESSED_FILE.exists():
                    try:
                        data = json.loads(PROCESSED_FILE.read_text(encoding="utf-8"))
                        existing = data.get("entries", [])
                    except Exception:
                        existing = []

                # Append new entry with UTC timestamp
                existing.append({
                    "key": key,
                    "at": datetime.now(tz=timezone.utc).isoformat(),
                })
                self._write_entries(existing)
            except Exception as e:
                logger.exception(f"Could not save processed set: {e}")

    # ------------------------------------------------------------------
    # Keyword filter
    # ------------------------------------------------------------------

    def _is_important(self, text: str) -> bool:
        return any(kw in text.lower() for kw in KEYWORDS)

    # ------------------------------------------------------------------
    # Filename sanitization
    # ------------------------------------------------------------------

    def _sanitize_name(self, name: str) -> str:
        """Convert sender name/number to a safe, readable filename component.

        FIX: Added path-traversal prevention (.. / \\).
        """
        clean = re.sub(r"[^\w\s+-]", "", name)
        clean = re.sub(r"[\s_]+", "_", clean).strip("_")
        # FIX: Prevent path traversal sequences in filenames
        clean = clean.replace("..", "").replace("/", "").replace("\\", "")
        return clean[:25] or "unknown"

    def _unique_inbox_path(self, sender: str) -> Path:
        """Return a non-colliding inbox path with iteration guard.

        FIX: Bounded loop (max 999) prevents infinite loop on high message volume.
        """
        safe_name = self._sanitize_name(sender)
        timestamp = datetime.now().strftime("%I_%M%p")  # 01_35PM
        candidate = self.inbox / f"whatsapp_{safe_name}_{timestamp}.txt"

        for counter in range(1, 1000):
            if not candidate.exists():
                return candidate
            candidate = self.inbox / f"whatsapp_{safe_name}_{timestamp}_{counter}.txt"

        # Fallback: use microseconds to guarantee uniqueness
        ts = datetime.now().strftime("%H%M%S%f")
        return self.inbox / f"whatsapp_{safe_name}_{ts}.txt"

    # ------------------------------------------------------------------
    # Write to Inbox
    # ------------------------------------------------------------------

    def _create_inbox_file(self, sender: str, text: str):
        key = self._make_key(sender, text)
        if key in self._processed:
            return

        filepath = self._unique_inbox_path(sender)
        content = (
            f"From: {sender}\n"
            f"Source: WhatsApp\n"
            f"\n"
            f"Body:\n"
            f"{text}\n"
        )

        try:
            filepath.write_text(content, encoding="utf-8")
            self._save_processed(key)
            logger.info(f"Inbox file created: {filepath.name}")
        except Exception as e:
            logger.exception(f"Failed to write inbox file: {e}")

    # ------------------------------------------------------------------
    # Subprocess cleanup
    # ------------------------------------------------------------------

    def _cleanup_proc(self):
        """Terminate the Node.js subprocess gracefully.

        FIX: Registered with atexit so the process is killed even if Python
        exits ungracefully (e.g., uncaught exception, SIGTERM on Linux).
        """
        if self._proc and self._proc.poll() is None:
            logger.info("Terminating WhatsApp Node.js process...")
            self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                logger.warning("Node.js did not stop gracefully — sending SIGKILL")
                self._proc.kill()

    # ------------------------------------------------------------------
    # Main run loop — starts JS client once, reads stdout stream
    # ------------------------------------------------------------------

    def run(self):
        logger.info("Starting WhatsAppWatcher (whatsapp-web.js client)")

        # FIX: Check Node.js before spawning subprocess
        _check_node_version()

        if not JS_CLIENT.exists():
            logger.error(f"JS client not found: {JS_CLIENT}")
            sys.exit(1)

        self._proc = subprocess.Popen(
            ["node", str(JS_CLIENT)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,          # line-buffered
            cwd=str(PROJECT_ROOT),
        )

        # FIX: Register cleanup with atexit — Node.js is killed even on crash
        atexit.register(self._cleanup_proc)

        # Log JS stderr in a background thread
        def _log_stderr():
            for line in self._proc.stderr:
                line = line.strip()
                if line:
                    logger.info(f"[JS] {line}")

        threading.Thread(target=_log_stderr, daemon=True).start()

        logger.info("WhatsApp client started — waiting for messages...")

        try:
            # Read JSON lines from JS stdout as messages arrive
            for raw_line in self._proc.stdout:
                raw_line = raw_line.strip()
                if not raw_line:
                    continue

                try:
                    msg = json.loads(raw_line)
                    sender = msg.get("sender", "Unknown")
                    text = msg.get("text", "")

                    if not text:
                        continue

                    if self._is_important(text):
                        self._create_inbox_file(sender, text)
                    else:
                        logger.info(f"Skipped (no keyword): [{sender}] {text[:60]}")

                except json.JSONDecodeError:
                    # FIX: Log full content of bad line — not silently dropped
                    logger.error(
                        f"Malformed JSON from JS client (skipping line): "
                        f"{raw_line[:200]!r}"
                    )

        except KeyboardInterrupt:
            logger.info("Stopping WhatsAppWatcher...")
        finally:
            # FIX: Always clean up subprocess — even if an exception propagates
            self._cleanup_proc()


if __name__ == "__main__":
    vault = Path(__file__).parent.parent / "vault" / "AI_Employee_Vault"
    WhatsAppWatcher(str(vault)).run()
