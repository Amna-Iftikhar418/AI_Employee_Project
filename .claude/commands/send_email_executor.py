"""
send_email_executor.py
======================
Standalone executor for the send_email skill.

Reads an approved email task from vault/AI_Employee_Vault/Approved/,
extracts reply details from the corresponding PLAN file, calls the
MCP email server, writes a log entry, and moves the task to Done/.

Usage:
    python skills/send_email_executor.py <task_filename>
    python skills/send_email_executor.py TASK_email_john_doe.txt.md

Environment:
    MCP_API_KEY    — required, loaded from .env
    MCP_SERVER_URL — optional, default http://localhost:8001
    DRY_RUN        — optional, set to "true" to skip actual HTTP call

Exit codes:
    0  success
    1  failure (error message printed to stderr)
"""

import json
import logging
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
from filelock import FileLock

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from vault_utils import parse_frontmatter

# ── Environment ──────────────────────────────────────────────────────────────
load_dotenv()

MCP_API_KEY = os.getenv("MCP_API_KEY")
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8001")
DRY_RUN = os.getenv("DRY_RUN", "false").strip().lower() == "true"

# ── Vault paths ───────────────────────────────────────────────────────────────
VAULT = Path("vault/AI_Employee_Vault")
APPROVED_DIR = VAULT / "Approved" / "email"
DONE_DIR = VAULT / "Done" / "email"
PLANS_DIR = VAULT / "Plans" / "email"
LOGS_DIR = VAULT / "Logs"
DASHBOARD = VAULT / "Dashboard.md"

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - send_email_executor - %(levelname)s - %(message)s",
)
logger = logging.getLogger("send_email_executor")



