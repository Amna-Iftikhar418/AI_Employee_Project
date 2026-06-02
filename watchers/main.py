"""
watchers/main.py
Production-grade launcher for the AI Employee system.

Guarantees:
  - Single instance via a PID lock file
  - OneDrive detection warning on startup
  - Auto port cleanup (kills whatever holds port 8001)
  - WhatsApp Chrome SingletonLock removed before start
  - Graceful SIGINT / SIGTERM shutdown (no zombie processes)
  - Crashed child processes are automatically restarted
"""

import atexit
import logging
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("MainLauncher")

# ── Paths ─────────────────────────────────────────────────────────────────────

ROOT          = Path(__file__).parent.parent
LOCK_FILE     = ROOT / ".ai_employee.pid"
WHATSAPP_LOCK = ROOT / ".wwebjs_auth" / "session" / "SingletonLock"
MCP_PORT      = 8001

# Odoo ERP backend (the database-backed server on port 8069 — separate from the
# stdio Odoo *MCP* server, which Claude Code launches from .mcp.json).
ODOO_DIR       = ROOT / "odoo"
ODOO_PYTHON    = ODOO_DIR / "odoo-venv" / "Scripts" / "python.exe"
ODOO_HTTP_PORT = 8069
POSTGRES_PORT  = 5432

# ── Child process registry ────────────────────────────────────────────────────

_processes: list[subprocess.Popen] = []


# =============================================================================
# 1. ONEDRIVE DETECTION
# =============================================================================

def _check_onedrive() -> None:
    """Warn if the project is running from inside a OneDrive-synced folder.

    OneDrive continuously syncs files in real-time. This causes:
      - PermissionError when writing temp/lock files (OneDrive holds file handles)
      - File locking conflicts between our FileLock and OneDrive's sync engine
      - Intermittent write failures on .processed_*.json files
      - Random 'Access is denied' errors on .write_test files

    This function does NOT stop the system — it warns the user and continues.
    If you see permission errors, move the project to the suggested safe path.
    """
    root_str = str(ROOT).lower()

    # Detect common OneDrive folder patterns
    onedrive_indicators = [
        "onedrive",
        "one drive",
        "skydrive",
    ]

    is_onedrive = any(indicator in root_str for indicator in onedrive_indicators)

    if is_onedrive:
        log.warning("=" * 60)
        log.warning("  WARNING  ONEDRIVE DETECTED — PERMISSION ISSUES LIKELY")
        log.warning("=" * 60)
        log.warning(f"  Current path : {ROOT}")
        log.warning("")
        log.warning("  Running inside OneDrive causes:")
        log.warning("    * PermissionError on .write_test files")
        log.warning("    * File locking conflicts with sync engine")
        log.warning("    * Random 'Access is denied' errors")
        log.warning("")
        log.warning("  RECOMMENDED FIX:")
        log.warning("    Move the project to: C:\\AI_Employee_Project")
        log.warning("")
        log.warning("  To move (run in PowerShell as Administrator):")
        log.warning("    xcopy /E /I /H /Y \"{}\" \"C:\\AI_Employee_Project\"".format(ROOT))
        log.warning("    cd C:\\AI_Employee_Project")
        log.warning("    uv run watchers/main.py")
        log.warning("")
        log.warning("  Continuing with OneDrive path — expect intermittent errors.")
        log.warning("=" * 60)
    else:
        log.info(f"Path check OK — not inside OneDrive: {ROOT}")


# =============================================================================
# 2. WRITE PERMISSION CHECK
# =============================================================================

def _check_vault_permissions() -> None:
    """Verify the vault directory is writable. Warn if not — do not crash.

    Checks the key directories that watchers write to.
    If a directory is not writable, logs a clear error and suggests the fix.
    """
    vault = ROOT / "vault" / "AI_Employee_Vault"
    dirs_to_check = [
        vault / "Inbox" / "email",
        vault / "Inbox" / "whatsapp",
        vault / "Needs_Action" / "email",
        vault / "Needs_Action" / "whatsapp",
        vault / "Approved" / "linkedin",
        vault / "Done" / "linkedin",
        vault / "Logs",
    ]

    any_failed = False
    for dir_path in dirs_to_check:
        try:
            dir_path.mkdir(parents=True, exist_ok=True)
            test_file = dir_path / ".write_test"
            test_file.touch()
            test_file.unlink()
        except OSError as e:
            log.error(f"[WRITE-CHECK] NOT writable: {dir_path}")
            log.error(f"[WRITE-CHECK] Error: {e}")
            any_failed = True

    if any_failed:
        log.error("=" * 60)
        log.error("  WRITE PERMISSION FAILURE DETECTED")
        log.error("  Some vault directories are not writable.")
        log.error("  If running from OneDrive, move to: C:\\AI_Employee_Project")
        log.error("  System will attempt to continue — expect failures.")
        log.error("=" * 60)
    else:
        log.info("Write permission check passed — all vault directories writable.")


