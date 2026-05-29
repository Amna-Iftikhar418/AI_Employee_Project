"""
process_approved_executor.py
============================
Standalone executor for approved WhatsApp and general tasks.

Reads an approved task from vault/AI_Employee_Vault/Approved/,
finds the corresponding Plan, logs the action, updates the Dashboard,
and moves the task to Done/.

Usage:
    python .claude/commands/process_approved_executor.py <task_file_path>

Environment:
    DRY_RUN — optional, set to "true" to skip move-to-done

Exit codes:
    0  success
    1  failure
"""

import json
import logging
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from filelock import FileLock

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))
from vault_utils import parse_frontmatter

load_dotenv()

DRY_RUN = os.getenv("DRY_RUN", "false").strip().lower() == "true"

VAULT        = ROOT / "vault" / "AI_Employee_Vault"
APPROVED_DIR = VAULT / "Approved"
DONE_DIR     = VAULT / "Done"
PLANS_DIR    = VAULT / "Plans"
LOGS_DIR     = VAULT / "Logs"
DASHBOARD    = VAULT / "Dashboard.md"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - process_approved_executor - %(levelname)s - %(message)s",
)
logger = logging.getLogger("process_approved_executor")


def _extract_section(markdown: str, header: str) -> str:
    pattern = rf"##\s+{re.escape(header)}\s*\n(.*?)(?=\n##\s|\Z)"
    match = re.search(pattern, markdown, re.DOTALL | re.IGNORECASE)
    return match.group(1).strip() if match else ""


def _detect_subdir(task_file: Path) -> str:
    name = task_file.name.lower()
    if "whatsapp" in name:
        return "whatsapp"
    try:
        text = task_file.read_text(encoding="utf-8")
        meta, _ = parse_frontmatter(text)
        src = meta.get("type", "") + " " + meta.get("source", "")
        if "whatsapp" in src.lower():
            return "whatsapp"
    except Exception:
        pass
    return "unknown"


def _load_plan(task_name: str, subdir: str) -> dict:
    """Try to find a Plan file; return empty dict if not found (non-fatal)."""
    candidates = [
        PLANS_DIR / subdir / f"PLAN_{task_name}.md",
        PLANS_DIR / f"PLAN_{task_name}.md",
    ]
    for path in candidates:
        if path.exists():
            text = path.read_text(encoding="utf-8")
            _, body = parse_frontmatter(text)
            proposed = (
                _extract_section(body, "Proposed Response")
                or _extract_section(body, "Proposed Reply")
                or _extract_section(body, "Response")
            )
            return {"plan_file": path.name, "proposed_response": proposed}
    return {"plan_file": None, "proposed_response": ""}


def _write_log(task_name: str, action: str, details: list, status: str):
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    today     = datetime.now().strftime("%Y-%m-%d")
    timestamp = datetime.now().isoformat(timespec="seconds")
    log_file  = LOGS_DIR / f"log_{today}.md"
    lock_path = str(log_file.resolve()) + ".lock"

    detail_lines = "\n".join(f"  - {d}" for d in details)
    entry = f"""
## {timestamp} — {task_name} [{action}]

- Task: TASK_{task_name}.md
- Status: {status}
- Actions Performed:
{detail_lines}
"""
    with FileLock(lock_path, timeout=10):
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(entry)
    logger.info(f"Log written: {log_file.name}")


def _update_dashboard(task_name: str, subdir: str, dry_run: bool):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    mode  = " [DRY RUN]" if dry_run else ""
    entry = (
        f"\n## Recent Activity\n\n"
        f"- Task processed{mode}: {task_name}\n"
        f"- Type: {subdir}\n"
        f"- Executed by: process_approved skill\n"
        f"- Date: {timestamp}\n"
    )
    lock_path = str(DASHBOARD.resolve()) + ".lock"
    with FileLock(lock_path, timeout=10):
        with open(DASHBOARD, "a", encoding="utf-8") as f:
            f.write(entry)
    logger.info("Dashboard updated")


def _move_to_done(task_file: Path, subdir: str) -> Path:
    done_subdir = DONE_DIR / subdir
    done_subdir.mkdir(parents=True, exist_ok=True)
    dest = done_subdir / task_file.name
    if not DRY_RUN:
        shutil.move(str(task_file), str(dest))
        logger.info(f"Moved to Done/{subdir}/: {task_file.name}")
    else:
        logger.info(f"[DRY RUN] Would move to Done/{subdir}/: {task_file.name}")
    return dest


def _cleanup_related(task_meta: dict, task_name: str, subdir: str, plan_file: str | None):
    inbox_dir      = VAULT / "Inbox" / subdir
    archive_dir    = VAULT / "Inbox" / "Archive"
    needs_action   = VAULT / "Needs_Action" / subdir
    plans_subdir   = PLANS_DIR / subdir

    original = task_meta.get("original_file", "")
    if original:
        for d in (inbox_dir, archive_dir):
            f = d / original
            if f.exists():
                f.unlink()
                logger.info(f"[CLEANUP] Deleted: {f}")

    na_file = needs_action / f"TASK_{task_name}.md"
    if na_file.exists():
        na_file.unlink()
        logger.info(f"[CLEANUP] Deleted from Needs_Action: {na_file.name}")

    if plan_file:
        p = plans_subdir / plan_file
        if p.exists():
            p.unlink()
            logger.info(f"[CLEANUP] Deleted plan: {p.name}")

    derived = plans_subdir / f"PLAN_{task_name}.md"
    if derived.exists():
        derived.unlink()
        logger.info(f"[CLEANUP] Deleted derived plan: {derived.name}")


def run(task_path_str: str) -> int:
    task_path = Path(task_path_str)
    task_file = task_path if task_path.is_absolute() else APPROVED_DIR / task_path_str

    try:
        if not task_file.exists():
            raise FileNotFoundError(f"Task file not found: {task_file}")

        logger.info(f"Processing approved task: {task_file.name}")

        text = task_file.read_text(encoding="utf-8")
        meta, _ = parse_frontmatter(text)

        subdir    = _detect_subdir(task_file)
        task_name = task_file.stem.removeprefix("TASK_")

        plan = _load_plan(task_name, subdir)
        if plan["plan_file"]:
            logger.info(f"Plan found: {plan['plan_file']}")
        else:
            logger.warning(f"No Plan file found for {task_name} — proceeding without plan")

        mode_label = " [DRY RUN]" if DRY_RUN else ""
        _write_log(
            task_name=task_name,
            action=f"TASK PROCESSED{mode_label}",
            details=[
                f"Type: {subdir}",
                f"Plan: {plan['plan_file'] or 'not found'}",
                f"Proposed response length: {len(plan['proposed_response'])} chars",
                f"Dry run: {DRY_RUN}",
            ],
            status="completed",
        )

        _update_dashboard(task_name, subdir, DRY_RUN)
        done_path = _move_to_done(task_file, subdir)
        _cleanup_related(meta, task_name, subdir, plan["plan_file"])

        output = {
            "success": True,
            "task": task_file.name,
            "type": subdir,
            "plan": plan["plan_file"],
            "dry_run": DRY_RUN,
            "moved_to": f"Done/{subdir}/{task_file.name}",
        }
        print(json.dumps(output, indent=2))
        return 0

    except Exception as e:
        logger.error(f"FAILED: {e}")
        error_output = {"success": False, "task": task_file.name, "error": str(e)}
        print(json.dumps(error_output, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "Usage: python .claude/commands/process_approved_executor.py <task_file_path>",
            file=sys.stderr,
        )
        sys.exit(1)
    sys.exit(run(sys.argv[1]))
