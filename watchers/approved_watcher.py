"""
approved_watcher.py
Monitors vault/AI_Employee_Vault/Approved/ for task files and executes them.

For LinkedIn posts:
- Detects LINKEDIN_POST_*.md files in Approved/linkedin/
- Calls linkedin_executor.run_linkedin_post() directly (Python)
- Auto-publishes, updates logs, moves to Done/

For email tasks:
- Calls send_email_executor.py directly (Python, no Claude spawn)

For WhatsApp / general tasks:
- Calls process_approved_executor.py directly (Python, no Claude spawn)

Run with:
    uv run watchers/approved_watcher.py
    (or: python watchers/approved_watcher.py)
"""

import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

RETRY_COOLDOWN = 600  # seconds before re-attempting a failed file (10 min)

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from vault_utils import load_processed, save_processed

# Import LinkedIn executor directly (no Claude spawn)
try:
    from linkedin_executor import run_linkedin_post
    LINKEDIN_EXECUTOR_AVAILABLE = True
except ImportError as e:
    print(f"[WARN] linkedin_executor not available: {e}")
    LINKEDIN_EXECUTOR_AVAILABLE = False


SEND_EMAIL_EXECUTOR     = ROOT / ".claude" / "commands" / "send_email_executor.py"
PROCESS_APPROVED_EXECUTOR = ROOT / ".claude" / "commands" / "process_approved_executor.py"


def _mcp_is_reachable(url: str = "http://localhost:8001/health", timeout: int = 3) -> bool:
    """Return True if the MCP server responds to a health check."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status < 500
    except Exception:
        return False


def run_send_email_executor(file_path: Path) -> None:
    """Send an approved email via send_email_executor.py (no Claude spawn)."""
    if not _mcp_is_reachable():
        print(f"[WARN] MCP server unreachable — skipping email send for: {file_path.name}. Will retry on next cycle.")
        return
    print(f"[AUTO] Sending email for: {file_path.name}")
    try:
        result = subprocess.run(
            [sys.executable, str(SEND_EMAIL_EXECUTOR), str(file_path)],
            cwd=str(ROOT),
            timeout=60,
        )
        if result.returncode != 0:
            print(f"[WARN] send_email_executor exited with code {result.returncode}.")
    except Exception as e:
        print(f"[ERROR] send_email_executor failed: {e}")


def run_process_approved_executor(file_path: Path) -> None:
    """Process an approved WhatsApp/general task via process_approved_executor.py (no Claude spawn)."""
    print(f"[AUTO] Processing approved task for: {file_path.name}")
    try:
        result = subprocess.run(
            [sys.executable, str(PROCESS_APPROVED_EXECUTOR), str(file_path)],
            cwd=str(ROOT),
            timeout=60,
        )
        if result.returncode != 0:
            print(f"[WARN] process_approved_executor exited with code {result.returncode}.")
    except Exception as e:
        print(f"[ERROR] process_approved_executor failed: {e}")


def run_linkedin_file(file_path: Path) -> None:
    """
    Process a LinkedIn post file.
    Uses direct Python executor (linkedin_executor.py) - no Claude spawn.
    """
    print(f"[WATCHER] LinkedIn file detected: {file_path.name}")

    if not LINKEDIN_EXECUTOR_AVAILABLE:
        print(f"[ERROR] linkedin_executor not available - cannot process {file_path.name}")
        return

    # Validate file is in correct location
    if "Approved" not in str(file_path) or "linkedin" not in str(file_path).lower():
        print(f"[ERROR] LinkedIn file not in Approved/linkedin/: {file_path}")
        return

    # Call the executor directly (Python function, no subprocess)
    try:
        result = run_linkedin_post(file_path)
        if result:
            print("[WATCHER] SUCCESS")
        else:
            print("[WATCHER] FAILED")
    except Exception as e:
        print(f"[ERROR] LinkedIn executor failed: {e}")
        # File stays in Approved/ for retry


# ── Paths ─────────────────────────────────────────────────────────────────────

APPROVED_ROOT   = ROOT / "vault" / "AI_Employee_Vault" / "Approved"
APPROVED_LINKEDIN = APPROVED_ROOT / "linkedin"
PROCESSED_FILE  = APPROVED_ROOT / ".processed_approved.json"
CHECK_INTERVAL  = 5  # seconds between scans


# ── Processed-set helpers ─────────────────────────────────────────────────────

def _load_processed() -> set:
    return load_processed(PROCESSED_FILE)


def _save_processed(processed: set):
    save_processed(PROCESSED_FILE, processed)


# ── Frontmatter quick-check ─────────────────────────────────────────────────────

def _is_completed(file_path: Path) -> bool:
    """Return True if the file's frontmatter already says status: completed."""
    try:
        text = file_path.read_text(encoding="utf-8")
        if not text.startswith("---"):
            return False
        end = text.find("---", 3)
        if end == -1:
            return False
        for line in text[3:end].splitlines():
            if "status" in line and "completed" in line:
                return True
    except Exception:
        pass
    return False


