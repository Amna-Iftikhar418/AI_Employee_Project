import logging
import logging.handlers
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# ------------------------------------------------------------------
# Structured rotating logger
# ------------------------------------------------------------------
_file_handler = logging.handlers.RotatingFileHandler(
    "task_processor.log",
    maxBytes=5 * 1024 * 1024,
    backupCount=3,
)
_stream_handler = logging.StreamHandler()
_fmt = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
_file_handler.setFormatter(_fmt)
_stream_handler.setFormatter(_fmt)
logging.basicConfig(level=logging.INFO, handlers=[_file_handler, _stream_handler])
logger = logging.getLogger("TaskProcessor")


class TaskProcessor:
    def __init__(self):
        self.vault_path = Path("vault/AI_Employee_Vault")

        self.needs_action_dir = self.vault_path / "Needs_Action"
        self.plans_dir = self.vault_path / "Plans"
        self.pending_approval_dir = self.vault_path / "Pending_Approval"
        self.approved_dir = self.vault_path / "Approved"
        self.rejected_dir = self.vault_path / "Rejected"
        self.done_dir = self.vault_path / "Done"
        self.logs_dir = self.vault_path / "Logs"
        self.inbox_dir = self.vault_path / "Inbox"
        self.dashboard_file = self.vault_path / "Dashboard.md"

        self.require_approval_for_all = True

        for folder in [
            self.needs_action_dir,
            self.plans_dir,
            self.pending_approval_dir,
            self.approved_dir,
            self.rejected_dir,
            self.done_dir,
            self.logs_dir,
            self.inbox_dir,
        ]:
            folder.mkdir(parents=True, exist_ok=True)

        self._check_write_permissions()
        self.sensitive_keywords = ["invoice", "payment", "money"]

    # ------------------------------------------------------------------
    # Startup check
    # ------------------------------------------------------------------

    def _check_write_permissions(self):
        for path in [
            self.needs_action_dir,
            self.plans_dir,
            self.pending_approval_dir,
            self.approved_dir,
            self.rejected_dir,
            self.done_dir,
            self.logs_dir,
        ]:
            test = path / ".write_test"
            try:
                test.touch()
                test.unlink()
            except OSError as e:
                raise RuntimeError(
                    f"Vault directory not writable: {path}\nError: {e}"
                ) from e

    # ------------------------------------------------------------------
    # Task helpers
    # ------------------------------------------------------------------

    def extract_task_name(self, file_path):
        filename = file_path.stem
        if filename.startswith("TASK_"):
            filename = filename[5:]
        return filename

    def get_task_type(self, file_path):
        content = file_path.read_text(encoding="utf-8")
        match = re.search(r"^type:\s*(\S+)", content, re.MULTILINE)
        return match.group(1).strip() if match else "unknown"

    def get_file_status(self, file_path):
        content = file_path.read_text(encoding="utf-8")
        match = re.search(r"status:\s*(\w+)", content)
        return match.group(1).lower() if match else None

    def update_task_status(self, file_path, new_status):
        content = file_path.read_text(encoding="utf-8")
        if "status:" in content:
            content = re.sub(r"status:\s*\w+", f"status: {new_status}", content)
        else:
            content = f"status: {new_status}\n" + content
        file_path.write_text(content, encoding="utf-8")

    def update_dashboard(self, task_name, status):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry = f"\n- [{status}] {task_name} - {timestamp}"
        with open(self.dashboard_file, "a", encoding="utf-8") as f:
            f.write(entry)

    def write_log(self, task_name, action, details=""):
        today = datetime.now().strftime("%Y-%m-%d")
        log_path = self.logs_dir / f"log_{today}.md"
        timestamp = datetime.now().strftime("%H:%M:%S")
        entry = f"\n[{timestamp}] {action}: {task_name} - {details}"
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(entry)

    # ------------------------------------------------------------------
    # Plan helpers
    # ------------------------------------------------------------------

    def _plan_is_valid(self, plan_path) -> bool:
        """Return True only if the plan contains a ## Proposed Response section."""
        try:
            content = plan_path.read_text(encoding="utf-8")
            return bool(re.search(r"##\s+Proposed Response", content, re.IGNORECASE))
        except Exception:
            return False

    def _parse_task_content(self, task_file: Path) -> dict:
        """Extract sender email, subject, first name, and body from a task file."""
        content = task_file.read_text(encoding="utf-8")

        # Extract From line: "**From:** Name <email>" or "**From:** email"
        sender_raw = ""
        from_match = re.search(r"\*\*From:\*\*\s*(.+)", content)
        if from_match:
            sender_raw = from_match.group(1).strip()

        # Pull out email address
        email_match = re.search(r"[\w.+-]+@[\w.-]+\.\w+", sender_raw)
        sender_email = email_match.group(0) if email_match else sender_raw or "client@example.com"

        # Pull out display name / first name
        name_match = re.match(r'^"?([^"<@]+?)"?\s*<', sender_raw)
        if name_match:
            first_name = name_match.group(1).strip().split()[0]
        else:
            first_name = sender_email.split("@")[0].capitalize()

        # Extract Subject
        subject = "Your Request"
        subj_match = re.search(r"\*\*Subject:\*\*\s*(.+)", content)
        if subj_match:
            subject = subj_match.group(1).strip()

        # Extract body (everything after ## Body)
        body = ""
        body_match = re.search(r"##\s+Body\s*\n(.*?)(?=\n##\s|\Z)", content, re.DOTALL)
        if body_match:
            body = body_match.group(1).strip()

        # Detect keywords
        text_lower = (subject + " " + body).lower()
        keywords = [
            kw for kw in ["invoice", "payment", "money", "urgent", "asap", "reply", "respond"]
            if kw in text_lower
        ]

        priority = "high" if any(kw in keywords for kw in ["invoice", "payment", "urgent", "asap"]) else "normal"

        return {
            "sender_raw": sender_raw,
            "sender_email": sender_email,
            "first_name": first_name,
            "subject": subject,
            "body": body,
            "keywords": keywords,
            "priority": priority,
        }

    # ------------------------------------------------------------------
    # Automatic plan generator (no external dependency)
    # ------------------------------------------------------------------

    def _generate_email_plan(self, task_file: Path):
        """Generate a valid plan file directly from task content — no Claude CLI needed."""
        task_name = self.extract_task_name(task_file)
        plan_path = self.plans_dir / f"PLAN_{task_name}.md"

        if plan_path.exists() and self._plan_is_valid(plan_path):
            return  # already good

        if plan_path.exists():
            logger.warning(f"Invalid plan found — regenerating: {plan_path.name}")
            plan_path.unlink()

        data = self._parse_task_content(task_file)
        original_file = task_file.name.replace("TASK_", "", 1)
        created = datetime.now().isoformat()
        keywords_str = ", ".join(data["keywords"]) if data["keywords"] else "none"

        plan_content = f"""# Plan: {task_name}

---
type: email_task
source: gmail
original_file: {original_file}
from: {data['sender_email']}
subject: {data['subject']}
keywords: [{keywords_str}]
priority: {data['priority']}
created: {created}
status: pending
---

## Objective
Respond to {data['sender_raw'] or data['sender_email']} regarding: {data['subject']}

## Extracted Data
- type: email_task
- sender: {data['sender_raw'] or data['sender_email']}
- intent: reply_needed
- key info: {data['body'][:120].replace(chr(10), ' ') if data['body'] else 'None'}
- urgency: {data['priority'].capitalize()}
- keywords: {keywords_str}

## Action Plan
- [ ] Review email content
- [ ] Send professional reply
- [ ] Log outcome

## Proposed Response

Subject: Re: {data['subject']}

Dear {data['first_name']},

Thank you for your email. We have received your message and are reviewing it carefully.

We will get back to you with a detailed response as soon as possible. Please do not hesitate to reach out if you need anything in the meantime.

Best regards,
AI Employee

## Approval Required
Yes — email reply requires human approval before sending.

## Expected Outcome
Professional reply sent to {data['sender_email']} acknowledging their email.

## Compliance Notes
- All email replies require Pending_Approval before sending
- Financial/billing emails require additional scrutiny

## Status
pending
"""

        plan_path.write_text(plan_content, encoding="utf-8")
        logger.info(f"Plan generated: {plan_path.name}")

    # ------------------------------------------------------------------
    # Retry helpers
    # ------------------------------------------------------------------

    def _get_retry_count(self, file_path) -> int:
        content = file_path.read_text(encoding="utf-8")
        match = re.search(r"retry_count:\s*(\d+)", content)
        return int(match.group(1)) if match else 0

    def _increment_retry_count(self, file_path):
        content = file_path.read_text(encoding="utf-8")
        count = self._get_retry_count(file_path)
        if "retry_count:" in content:
            content = re.sub(r"retry_count:\s*\d+", f"retry_count: {count + 1}", content)
        else:
            content = content.replace("---", f"---\nretry_count: {count + 1}", 1)
        file_path.write_text(content, encoding="utf-8")

    # ------------------------------------------------------------------
    # Task routing
    # ------------------------------------------------------------------

    def process_task_file(self, task_file_path):
        task_name = self.extract_task_name(task_file_path)
        plan_path = self.plans_dir / f"PLAN_{task_name}.md"
        task_type = self.get_task_type(task_file_path)

        if task_type == "email_task":
            # Generate plan if missing or invalid
            if not plan_path.exists() or not self._plan_is_valid(plan_path):
                self._generate_email_plan(task_file_path)
                return  # next loop cycle will route it

        elif not plan_path.exists():
            return  # non-email tasks still need a plan externally

        current_status = self.get_file_status(task_file_path)
        if current_status in ("rejected", "completed", "pending_approval", "awaiting_approval"):
            return

        logger.info(f"Plan ready — routing task to Pending_Approval: {task_name}")

        # Inject metadata if missing
        content = task_file_path.read_text(encoding="utf-8")
        if "plan_reference:" not in content:
            content = content.replace(
                "---",
                f"---\nplan_reference: PLAN_{task_name}.md\nreason: email_reply_requires_approval",
                1,
            )
        task_file_path.write_text(content, encoding="utf-8")

        self.update_task_status(task_file_path, "awaiting_approval")
        target = self.pending_approval_dir / task_file_path.name
        shutil.move(str(task_file_path), str(target))

        self.write_log(task_name, "PENDING_APPROVAL", "Waiting for user decision")
        logger.info(f"Moved to Pending_Approval: {task_name}")

    def process_approved_task(self, task_file_path):
        task_name = self.extract_task_name(task_file_path)

        current_status = self.get_file_status(task_file_path)
        if current_status == "completed":
            return

        task_type = self.get_task_type(task_file_path)

        if task_type == "email_task":
            logger.info(f"Email task approved — sending: {task_name}")
            self.update_task_status(task_file_path, "processing")
            project_root = str(Path(__file__).parent.parent)
            result = subprocess.run(
                [sys.executable, ".claude/commands/send_email_executor.py", task_file_path.name],
                capture_output=True,
                text=True,
                cwd=project_root,
            )
            if result.returncode == 0:
                logger.info(f"Email sent successfully: {task_name}")
            else:
                logger.error(f"Email send failed for {task_name}: {result.stderr[:300]}")
                retry_count = self._get_retry_count(task_file_path)
                if retry_count < 3:
                    self._increment_retry_count(task_file_path)
                    self.update_task_status(task_file_path, "awaiting_approval")
                    logger.warning(f"Email send failed — retry {retry_count + 1}/3 for {task_name}")
                else:
                    self.update_task_status(task_file_path, "failed")
                    self.write_log(task_name, "FAILED", f"Max retries (3) reached — client NOT notified. Manual fix required.")
                    logger.error(f"Max retries reached — email NOT sent to client: {task_name}")
        else:
            logger.info(f"Processing approved task: {task_name}")
            self.update_task_status(task_file_path, "completed")
            target = self.done_dir / task_file_path.name
            shutil.move(str(task_file_path), str(target))
            self.update_dashboard(task_name, "Completed")
            self.write_log(task_name, "EXECUTED", "Approved and completed")
            logger.info(f"Completed: {task_name}")

    def process_rejected_task(self, task_file_path):
        task_name = self.extract_task_name(task_file_path)

        current_status = self.get_file_status(task_file_path)
        if current_status == "rejected":
            return

        logger.info(f"Rejected task: {task_name}")
        self.update_task_status(task_file_path, "rejected")
        self.update_dashboard(task_name, "Rejected")
        self.write_log(task_name, "REJECTED", "Task rejected by user")

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    def run(self):
        check_interval = int(os.getenv("TASK_PROCESSOR_INTERVAL", "20"))
        logger.info(f"Starting Task Processor (interval: {check_interval}s)...")

        while True:
            try:
                for file in self.needs_action_dir.glob("TASK_*.md"):
                    self.process_task_file(file)

                for file in self.approved_dir.glob("TASK_*.md"):
                    self.process_approved_task(file)

                for file in self.rejected_dir.glob("TASK_*.md"):
                    self.process_rejected_task(file)

                time.sleep(check_interval)

            except KeyboardInterrupt:
                logger.info("Stopping Task Processor...")
                break
            except Exception as e:
                logger.exception(f"Error in task processor loop: {e}")
                time.sleep(10)


if __name__ == "__main__":
    TaskProcessor().run()
