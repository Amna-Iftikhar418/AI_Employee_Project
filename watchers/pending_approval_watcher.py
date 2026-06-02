"""
watchers/pending_approval_watcher.py

Monitors Pending_Approval/email/ and Pending_Approval/whatsapp/ for new
TASK_*.md files.  When a new file arrives it shows a Windows Yes/No dialog
asking whether to move the task to the Approved/ folder.

  Yes  →  file is moved to Approved/{subdir}/ for the approved_watcher to execute
  No   →  file stays in Pending_Approval/ (manual cut-and-paste fallback)

The watcher asks only once per file.  If the system is not running, the user
can still move files manually — approved_watcher.py handles them either way.
"""

import ctypes
import json
import logging
import re
import shutil
import sys
import time
import yaml
from datetime import datetime
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────

_WATCHERS_DIR = Path(__file__).parent
if str(_WATCHERS_DIR) not in sys.path:
    sys.path.insert(0, str(_WATCHERS_DIR))
from audit_logger import log_action  # noqa: E402  TASK-8.4

VAULT       = Path(__file__).parent.parent / "vault" / "AI_Employee_Vault"
PENDING_DIR = VAULT / "Pending_Approval"
APPROVED_DIR = VAULT / "Approved"
LOGS_DIR    = VAULT / "Logs"
DASHBOARD   = VAULT / "Dashboard.md"
STATE_FILE  = PENDING_DIR / ".processed_pending_review.json"

REJECTED_DIR = VAULT / "Rejected"
PLANS_DIR    = VAULT / "Plans"
INBOX_DIR    = VAULT / "Inbox"
SUBDIRS        = ["email", "whatsapp", "odoo"]   # linkedin and social handled via web UI
CHECK_INTERVAL = 10                      # seconds between scans

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [pending_approval_watcher] %(levelname)s: %(message)s",
)
log = logging.getLogger(__name__)


# =============================================================================
# State helpers
# =============================================================================

def _load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"approved": [], "skipped": []}


def _save_state(state: dict) -> None:
    try:
        STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
    except Exception as e:
        log.warning(f"Could not save state: {e}")


# =============================================================================
# Windows dialog
# =============================================================================

def _ask_user(title: str, message: str) -> bool:
    """Show a Windows Yes/No message box.  Returns True if the user clicks Yes."""
    MB_YESNO      = 0x00000004
    MB_ICONQUESTION = 0x00000020
    MB_SYSTEMMODAL  = 0x00001000  # always-on-top
    result = ctypes.windll.user32.MessageBoxW(
        0, message, title,
        MB_YESNO | MB_ICONQUESTION | MB_SYSTEMMODAL,
    )
    return result == 6  # IDYES = 6


# =============================================================================
# File helpers
# =============================================================================

