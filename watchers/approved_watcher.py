"""
approved_watcher.py
Monitors vault/AI_Employee_Vault/Approved/linkedin/ for LinkedIn post files and publishes them.

For LinkedIn posts:
- Detects LINKEDIN_POST_*.md files in Approved/linkedin/
- Calls linkedin_executor.run_linkedin_post() directly (Python)
- Auto-publishes, updates logs, moves to Done/

Email and WhatsApp tasks are handled exclusively by task_processor.py.
This watcher only processes LinkedIn posts.

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
MAX_RETRIES = 5       # maximum total attempts before a file is fatally rejected

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

# TASK-7.2: retry utilities
_WATCHERS_DIR = Path(__file__).parent
if str(_WATCHERS_DIR) not in sys.path:
    sys.path.insert(0, str(_WATCHERS_DIR))
from retry_handler import TransientError, with_retry, write_log_alert  # noqa: E402
from audit_logger import log_action  # noqa: E402  TASK-8.4

from vault_utils import load_processed, save_processed

# Import LinkedIn executor directly (no Claude spawn)
try:
    from linkedin_executor import run_linkedin_post
    LINKEDIN_EXECUTOR_AVAILABLE = True
except ImportError as e:
    print(f"[WARN] linkedin_executor not available: {e}")
    LINKEDIN_EXECUTOR_AVAILABLE = False

# Import Odoo executor directly (no Claude spawn)
try:
    from odoo_executor import run_odoo_task
    ODOO_EXECUTOR_AVAILABLE = True
except ImportError as e:
    print(f"[WARN] odoo_executor not available: {e}")
    ODOO_EXECUTOR_AVAILABLE = False

# Import Social executor directly (no Claude spawn)
try:
    from facebook_instagram_executor import run_social_post
    SOCIAL_EXECUTOR_AVAILABLE = True
except ImportError as e:
    print(f"[WARN] facebook_instagram_executor not available: {e}")
    SOCIAL_EXECUTOR_AVAILABLE = False


SEND_EMAIL_EXECUTOR     = ROOT / ".claude" / "commands" / "send_email_executor.py"
PROCESS_APPROVED_EXECUTOR = ROOT / ".claude" / "commands" / "process_approved_executor.py"


@with_retry(
    max_attempts=3,
    base_delay=1.0,
    max_delay=60.0,
    retryable=(TransientError,),
    log_domain="approved_watcher",
)
def _mcp_health_check(url: str = "http://localhost:8001/health", timeout: int = 3) -> bool:
    """Return True if the MCP server responds OK; raise TransientError on failure."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status < 500
    except (urllib.error.URLError, OSError) as exc:
        raise TransientError(f"MCP health check failed: {exc}") from exc


def _mcp_is_reachable(url: str = "http://localhost:8001/health", timeout: int = 3) -> bool:
    """Return True if the MCP server responds to a health check (with retry)."""
    try:
        return _mcp_health_check(url, timeout)
    except TransientError:
        write_log_alert("Email MCP server unreachable after 3 attempts", domain="approved_watcher")
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
        log_action(  # TASK-8.4
            action_type="linkedin_post_published",
            actor="approved_watcher",
            target=file_path.name,
            approval_status="approved",
            approved_by="human",
            result="success" if result else "failed",
        )
    except Exception as e:
        print(f"[ERROR] LinkedIn executor failed: {e}")
        log_action(  # TASK-8.4
            action_type="linkedin_post_published",
            actor="approved_watcher",
            target=file_path.name,
            approval_status="approved",
            approved_by="human",
            result=f"error: {e}",
        )
        # File stays in Approved/ for retry


# ── Paths ─────────────────────────────────────────────────────────────────────