# =============================================================================
# 3. SINGLE INSTANCE LOCK
# =============================================================================

def _acquire_instance_lock() -> None:
    """Prevent two copies of the system from running simultaneously."""
    if LOCK_FILE.exists():
        try:
            old_pid = int(LOCK_FILE.read_text().strip())
        except (ValueError, OSError):
            old_pid = None

        if old_pid:
            try:
                import psutil
                alive = psutil.pid_exists(old_pid)
            except ImportError:
                alive = False
                if sys.platform == "win32":
                    import ctypes
                    handle = ctypes.windll.kernel32.OpenProcess(0x0400, False, old_pid)
                    if handle:
                        ctypes.windll.kernel32.CloseHandle(handle)
                        alive = True

            if alive:
                log.error(
                    f"Another instance is already running (PID {old_pid}). "
                    "Stop it first with Ctrl+C, then restart."
                )
                sys.exit(1)
            else:
                log.info(f"Stale PID lock found (PID {old_pid} is gone) — overwriting.")

    LOCK_FILE.write_text(str(os.getpid()))
    log.info(f"Instance lock acquired (PID {os.getpid()})")


def _release_instance_lock() -> None:
    try:
        if LOCK_FILE.exists():
            LOCK_FILE.unlink()
            log.info("Instance lock released.")
    except OSError:
        pass


# =============================================================================
# 4. PORT CLEANUP
# =============================================================================

def _port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _free_port(port: int) -> None:
    log.warning(f"Port {port} is in use — attempting to free it...")
    try:
        import psutil
        pids_to_kill: set[int] = set()
        for conn in psutil.net_connections(kind="inet"):
            if conn.laddr.port == port and conn.pid:
                pids_to_kill.add(conn.pid)

        for pid in pids_to_kill:
            try:
                proc = psutil.Process(pid)
                log.info(f"Killing PID {pid} ({proc.name()}) on port {port}")
                proc.terminate()
                proc.wait(timeout=5)
            except psutil.NoSuchProcess:
                pass
            except psutil.TimeoutExpired:
                try:
                    proc.kill()
                    log.warning(f"Force-killed PID {pid} (did not stop in 5 s)")
                except psutil.NoSuchProcess:
                    pass
        return
    except ImportError:
        pass

    if sys.platform == "win32":
        try:
            netstat = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True, text=True, stderr=subprocess.DEVNULL
            )
            out = "\n".join(
                line for line in netstat.stdout.splitlines()
                if f":{port}" in line
            )
            for line in out.splitlines():
                parts = line.split()
                if parts and parts[-1].isdigit():
                    pid = int(parts[-1])
                    if pid > 0:
                        subprocess.run(
                            ["taskkill", "/F", "/PID", str(pid)],
                            capture_output=True
                        )
                        log.info(f"Killed PID {pid} holding port {port}")
                        break
        except subprocess.CalledProcessError:
            log.warning(f"Could not find process on port {port} via netstat.")


def _ensure_port_free(port: int) -> None:
    if not _port_in_use(port):
        log.info(f"Port {port} is free.")
        return

    _free_port(port)

    for _ in range(30):
        time.sleep(0.5)
        if not _port_in_use(port):
            time.sleep(2)
            log.info(f"Port {port} is now free.")
            return

    log.error(f"Port {port} still in use after 15 s — MCP server may fail to start.")


# =============================================================================
# 5. WHATSAPP SESSION CLEANUP
# =============================================================================

def _clear_whatsapp_lock() -> None:
    if WHATSAPP_LOCK.exists():
        try:
            WHATSAPP_LOCK.unlink()
            log.info("Removed stale WhatsApp Chrome SingletonLock.")
        except OSError as e:
            log.warning(f"Could not remove WhatsApp lock: {e}")
    else:
        log.info("WhatsApp Chrome lock is clean.")


# =============================================================================
# 6. PROCESS MANAGEMENT
# =============================================================================

