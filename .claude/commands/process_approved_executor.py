"""
process_approved_executor.py
============================
Standalone executor for approved WhatsApp and general tasks.

Reads an approved task from vault/AI_Employee_Vault/Approved/,
verifies the corresponding PLAN file exists, updates task metadata,
writes a log entry, updates the Dashboard, and moves the task to Done/.

Usage:
    python .claude/commands/process_approved_executor.py <task_filepath>

Exit codes:
    0  success
    1  failure
"""

import json
import logging
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

from filelock import FileLock

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))
from vault_utils import parse_frontmatter, append_log, append_dashboard

# ── Vault paths ────────────────────────────────────────────────────────────────
VAULT       = ROOT / "vault" / "AI_Employee_Vault"
LOGS_DIR    = VAULT / "Logs"
DASHBOARD   = VAULT / "Dashboard.md"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - process_approved_executor - %(levelname)s - %(message)s",
)
logger = logging.getLogger("process_approved_executor")


def _resolve_plan(task_name: str, task_type: str) -> Path | None:
    """Find the PLAN file for this task, checking type-specific dirs first."""
    candidates = []
    if task_type == "whatsapp_task":
        candidates.append(VAULT / "Plans" / "whatsapp" / f"PLAN_{task_name}.md")
    candidates.append(VAULT / "Plans" / f"PLAN_{task_name}.md")
    for p in candidates:
        if p.exists():
            return p
    return None


def _resolve_done_dir(task_type: str) -> Path:
    if task_type == "whatsapp_task":
        return VAULT / "Done" / "whatsapp"
    return VAULT / "Done"


def _update_status(task_file: Path, extra_fields: dict) -> None:
    text = task_file.read_text(encoding="utf-8")
    text = re.sub(r"(^status:\s*)(\S+)", r"\g<1>completed", text, flags=re.MULTILINE)
    fm_close = text.find("\n---\n", text.find("---\n") + 3)
    if fm_close != -1:
        extras = "\n".join(f"{k}: {v}" for k, v in extra_fields.items())
        text = text[:fm_close] + "\n" + extras + text[fm_close:]
    task_file.write_text(text, encoding="utf-8")


def run(task_path_str: str) -> int:
    task_file = Path(task_path_str)
    if not task_file.is_absolute():
        task_file = ROOT / task_path_str

    task_name = None
    try:
        if not task_file.exists():
            raise FileNotFoundError(f"Task file not found: {task_file}")

        logger.info(f"Processing: {task_file.name}")

        text = task_file.read_text(encoding="utf-8")
        meta, _ = parse_frontmatter(text)
        task_type = meta.get("type", "")
        task_name = task_file.stem.removeprefix("TASK_")

        # Verify plan exists
        plan_file = _resolve_plan(task_name, task_type)
        if not plan_file:
            raise FileNotFoundError(
                f"Plan file not found for {task_name}. Cannot execute without plan."
            )
        logger.info(f"Plan found: {plan_file.name}")

        now = datetime.now().isoformat(timespec="seconds")

        # Update task metadata
        _update_status(task_file, {
            "executed_at": now,
            "executed_by": "process_approved_executor",
        })

        # Write log
        timestamp = datetime.now().strftime("%H:%M:%S")
        append_log(LOGS_DIR, (
            f"## {now} — {task_name} [EXECUTED]\n\n"
            f"- Task: {task_file.name}\n"
            f"- Plan Reference: {plan_file.name}\n"
            f"- Approval: confirmed by operator\n"
            f"- Actions Performed:\n"
            f"  - Task metadata updated to completed\n"
            f"  - File moved to Done\n"
            f"- Status: completed"
        ))

        # Update dashboard
        append_dashboard(DASHBOARD, (
            f"## Recent Activity\n\n"
            f"- Task approved and executed: {task_name}\n"
            f"- Type: {task_type or 'general'}\n"
            f"- Plan followed: {plan_file.name}\n"
            f"- Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        ))

        # Move to Done
        done_dir = _resolve_done_dir(task_type)
        done_dir.mkdir(parents=True, exist_ok=True)
        dest = done_dir / task_file.name
        shutil.move(str(task_file), str(dest))
        logger.info(f"Moved to Done: {dest.name}")

        print(json.dumps({"success": True, "task": task_file.name, "moved_to": str(dest)}))
        return 0

    except Exception as e:
        logger.error(f"FAILED: {e}")
        if task_name:
            now = datetime.now().isoformat(timespec="seconds")
            append_log(LOGS_DIR, (
                f"## {now} — {task_name} [FAILURE]\n\n"
                f"- Task: {task_file.name}\n"
                f"- Error: {e}\n"
                f"- Status: failed"
            ))
        print(json.dumps({"success": False, "task": str(task_file), "error": str(e)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python process_approved_executor.py <task_filepath>", file=sys.stderr)
        sys.exit(1)
    sys.exit(run(sys.argv[1]))