def extract_section(markdown: str, section_header: str) -> str:
    """Extract content between a ## header and the next ## header."""
    pattern = rf"##\s+{re.escape(section_header)}\s*\n(.*?)(?=\n##\s|\Z)"
    match = re.search(pattern, markdown, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return ""


# ── Task + Plan parsing ───────────────────────────────────────────────────────

def load_task(task_file: Path) -> dict:
    """Parse an approved task file and return relevant fields."""
    text = task_file.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(text)

    # Extract original sender from **From:** line in body
    sender_match = re.search(r"\*\*From:\*\*\s*(.+)", body)
    sender = sender_match.group(1).strip() if sender_match else meta.get("from", "")

    # Extract original subject
    subject_match = re.search(r"\*\*Subject:\*\*\s*(.+)", body)
    subject = subject_match.group(1).strip() if subject_match else ""

    return {
        "task_name": task_file.stem.removeprefix("TASK_"),
        "task_file": task_file.name,
        "type": meta.get("type", ""),
        "status": meta.get("status", ""),
        "plan_reference": meta.get("plan_reference", ""),
        "original_sender": sender,
        "original_subject": subject,
    }


def load_plan(task_name: str) -> dict:
    """Read the PLAN file and extract proposed response, to, and subject."""
    plan_file = PLANS_DIR / f"PLAN_{task_name}.md"

    if not plan_file.exists():
        raise FileNotFoundError(
            f"Plan file not found: {plan_file}\n"
            "The plan must exist before an email can be sent."
        )

    text = plan_file.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(text)

    # Recipient — from plan frontmatter "from:" field (the original sender we reply to)
    recipient = meta.get("from", "")

    original_subject = meta.get("subject", "")
    reply_subject = original_subject

    # Body — from the "## Proposed Response" section
    proposed_body = extract_section(body, "Proposed Response")
    if not proposed_body:
        # Fallback: try "Proposed Reply" or "Response" headings
        proposed_body = extract_section(body, "Proposed Reply") or extract_section(body, "Response")

    if proposed_body:
        # Strip any leading "Subject: ..." line — subject is sent separately, not in the body
        proposed_body = re.sub(r"^Subject:[^\n]*\n+", "", proposed_body, flags=re.IGNORECASE).strip()

    if not proposed_body:
        raise ValueError(
            f"No 'Proposed Response' section found in {plan_file}.\n"
            "The plan must contain a ## Proposed Response section with the reply text."
        )

    return {
        "plan_file": plan_file.name,
        "to": recipient,
        "subject": reply_subject,
        "body": proposed_body,
    }


# ── MCP call ──────────────────────────────────────────────────────────────────

def call_mcp_send_email(to: str, subject: str, body: str) -> dict:
    """Call the MCP server to send an email.

    Returns the JSON response dict.
    Raises on HTTP error or connection failure.
    """
    if not MCP_API_KEY:
        raise RuntimeError(
            "MCP_API_KEY is not set in environment. "
            "Add it to .env before running this skill."
        )

    if DRY_RUN:
        logger.info("DRY_RUN=true — skipping actual HTTP call")
        logger.info(f"  Would send to:      {to}")
        logger.info(f"  Would send subject: {subject}")
        logger.info(f"  Body length:        {len(body)} chars")
        return {
            "success": True,
            "message": f"[DRY RUN] Email to {to} would have been sent",
            "dry_run": True,
        }

    url = f"{MCP_SERVER_URL}/send-email"
    headers = {
        "X-API-Key": MCP_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {"to": to, "subject": subject, "body": body}

    logger.info(f"Calling MCP server: POST {url}")
    response = requests.post(url, json=payload, headers=headers, timeout=15)

    if response.status_code == 401:
        raise PermissionError("MCP server rejected request — invalid API key.")
    if response.status_code != 200:
        raise RuntimeError(
            f"MCP server returned HTTP {response.status_code}: {response.text}"
        )

    return response.json()


# ── Vault operations ──────────────────────────────────────────────────────────

def update_task_status(task_file: Path, new_status: str, extra_fields: dict = None):
    """Update status field in task frontmatter."""
    text = task_file.read_text(encoding="utf-8")
    text = re.sub(r"(^status:\s*)(\w+)", f"\\g<1>{new_status}", text, flags=re.MULTILINE)

    if extra_fields:
        # Append extra fields just before closing ---
        fm_close = text.find("\n---\n", text.find("---\n") + 3)
        if fm_close != -1:
            extras = "\n".join(f"{k}: {v}" for k, v in extra_fields.items())
            text = text[:fm_close] + "\n" + extras + text[fm_close:]

    task_file.write_text(text, encoding="utf-8")


def write_log(task_name: str, action: str, details: list[str], status: str):
    """Append a structured entry to today's log file (file-locked for concurrent safety)."""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    timestamp = datetime.now().isoformat(timespec="seconds")
    log_file = LOGS_DIR / f"log_{today}.md"
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


def update_dashboard(task_name: str, to: str, subject: str, dry_run: bool):
    """Append execution record to Dashboard.md (file-locked for concurrent safety)."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    mode = " [DRY RUN]" if dry_run else ""
    entry = (
        f"\n## Recent Activity\n\n"
        f"- Email sent{mode}: {task_name}\n"
        f"- To: {to}\n"
        f"- Subject: {subject}\n"
        f"- Executed by: send_email skill\n"
        f"- Date: {timestamp}\n"
    )
    lock_path = str(DASHBOARD.resolve()) + ".lock"
    with FileLock(lock_path, timeout=10):
        with open(DASHBOARD, "a", encoding="utf-8") as f:
            f.write(entry)
    logger.info("Dashboard updated")


def move_to_done(task_file: Path) -> Path:
    """Move task file from Approved/ to Done/."""
    DONE_DIR.mkdir(parents=True, exist_ok=True)
    dest = DONE_DIR / task_file.name
    shutil.move(str(task_file), str(dest))
    logger.info(f"Moved to Done: {dest.name}")
    return dest


# ── Main ──────────────────────────────────────────────────────────────────────

def run(task_path_str: str) -> int:
    """Execute the full send_email workflow. Returns exit code."""
    task_path = Path(task_path_str)
    # Accept either a full path or a bare filename (fall back to APPROVED_DIR)
    task_file = task_path if task_path.is_absolute() else APPROVED_DIR / task_path_str
    task_filename = task_file.name
    task_name = None

    try:
        # ── Validate task file exists ─────────────────────────────────────────
        if not task_file.exists():
            raise FileNotFoundError(f"Task file not found: {task_file}")

        logger.info(f"Processing task: {task_filename}")

        # ── Step 1: Parse task ────────────────────────────────────────────────
        task = load_task(task_file)
        task_name = task["task_name"]

        if task["type"] not in ("email_task", ""):
            raise ValueError(
                f"Task type is '{task['type']}' — send_email only handles email_task files."
            )

        logger.info(f"Task name:  {task_name}")
        logger.info(f"Sender:     {task['original_sender']}")

        # ── Step 2: Load plan + extract email fields ──────────────────────────
        plan = load_plan(task_name)

        if not plan["to"]:
            # Fallback: use sender extracted from task body
            if task["original_sender"]:
                plan["to"] = task["original_sender"]
                logger.info("Recipient not in plan frontmatter — using original sender from task")
            else:
                raise ValueError("Recipient email missing in both plan frontmatter and task body")

        logger.info(f"Sending to: {plan['to'][:3]}***")
        logger.info(f"Subject:    {plan['subject'][:60]}{'...' if len(plan['subject']) > 60 else ''}")


        # ── Step 3: Call MCP server ───────────────────────────────────────────
        result = call_mcp_send_email(plan["to"], plan["subject"], plan["body"])
        is_dry = result.get("dry_run", False)

        if not result.get("success"):
            raise RuntimeError(f"MCP server reported failure: {result.get('message')}")

        logger.info(f"MCP result: {result['message']}")

        # ── Step 4: Update task metadata ──────────────────────────────────────
        update_task_status(
            task_file,
            new_status="completed",
            extra_fields={
                "executed_at": datetime.now().isoformat(timespec="seconds"),
                "executed_by": "send_email_skill",
                "sent_to": plan["to"],
                "sent_subject": plan["subject"],
                "dry_run": str(is_dry).lower(),
            },
        )

        # ── Step 5: Write log ─────────────────────────────────────────────────
        mode_label = " [DRY RUN]" if is_dry else ""
        write_log(
            task_name=task_name,
            action="EMAIL SENT" + mode_label,
            details=[
                f"Plan: {plan['plan_file']}",
                f"To: {plan['to']}",
                f"Subject: {plan['subject']}",
                f"Body length: {len(plan['body'])} characters",
                f"MCP response: {result['message']}",
                f"Dry run: {is_dry}",
            ],
            status="completed",
        )

        # ── Step 6: Update dashboard ──────────────────────────────────────────
        update_dashboard(task_name, plan["to"], plan["subject"], is_dry)

        # ── Step 7: Move to Done ──────────────────────────────────────────────
        move_to_done(task_file)

        # ── Output result as JSON for Claude to parse ─────────────────────────
        output = {
            "success": True,
            "task": task_filename,
            "to": plan["to"],
            "subject": plan["subject"],
            "mcp_message": result["message"],
            "dry_run": is_dry,
            "moved_to": f"Done/email/{task_filename}",
        }
        print(json.dumps(output, indent=2))
        return 0

    except Exception as e:
        logger.error(f"FAILED: {e}")

        # Write failure log if we at least know the task name
        if task_name:
            write_log(
                task_name=task_name,
                action="FAILURE",
                details=[
                    f"Error: {e}",
                    "Task NOT moved to Done — manual intervention required",
                ],
                status="failed",
            )

        error_output = {
            "success": False,
            "task": task_filename,
            "error": str(e),
        }
        print(json.dumps(error_output, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "Usage: python skills/send_email_executor.py <task_filename>\n"
            "Example: python skills/send_email_executor.py TASK_email_john_doe.txt.md",
            file=sys.stderr,
        )
        sys.exit(1)

    sys.exit(run(sys.argv[1]))