def _spawn(cmd: list[str], cwd: Path | None = None) -> subprocess.Popen:
    workdir = str(cwd) if cwd is not None else str(ROOT)
    proc = subprocess.Popen(cmd, cwd=workdir)
    # Remember the working dir so _watch_loop restarts the child in the same
    # place (Odoo, for one, depends on cwd to resolve its relative addons_path).
    proc.cwd_override = workdir  # type: ignore[attr-defined]
    _processes.append(proc)
    log.info(f"Started (cwd={workdir}): {' '.join(cmd)}")
    return proc


def _shutdown(signum=None, frame=None) -> None:
    log.info("Shutting down AI Employee System...")

    for proc in _processes:
        if proc.poll() is None:
            try:
                proc.terminate()
            except OSError:
                pass

    for proc in _processes:
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                proc.kill()
            except OSError:
                pass

    _release_instance_lock()
    log.info("All processes stopped. Goodbye.")
    sys.exit(0)


# =============================================================================
# 7. STARTUP SEQUENCE
# =============================================================================

def _startup_checks() -> None:
    """Run all pre-launch checks and cleanups."""
    log.info("=" * 55)
    log.info("  AI Employee System — Starting up")
    log.info("=" * 55)

    _acquire_instance_lock()
    _check_onedrive()          # Warn if inside OneDrive
    _check_vault_permissions() # Warn if vault dirs not writable
    _ensure_port_free(MCP_PORT)
    _clear_whatsapp_lock()

    log.info("Startup checks complete — launching processes...")


def _wait_for_mcp_health(port: int, timeout: int = 30) -> bool:
    """Poll the Email MCP /health endpoint until it responds or timeout expires."""
    import urllib.request
    url = f"http://127.0.0.1:{port}/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(1)
    return False