def _read_frontmatter(path: Path) -> dict:
    """Return key-value pairs from the YAML front-matter block."""
    try:
        text = path.read_text(encoding="utf-8")
        if not text.startswith("---"):
            return {}
        end = text.find("\n---", 3)
        if end == -1:
            return {}
        fm_text = text[3:end].strip()
        parsed = yaml.safe_load(fm_text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _append_log(subdir: str, filename: str, action: str) -> None:
    today    = datetime.now().strftime("%Y-%m-%d")
    log_file = LOGS_DIR / f"log_{today}.md"
    ts       = datetime.now().strftime("%H:%M:%S")
    entry    = f"\n- [{ts}] **Pending Approval Watcher** — {action}: `{filename}` ({subdir})\n"
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(entry)
    except Exception as e:
        log.warning(f"Could not write log: {e}")


def _cleanup_related_files(subdir: str, task_file: Path) -> None:
    """Remove related plan and inbox files when a task is approved or rejected."""
    try:
        content = task_file.read_text(encoding="utf-8")
    except Exception:
        return

    # Delete plan file
    task_name = task_file.stem
    if task_name.startswith("TASK_"):
        task_name = task_name[5:]

    plan_path = PLANS_DIR / subdir / f"PLAN_{task_name}.md"
    if plan_path.exists():
        plan_path.unlink()
        log.info(f"[CLEANUP] Deleted plan: {plan_path.name}")

    # Also check plan_reference in frontmatter
    plan_ref_match = re.search(r"plan_reference:\s*(.+)", content)
    if plan_ref_match:
        ref_name = plan_ref_match.group(1).strip()
        ref_path = PLANS_DIR / subdir / Path(ref_name).name
        if ref_path.exists():
            ref_path.unlink()
            log.info(f"[CLEANUP] Deleted referenced plan: {ref_path.name}")

    # Delete original inbox file
    orig_match = re.search(r"original_file:\s*(.+)", content)
    if orig_match:
        original_filename = orig_match.group(1).strip()
        inbox_file = INBOX_DIR / subdir / original_filename
        if inbox_file.exists():
            inbox_file.unlink()
            log.info(f"[CLEANUP] Deleted inbox file: {inbox_file.name}")
        # Also check Archive
        archive_file = INBOX_DIR / "Archive" / original_filename
        if archive_file.exists():
            archive_file.unlink()
            log.info(f"[CLEANUP] Deleted archived inbox file: {archive_file.name}")


def _append_dashboard(subdir: str, filename: str, action: str) -> None:
    ts    = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = f"\n| {ts} | {subdir} | {filename} | {action} |\n"
    try:
        with open(DASHBOARD, "a", encoding="utf-8") as f:
            f.write(entry)
    except Exception as e:
        log.warning(f"Could not update dashboard: {e}")


# =============================================================================
# Core scan loop
# =============================================================================

def _process_pending() -> None:
    state   = _load_state()
    seen    = set(state.get("approved", [])) | set(state.get("skipped", []))
    changed = False

    for subdir in SUBDIRS:
        pending_path  = PENDING_DIR / subdir
        approved_path = APPROVED_DIR / subdir

        if not pending_path.exists():
            continue

        # Collect both TASK_*.md and SOCIAL_POST_*.md (social subdir uses different naming)
        candidates = list(pending_path.glob("TASK_*.md"))
        if subdir == "social":
            candidates.extend(pending_path.glob("SOCIAL_POST_*.md"))
        candidates.sort(key=lambda p: p.name)

        for task_file in candidates:
            fname = task_file.name

            # Already answered once — skip
            if fname in seen:
                continue

            # File may have been manually moved between the scan and now
            if not task_file.exists():
                continue

            # Read metadata for a nicer dialog message
            meta    = _read_frontmatter(task_file)
            sender  = meta.get("sender", meta.get("from", ""))
            subject = meta.get("subject", "")

            # Build dialog text
            if subdir == "odoo":
                label = "ODOO"
                action  = meta.get("action", "")
                partner = meta.get("partner_name", "")
                amount  = meta.get("amount", "")
                product = meta.get("product", "")
                lines = ["New ODOO task is waiting for approval.", ""]
                lines.append(f"File:    {fname}")
                if action:
                    lines.append(f"Action:  {action}")
                if partner:
                    lines.append(f"Customer:{partner}")
                if product:
                    lines.append(f"Product: {product}")
                if amount:
                    lines.append(f"Amount:  ${amount}")
            elif subdir == "social":
                label     = "SOCIAL POST"
                platforms = meta.get("platforms", meta.get("platform", "facebook"))
                topic     = meta.get("topic", meta.get("subject", ""))
                message   = meta.get("message", "")
                image_url = meta.get("image_url", "")
                lines = ["New SOCIAL POST is waiting for approval.", ""]
                lines.append(f"File:      {fname}")
                lines.append(f"Platforms: {platforms}")
                if topic:
                    lines.append(f"Topic:     {topic}")
                if message:
                    preview = message[:120] + "..." if len(message) > 120 else message
                    lines.append(f"Preview:   {preview}")
                if image_url:
                    lines.append(f"Image:     {image_url}")
            else:
                label = "EMAIL" if subdir == "email" else "WHATSAPP"
                lines = [f"New {label} task is waiting for approval.", ""]
                lines.append(f"File:  {fname}")
                if sender:
                    lines.append(f"From:  {sender}")
                if subject:
                    lines.append(f"Subject:  {subject}")

            lines += ["", "Approve this task?", "",
                      "  Yes  →  Approve and process automatically",
                      "  No   →  Reject and clean up all related files"]

            dialog_text  = "\n".join(lines)
            noun = "Post" if subdir == "social" else "Task"
            dialog_title = f"AI Employee — Approve {label} {noun}"

            log.info(f"Prompting user for: {fname}")
            user_approved = _ask_user(dialog_title, dialog_text)

            if user_approved:
                try:
                    approved_path.mkdir(parents=True, exist_ok=True)
                    # Do NOT clean up the plan here — send_email_executor / process_approved_executor
                    # needs it after the file lands in Approved/. Cleanup happens post-execution.
                    dest = approved_path / fname
                    shutil.move(str(task_file), str(dest))
                    state.setdefault("approved", []).append(fname)
                    log.info(f"Approved and moved: {fname} → Approved/{subdir}/")
                    _append_log(subdir, fname, "Approved → moved to Approved/")
                    _append_dashboard(subdir, fname, "Approved via dialog")
                    log_action(  # TASK-8.4
                        action_type="hitl_approved",
                        actor="pending_approval_watcher",
                        target=fname,
                        parameters={"subdir": subdir},
                        approval_status="approved",
                        approved_by="human",
                        result="moved to Approved/",
                    )
                except Exception as e:
                    log.error(f"Failed to move {fname}: {e}")
                    # Don't add to seen — will retry next scan
                    continue
            else:
                try:
                    # Rejected: clean up related files and move to Rejected/
                    rejected_path = REJECTED_DIR / subdir
                    rejected_path.mkdir(parents=True, exist_ok=True)
                    _cleanup_related_files(subdir, task_file)
                    dest = rejected_path / fname
                    shutil.move(str(task_file), str(dest))
                    state.setdefault("skipped", []).append(fname)
                    log.info(f"Rejected and moved: {fname} → Rejected/{subdir}/")
                    _append_log(subdir, fname, "Rejected → moved to Rejected/ and cleaned up related files")
                    _append_dashboard(subdir, fname, "Rejected via dialog")
                    log_action(  # TASK-8.4
                        action_type="hitl_rejected",
                        actor="pending_approval_watcher",
                        target=fname,
                        parameters={"subdir": subdir},
                        approval_status="rejected",
                        approved_by="human",
                        result="moved to Rejected/",
                    )
                except Exception as e:
                    log.error(f"Failed to reject {fname}: {e}")
                    continue

            changed = True

    if changed:
        _save_state(state)


# =============================================================================
# Entry point
# =============================================================================

def main() -> None:
    log.info("Pending approval watcher started.")
    log.info(f"Watching: {PENDING_DIR / 'email'}  |  {PENDING_DIR / 'whatsapp'}  |  {PENDING_DIR / 'odoo'}")
    log.info(f"State file: {STATE_FILE}")

    while True:
        try:
            _process_pending()
        except Exception as e:
            log.error(f"Unexpected error: {e}", exc_info=True)
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    main()