APPROVED_ROOT     = ROOT / "vault" / "AI_Employee_Vault" / "Approved"
APPROVED_LINKEDIN = APPROVED_ROOT / "linkedin"
APPROVED_ODOO     = APPROVED_ROOT / "odoo"
APPROVED_SOCIAL   = APPROVED_ROOT / "social"
PROCESSED_FILE    = APPROVED_ROOT / ".processed_approved.json"
CHECK_INTERVAL    = 5  # seconds between scans


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

    # Odoo tasks
    if name.startswith("task_odoo_"):
        return "odoo"

    # Social posts (Facebook/Instagram)
    if name.startswith("social_post_"):
        return "social"

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
                if "type: odoo_task" in frontmatter:
                    return "odoo"
                if "type: social_post" in frontmatter:
                    return "social"
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
    APPROVED_ODOO.mkdir(parents=True, exist_ok=True)
    APPROVED_SOCIAL.mkdir(parents=True, exist_ok=True)

    # Files successfully processed in previous runs (persisted to disk)
    persisted = _load_processed()

    # Files attempted in THIS run: name -> timestamp of last attempt
    # After RETRY_COOLDOWN seconds, a failed file is re-attempted automatically
    attempted_this_run: dict = {}

    # Total retry counts: name -> int. Persists across cooldown cycles.
    retry_counts: dict = {}

    while True:
        try:
            # Scan all subdirectories in Approved/
            all_files = []

            # LinkedIn files (highest priority - direct Python execution)
            if APPROVED_LINKEDIN.exists():
                all_files.extend(sorted(APPROVED_LINKEDIN.glob("LINKEDIN_POST_*.md")))

            # Odoo tasks — handled by odoo_handler skill (TASK-2); collected here for routing
            if APPROVED_ODOO.exists():
                all_files.extend(sorted(APPROVED_ODOO.glob("TASK_odoo_*.md")))

            # Social tasks — handled by facebook_instagram_poster skill (TASK-3); collected here for routing
            if APPROVED_SOCIAL.exists():
                all_files.extend(sorted(APPROVED_SOCIAL.glob("SOCIAL_POST_*.md")))

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

                # Circuit-breaker: give up after MAX_RETRIES total attempts
                if retry_counts.get(name, 0) >= MAX_RETRIES:
                    print(f"[FATAL] {name} has failed {MAX_RETRIES} times — moving to Rejected/")
                    subdir = file_path.parent.name
                    rejected_dir = ROOT / "vault" / "AI_Employee_Vault" / "Rejected" / subdir
                    rejected_dir.mkdir(parents=True, exist_ok=True)
                    dest = rejected_dir / name
                    try:
                        file_path.replace(dest)
                        print(f"[FATAL] Moved to: {dest}")
                    except Exception as move_err:
                        print(f"[FATAL] Could not move file: {move_err}")
                    persisted.add(name)
                    _save_processed(persisted)
                    continue

                # Skip files that are already marked completed
                if _is_completed(file_path):
                    print(f"[SKIP] Already completed: {name}")
                    persisted.add(name)
                    _save_processed(persisted)
                    continue

                print(f"\n[AUTO] -- New file ------------------------------")
                attempted_this_run[name] = time.time()
                retry_counts[name] = retry_counts.get(name, 0) + 1

                # Only LinkedIn files reach this point — all_files is built exclusively
                # from APPROVED_LINKEDIN.glob("LINKEDIN_POST_*.md").
                # Email and WhatsApp tasks are handled by task_processor.py.
                file_type = _get_file_type(file_path)
                print(f"[WATCHER] File type detected: {file_type}")

                try:
                    if file_type == "linkedin":
                        # LinkedIn: Use direct Python executor (no Claude spawn)
                        run_linkedin_file(file_path)

                    elif file_type == "odoo":
                        # Odoo: Use direct Python executor (no Claude spawn)
                        if ODOO_EXECUTOR_AVAILABLE:
                            run_odoo_task(file_path)
                        else:
                            print(f"[ERROR] odoo_executor not available — cannot process {file_path.name}")

                    elif file_type == "social":
                        # Social (Facebook/Instagram): Use direct Python executor (no Claude spawn)
                        if SOCIAL_EXECUTOR_AVAILABLE:
                            run_social_post(file_path)
                        else:
                            print(f"[ERROR] facebook_instagram_executor not available — cannot process {file_path.name}")

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
