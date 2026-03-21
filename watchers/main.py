"""
watchers/main.py
Production-grade launcher for the AI Employee system.

Guarantees:
  - Single instance via a PID lock file
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

# ── Child process registry ────────────────────────────────────────────────────

_processes: list[subprocess.Popen] = []


# =============================================================================
# 1. SINGLE INSTANCE LOCK
# =============================================================================

def _acquire_instance_lock() -> None:
    """Prevent two copies of the system from running simultaneously.

    Writes this process's PID to .ai_employee.pid.
    If a PID file already exists and that process is still alive → exit.
    If the process is dead (stale lock) → overwrite and continue.
    """
    if LOCK_FILE.exists():
        try:
            old_pid = int(LOCK_FILE.read_text().strip())
        except (ValueError, OSError):
            old_pid = None

        if old_pid:
            # Use psutil for cross-platform process existence check.
            # os.kill(pid, 0) is Unix-only and raises WinError 87 on Windows.
            try:
                import psutil
                alive = psutil.pid_exists(old_pid)
            except ImportError:
                # psutil not available — fall back to OpenProcess on Windows
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
    """Remove the PID lock file on exit."""
    try:
        if LOCK_FILE.exists():
            LOCK_FILE.unlink()
            log.info("Instance lock released.")
    except OSError:
        pass


# =============================================================================
# 2. PORT CLEANUP
# =============================================================================

def _port_in_use(port: int) -> bool:
    """Return True if something is already bound to the port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _free_port(port: int) -> None:
    """Kill ALL processes holding the given port.

    Uses psutil (kills every PID on the port, not just the first one).
    Falls back to netstat + taskkill on Windows if psutil is unavailable.
    """
    log.warning(f"Port {port} is in use — attempting to free it...")
    try:
        import psutil
        # Collect all unique PIDs bound to this port first, then kill them all.
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
        pass  # psutil not installed — fall back

    # Windows fallback: netstat + taskkill
    if sys.platform == "win32":
        try:
            out = subprocess.check_output(
                f'netstat -ano | findstr ":{port}"',
                shell=True, text=True, stderr=subprocess.DEVNULL
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
    """Check port; if busy, free it and wait up to 5 s for it to release."""
    if not _port_in_use(port):
        log.info(f"Port {port} is free.")
        return

    _free_port(port)

    # Wait up to 15 s — Windows ports can linger in TIME_WAIT state after kill
    for _ in range(30):          # 30 × 0.5 s = 15 s max
        time.sleep(0.5)
        if not _port_in_use(port):
            # Extra 2 s buffer: Windows has a brief window where the port tests
            # as free but the OS socket hasn't been fully torn down yet.
            # Attempting to bind immediately can still get WSAEADDRINUSE.
            time.sleep(2)
            log.info(f"Port {port} is now free.")
            return

    log.error(f"Port {port} still in use after 15 s — MCP server may fail to start.")


# =============================================================================
# 3. WHATSAPP SESSION CLEANUP
# =============================================================================

def _clear_whatsapp_lock() -> None:
    """Delete stale Chrome SingletonLock before starting WhatsApp client.

    A previous crash leaves this file behind, causing:
        'The browser is already running for .wwebjs_auth/session'
    Removing it lets the new Chrome process start cleanly.
    """
    if WHATSAPP_LOCK.exists():
        try:
            WHATSAPP_LOCK.unlink()
            log.info("Removed stale WhatsApp Chrome SingletonLock.")
        except OSError as e:
            log.warning(f"Could not remove WhatsApp lock: {e}")
    else:
        log.info("WhatsApp Chrome lock is clean.")


# =============================================================================
# 4. PROCESS MANAGEMENT
# =============================================================================

def _spawn(cmd: list[str]) -> subprocess.Popen:
    """Start a child process and register it for shutdown."""
    proc = subprocess.Popen(cmd, cwd=str(ROOT))
    _processes.append(proc)
    log.info(f"Started: {' '.join(cmd)}")
    return proc


def _shutdown(signum=None, frame=None) -> None:
    """Gracefully stop all child processes and release the instance lock.

    Called on Ctrl+C (SIGINT), SIGTERM, or normal exit via atexit.
    """
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
# 5. STARTUP SEQUENCE
# =============================================================================

def _startup_checks() -> None:
    """Run all pre-launch checks and cleanups."""
    log.info("=" * 55)
    log.info("  AI Employee System — Starting up")
    log.info("=" * 55)

    _acquire_instance_lock()
    _ensure_port_free(MCP_PORT)
    _clear_whatsapp_lock()

    log.info("Startup checks complete — launching processes...")


def _launch_all() -> None:
    """Spawn every component in the correct order."""

    # MCP email server must bind port 8001 before any watcher calls it
    _spawn(["uv", "run", "mcp_server.py"])
    log.info(f"Waiting 6 s for MCP server to bind port {MCP_PORT}...")
    time.sleep(6)

    # Gmail pipeline
    _spawn(["uv", "run", "watchers/gmail_watcher.py"])
    _spawn(["uv", "run", "watchers/run_watcher.py"])
    _spawn(["uv", "run", "watchers/task_processor.py"])

    # WhatsApp pipeline
    _spawn(["uv", "run", "watchers/whatsapp_watcher.py"])
    _spawn(["uv", "run", "watchers/whatsapp_inbox_watcher.py"])

    # LinkedIn auto-publisher
    _spawn(["uv", "run", "watchers/approved_watcher.py"])

    # Scheduler (daily LinkedIn post + Monday CEO briefing)
    _spawn(["uv", "run", "watchers/scheduler.py"])

    log.info("=" * 55)
    log.info("  All processes running. Press Ctrl+C to stop.")
    log.info("=" * 55)


def _watch_loop() -> None:
    """Keep the main process alive and auto-restart any crashed child.

    Restart delay prevents instant crash-loops:
    - whatsapp_watcher handles its own internal retries (12 s delay, 5 max)
      so when it exits here it has already exhausted its own retry budget;
      give it 30 s before the outer loop tries again.
    - All other processes get a 10 s cooldown.
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
                time.sleep(delay)

                # For the MCP server, ensure the port is free before restarting.
                # The previous instance may still hold the socket in TIME_WAIT.
                if "mcp_server" in cmd_str:
                    _ensure_port_free(MCP_PORT)

                new_proc = subprocess.Popen(proc.args, cwd=str(ROOT))
                _processes[i] = new_proc
                log.info(f"Restarted: {cmd_str}")


# =============================================================================
# 6. ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    # Register signal handlers for clean shutdown on Ctrl+C or system stop
    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    # atexit covers the edge case where Python exits without a signal
    atexit.register(_release_instance_lock)

    _startup_checks()
    _launch_all()

    try:
        _watch_loop()
    except KeyboardInterrupt:
        _shutdown()