def _wait_for_port(port: int, timeout: int = 30) -> bool:
    """Poll a TCP port until something is listening or the timeout expires."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _port_in_use(port):
            return True
        time.sleep(1)
    return False


def _launch_odoo() -> None:
    """Start the Odoo ERP backend (port 8069), gated on PostgreSQL.

    Two things make this child different from the others:

    1. PostgreSQL gate — Odoo keeps all of its data in Postgres and will crash
       on boot if it cannot connect. We poll port 5432 first; if Postgres never
       comes up we SKIP Odoo (rather than spawn a process the watchdog would
       just crash-loop every 10 s) and tell the user to start Postgres.

    2. cwd fix — odoo.conf uses a *relative* `addons_path = addons`, which only
       resolves correctly when the process runs from the odoo/ directory, not
       the repo root. So we spawn it with cwd=ODOO_DIR.
    """
    if not ODOO_PYTHON.exists():
        log.warning(f"Odoo not found at {ODOO_PYTHON} — skipping Odoo launch.")
        return

    if _port_in_use(ODOO_HTTP_PORT):
        log.info(f"Odoo already listening on port {ODOO_HTTP_PORT} — not starting another.")
        return

    log.info(f"Waiting for PostgreSQL on port {POSTGRES_PORT}...")
    if not _wait_for_port(POSTGRES_PORT, timeout=30):
        log.error("=" * 60)
        log.error(f"  PostgreSQL not reachable on port {POSTGRES_PORT} after 30 s.")
        log.error("  Odoo cannot boot without it — SKIPPING Odoo launch.")
        log.error("  Start PostgreSQL, then restart this launcher.")
        log.error("=" * 60)
        return

    log.info(f"PostgreSQL is up on port {POSTGRES_PORT} — launching Odoo.")
    _spawn([str(ODOO_PYTHON), "odoo-bin", "-c", "odoo.conf"], cwd=ODOO_DIR)
    log.info(
        f"Odoo ERP starting on port {ODOO_HTTP_PORT} "
        "(boot takes ~30 s; logs in odoo/odoo.log)."
    )


def _launch_all() -> None:
    """Spawn every component in the correct order."""

    # ── Odoo ERP backend (port 8069, gated on PostgreSQL) ─────────────────────
    # Powers the dashboard's Odoo page and the odoo_handler skill. Started first
    # so its ~30 s boot overlaps with the rest of the pipeline coming up.
    _launch_odoo()

    # ── MCP Server 1: Email MCP (HTTP, port 8001) ─────────────────────────────
    # Sends emails via Gmail API. Started as a child process; auto-restarted by
    # _watch_loop() if it crashes.
    _spawn(["uv", "run", "mcp_server.py"])
    log.info(f"Waiting for Email MCP to bind port {MCP_PORT}...")
    if _wait_for_mcp_health(MCP_PORT, timeout=30):
        log.info(f"Email MCP is healthy on port {MCP_PORT}.")
    else:
        log.warning(
            f"Email MCP did not respond on port {MCP_PORT} within 30 s. "
            "Continuing — _watch_loop will restart it if needed."
        )

    # ── MCP Server 2: Odoo MCP (stdio, managed by Claude Code) ───────────────
    # Configured in .mcp.json; Claude Code starts it automatically via
    # `uv --directory mcp_servers/odoo_mcp run odoo-mcp`. No action needed here.
    log.info("Odoo MCP: stdio server — started automatically by Claude Code via .mcp.json.")

    # ── MCP Server 3: Social MCP (stdio, managed by Claude Code) ─────────────
    # Configured in .mcp.json; Claude Code starts it automatically via
    # `uv --directory mcp_servers/social_mcp run social-mcp`. No action needed here.
    log.info("Social MCP: stdio server — started automatically by Claude Code via .mcp.json.")

    # ── MCP Server 4: Browser MCP (stdio, managed by Claude Code) ────────────
    # Configured in .mcp.json; Claude Code starts it automatically via
    # `uv --directory mcp_servers/browser_mcp run browser-mcp`. No action needed here.
    # Provides: browser_navigate, browser_click, browser_fill_field, browser_screenshot, etc.
    # NOTE: Run `uv --directory mcp_servers/browser_mcp run playwright install chromium`
    #       once after first setup to install the Chromium binary.
    log.info("Browser MCP: stdio server — started automatically by Claude Code via .mcp.json.")

    _spawn(["uv", "run", "watchers/gmail_watcher.py"])
    _spawn(["uv", "run", "watchers/run_watcher.py"])
    _spawn(["uv", "run", "watchers/task_processor.py"])

    _spawn(["uv", "run", "watchers/whatsapp_watcher.py"])
    _spawn(["uv", "run", "watchers/whatsapp_inbox_watcher.py"])

    _spawn(["uv", "run", "watchers/approved_watcher.py"])
    _spawn(["uv", "run", "watchers/scheduler.py"])

    log.info("=" * 55)
    log.info("  All processes running. Press Ctrl+C to stop.")
    log.info("=" * 55)


def _write_restart_log(cmd_str: str, exit_code: int, delay: int) -> None:
    """TASK-7.5: Write a watchdog restart event to the vault daily log."""
    try:
        vault = ROOT / "vault" / "AI_Employee_Vault" / "Logs"
        vault.mkdir(parents=True, exist_ok=True)
        today    = time.strftime("%Y-%m-%d")
        ts       = time.strftime("%H:%M:%S")
        log_file = vault / f"log_{today}.md"
        entry = (
            f"\n[{ts}] [watchdog] RESTART: process crashed "
            f"(exit {exit_code}) — restarting in {delay}s — cmd: {cmd_str}\n"
        )
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(entry)
    except OSError:
        pass


def _watch_loop() -> None:
    """Keep main process alive and auto-restart any crashed child.

    TASK-7.5: Writes a restart event to vault Logs/ whenever a child process
    is detected as crashed and restarted.
    """
    RESTART_DELAYS = {
        "whatsapp_watcher": 30,
    }
    DEFAULT_RESTART_DELAY = 10

    while True:
        time.sleep(5)
        for i, proc in enumerate(_processes):
            if proc.poll() is not None:
                cmd_str = " ".join(str(a) for a in proc.args)
                delay   = DEFAULT_RESTART_DELAY
                for key, val in RESTART_DELAYS.items():
                    if key in cmd_str:
                        delay = val
                        break

                log.warning(
                    f"Process exited (code {proc.returncode}): {cmd_str} "
                    f"— restarting in {delay}s..."
                )

                # TASK-7.5: Persist the crash event to vault Logs/
                _write_restart_log(cmd_str, proc.returncode, delay)

                time.sleep(delay)

                if "mcp_server" in cmd_str:
                    _ensure_port_free(MCP_PORT)

                workdir = getattr(proc, "cwd_override", str(ROOT))
                new_proc = subprocess.Popen(proc.args, cwd=workdir)
                new_proc.cwd_override = workdir  # type: ignore[attr-defined]
                _processes[i] = new_proc
                log.info(f"Restarted: {cmd_str}")


# =============================================================================
# 8. ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)
    atexit.register(_release_instance_lock)

    _startup_checks()
    _launch_all()

    try:
        _watch_loop()
    except KeyboardInterrupt:
        _shutdown()