def _get_file_type(file_path: Path) -> str:
    """Detect file type from filename or frontmatter."""
    name = file_path.name.lower()

    # LinkedIn posts
    if name.startswith("linkedin_post_"):
        return "linkedin"

    # Email tasks
    if name.startswith("task_email_") or "email" in name:
        return "email"

    # WhatsApp tasks
    if name.startswith("task_whatsapp_") or "whatsapp" in name:
        return "whatsapp"

    # Check frontmatter
    try:
        text = file_path.read_text(encoding="utf-8")
        if text.startswith("---"):
            end = text.find("---", 3)
            if end != -1:
                frontmatter = text[3:end].lower()
                if "type: linkedin_post" in frontmatter:
                    return "linkedin"
                if "type: email_task" in frontmatter:
                    return "email"
                if "type: whatsapp_task" in frontmatter:
                    return "whatsapp"
    except Exception:
        pass

    return "unknown"


# ── Watcher loop ──────────────────────────────────────────────────────────────

def watch():
    print("[AUTO] -------------------------------------------")
    print("[AUTO]  Approved Watcher - started")
    print(f"[AUTO]  Watching : {APPROVED_ROOT}")
    print(f"[AUTO]  LinkedIn : {APPROVED_LINKEDIN}")
    print(f"[AUTO]  Interval : {CHECK_INTERVAL}s")
    print("[AUTO] -------------------------------------------")

    # Ensure directories exist
    APPROVED_ROOT.mkdir(parents=True, exist_ok=True)
    APPROVED_LINKEDIN.mkdir(parents=True, exist_ok=True)

    # Files successfully processed in previous runs (persisted to disk)
    persisted = _load_processed()

    # Files attempted in THIS run: name -> timestamp of last attempt
    # After RETRY_COOLDOWN seconds, a failed file is re-attempted automatically
    attempted_this_run: dict = {}

    while True:
        try:
            # Scan all subdirectories in Approved/
            all_files = []

            # LinkedIn files (highest priority - direct Python execution)
            if APPROVED_LINKEDIN.exists():
                all_files.extend(sorted(APPROVED_LINKEDIN.glob("LINKEDIN_POST_*.md")))

            # Email and WhatsApp tasks are handled exclusively by task_processor.py
            # to avoid race conditions and FileLock conflicts.

            # Process files in order
            for file_path in all_files:
                name = file_path.name
                full_path = str(file_path)

                print(f"[WATCHER] Detected file: {file_path}")

                # Skip if successfully processed in a previous run
                if name in persisted:
                    print(f"[SKIP] Already processed: {name}")
                    continue

                # Skip if we already attempted it recently (cooldown not expired)
                if name in attempted_this_run:
                    elapsed = time.time() - attempted_this_run[name]
                    if elapsed < RETRY_COOLDOWN:
                        continue
                    print(f"[RETRY] Cooldown expired ({elapsed:.0f}s) — retrying: {name}")

                # Skip files that are already marked completed
                if _is_completed(file_path):
                    print(f"[SKIP] Already completed: {name}")
                    persisted.add(name)
                    _save_processed(persisted)
                    continue

                print(f"\n[AUTO] -- New file ------------------------------")
                attempted_this_run[name] = time.time()

                # Determine file type and route accordingly
                file_type = _get_file_type(file_path)
                print(f"[WATCHER] File type detected: {file_type}")

                try:
                    if file_type == "linkedin":
                        # LinkedIn: Use direct Python executor (no Claude spawn)
                        run_linkedin_file(file_path)
                    elif file_type == "email":
                        # Email: Use direct Python executor (no Claude spawn)
                        run_send_email_executor(file_path)
                    elif file_type == "whatsapp":
                        # WhatsApp: Use direct Python executor (no Claude spawn)
                        run_process_approved_executor(file_path)
                    else:
                        # Unknown: Use direct Python executor (no Claude spawn)
                        print(f"[WARN] Unknown file type, trying process_approved_executor: {name}")
                        run_process_approved_executor(file_path)

                except Exception as e:
                    print(f"[ERROR] Unhandled exception for {name}: {e}")
                    continue

                # If the file is now gone (moved to Done/) → mark as fully done
                if not file_path.exists():
                    persisted.add(name)
                    _save_processed(persisted)
                    print(f"[AUTO] Marked as processed: {name}")
                else:
                    # File still in Approved/ → processing failed, leave for retry
                    print(f"[AUTO] File remains in Approved/ - will retry on restart: {name}")

        except Exception as e:
            print(f"[ERROR] Watcher loop error: {e}")

        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    watch()
