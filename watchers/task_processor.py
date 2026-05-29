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

from filelock import FileLock

sys.path.insert(0, str(Path(__file__).parent.parent))
from vault_utils import append_log, append_dashboard

# ------------------------------------------------------------------
# Structured rotating logger
# ------------------------------------------------------------------
_file_handler = logging.handlers.RotatingFileHandler(
    str(Path(__file__).parent.parent / "task_processor.log"),
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

        # Type-specific subdirs — email and whatsapp (existing)
        self.email_needs_action    = self.needs_action_dir / "email"
        self.whatsapp_needs_action = self.needs_action_dir / "whatsapp"
        self.email_plans           = self.plans_dir / "email"
        self.whatsapp_plans        = self.plans_dir / "whatsapp"
        self.email_pending         = self.pending_approval_dir / "email"
        self.whatsapp_pending      = self.pending_approval_dir / "whatsapp"
        self.email_approved        = self.approved_dir / "email"
        self.whatsapp_approved     = self.approved_dir / "whatsapp"
        self.email_rejected        = self.rejected_dir / "email"
        self.whatsapp_rejected     = self.rejected_dir / "whatsapp"
        self.email_done            = self.done_dir / "email"
        self.whatsapp_done         = self.done_dir / "whatsapp"

        # Odoo domain (TASK-2)
        self.odoo_needs_action = self.needs_action_dir / "odoo"
        self.odoo_plans        = self.plans_dir / "odoo"
        self.odoo_pending      = self.pending_approval_dir / "odoo"
        self.odoo_approved     = self.approved_dir / "odoo"
        self.odoo_rejected     = self.rejected_dir / "odoo"
        self.odoo_done         = self.done_dir / "odoo"

        # Social domain — Facebook & Instagram (TASK-3)
        self.social_needs_action = self.needs_action_dir / "social"
        self.social_plans        = self.plans_dir / "social"
        self.social_pending      = self.pending_approval_dir / "social"
        self.social_approved     = self.approved_dir / "social"
        self.social_rejected     = self.rejected_dir / "social"
        self.social_done         = self.done_dir / "social"

        for folder in [
            self.needs_action_dir,
            self.email_needs_action,
            self.whatsapp_needs_action,
            self.odoo_needs_action,
            self.social_needs_action,
            self.plans_dir,
            self.email_plans,
            self.whatsapp_plans,
            self.odoo_plans,
            self.social_plans,
            self.pending_approval_dir,
            self.email_pending,
            self.whatsapp_pending,
            self.odoo_pending,
            self.social_pending,
            self.approved_dir,
            self.email_approved,
            self.whatsapp_approved,
            self.odoo_approved,
            self.social_approved,
            self.rejected_dir,
            self.email_rejected,
            self.whatsapp_rejected,
            self.odoo_rejected,
            self.social_rejected,
            self.done_dir,
            self.email_done,
            self.whatsapp_done,
            self.odoo_done,
            self.social_done,
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
            self.email_needs_action,
            self.whatsapp_needs_action,
            self.odoo_needs_action,
            self.social_needs_action,
            self.email_plans,
            self.whatsapp_plans,
            self.odoo_plans,
            self.social_plans,
            self.email_pending,
            self.whatsapp_pending,
            self.odoo_pending,
            self.social_pending,
            self.email_approved,
            self.whatsapp_approved,
            self.odoo_approved,
            self.social_approved,
            self.email_done,
            self.whatsapp_done,
            self.odoo_done,
            self.social_done,
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
        append_dashboard(self.dashboard_file, f"- [{status}] {task_name} - {timestamp}")

    def write_log(self, task_name, action, details="", domain=""):
        timestamp = datetime.now().strftime("%H:%M:%S")
        domain_tag = f"[{domain}] " if domain else ""
        append_log(self.logs_dir, f"[{timestamp}] {domain_tag}{action}: {task_name} - {details}")

    def run_claude_skill(self, skill_name: str, file_path: Path):
        """Invoke a Claude skill headlessly via the CLI."""
        try:
            prompt = (
                f"Run the {skill_name} skill on this file:\n\n"
                f"{file_path}\n\n"
                "Follow all project instructions and update the plan if needed."
            )
            subprocess.run(
                ["claude", "-p", prompt, "--allowedTools", "all"],
                cwd=str(Path(__file__).parent.parent),
                capture_output=True,
                text=True,
                timeout=300,
                shell=False,
            )
            logger.info(f"Claude skill executed: {skill_name} for {file_path.name}")
        except Exception as e:
            logger.error(f"Failed to run Claude skill {skill_name}: {e}")

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
        if email_match:
            sender_email = email_match.group(0)
        elif sender_raw.strip():
            logger.warning(f"Could not extract email from sender '{sender_raw}' — using raw value")
            sender_email = sender_raw.strip()
        else:
            logger.error("No sender email found in task file — plan will have empty 'from' field")
            sender_email = ""

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
        plan_path = self.email_plans / f"PLAN_{task_name}.md"

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

Subject: {data['subject']}

Dear {data['first_name']},

Thank you for your email. We have received your message and are reviewing it carefully.

We will get back to you with a detailed response as soon as possible. Please do not hesitate to reach out if you need anything in the meantime.

Best regards,
Amna Iftikhar

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

    def _generate_whatsapp_plan(self, task_file: Path):
        """Generate a plan file for a WhatsApp task."""
        task_name = self.extract_task_name(task_file)
        plan_path = self.whatsapp_plans / f"PLAN_{task_name}.md"

        if plan_path.exists() and self._plan_is_valid(plan_path):
            return
        if plan_path.exists():
            plan_path.unlink()

        content = task_file.read_text(encoding="utf-8")
        created = datetime.now().isoformat()

        # Extract sender
        sender = "Unknown"
        sender_match = re.search(r"\*\*From:\*\*\s*(.+)", content)
        if sender_match:
            sender = sender_match.group(1).strip()

        # Extract body
        body = ""
        body_match = re.search(r"##\s+Body\s*\n(.*?)(?=\n##\s|\Z)", content, re.DOTALL)
        if body_match:
            body = body_match.group(1).strip()

        # Detect priority keywords
        text_lower = body.lower()
        keywords = [kw for kw in ["urgent", "invoice", "payment", "asap", "help"] if kw in text_lower]
        priority = "high" if any(kw in keywords for kw in ["urgent", "invoice", "payment", "asap"]) else "normal"
        keywords_str = ", ".join(keywords) if keywords else "none"

        first_name = sender.split()[0] if sender != "Unknown" else "there"

        plan_content = f"""# Plan: {task_name}

---
type: whatsapp_task
source: whatsapp
from: {sender}
keywords: [{keywords_str}]
priority: {priority}
created: {created}
status: pending
---

## Objective
Respond to WhatsApp message from {sender}

## Extracted Data
- sender: {sender}
- intent: reply_needed
- key info: {body[:120].replace(chr(10), ' ') if body else 'None'}
- urgency: {priority.capitalize()}
- keywords: {keywords_str}

## Action Plan
- [ ] Review WhatsApp message
- [ ] Send appropriate reply
- [ ] Log outcome

## Proposed Response

Hi {first_name},

Thank you for your message. We have received it and will get back to you shortly.

Best regards,
Amna Iftikhar

## Approval Required
Yes — WhatsApp reply requires human approval before sending.

## Expected Outcome
Reply sent to {sender} acknowledging their message.

## Status
pending
"""

        plan_path.write_text(plan_content, encoding="utf-8")
        logger.info(f"WhatsApp plan generated: {plan_path.name}")

    # ------------------------------------------------------------------
    # Retry helpers
    # ------------------------------------------------------------------

    def _get_retry_count(self, file_path) -> int:
        content = file_path.read_text(encoding="utf-8")
        match = re.search(r"retry_count:\s*(\d+)", content)
        return int(match.group(1)) if match else 0

    def _increment_retry_count(self, file_path):
        lock_path = str(file_path) + ".lock"
        with FileLock(lock_path, timeout=10):
            content = file_path.read_text(encoding="utf-8")
            count = self._get_retry_count(file_path)
            if "retry_count:" in content:
                content = re.sub(r"retry_count:\s*\d+", f"retry_count: {count + 1}", content)
            else:
                content = content.replace("---", f"---\nretry_count: {count + 1}", 1)
            file_path.write_text(content, encoding="utf-8")

    # ------------------------------------------------------------------
    # Cleanup related files when task is completed
    # ------------------------------------------------------------------

    def _cleanup_completed_task(self, done_file_path: Path):
        """
        Remove all related files from inbox, needs_action, plans, pending_approval
        when a task file in Done/ has status: completed.
        """
        try:
            content = done_file_path.read_text(encoding="utf-8")
        except Exception as e:
            logger.error(f"Cannot read done file for cleanup: {done_file_path.name}: {e}")
            return

        # Check if status is completed
        status_match = re.search(r"^status:\s*(\w+)", content, re.MULTILINE)
        if not status_match or status_match.group(1).lower() != "completed":
            return

        # Extract original_file and plan_reference from frontmatter
        original_file_match = re.search(r"^original_file:\s*(.+)", content, re.MULTILINE)
        plan_reference_match = re.search(r"^plan_reference:\s*(.+)", content, re.MULTILINE)
        type_match = re.search(r"^type:\s*(\S+)", content, re.MULTILINE)

        task_type = type_match.group(1).strip() if type_match else "email_task"
        is_whatsapp = task_type == "whatsapp_task"

        # Determine subdirs based on task type
        inbox_subdir = self.inbox_dir / ("whatsapp" if is_whatsapp else "email")
        archive_dir = self.inbox_dir / "Archive"
        needs_action_dir = self.whatsapp_needs_action if is_whatsapp else self.email_needs_action
        plans_dir = self.whatsapp_plans if is_whatsapp else self.email_plans
        pending_dir = self.whatsapp_pending if is_whatsapp else self.email_pending

        # Remove original inbox file (from inbox or archive)
        if original_file_match:
            original_filename = original_file_match.group(1).strip()
            inbox_file = inbox_subdir / original_filename
            archive_file = archive_dir / original_filename

            if inbox_file.exists():
                inbox_file.unlink()
                logger.info(f"[CLEANUP] Deleted inbox file: {inbox_file}")
            if archive_file.exists():
                archive_file.unlink()
                logger.info(f"[CLEANUP] Deleted archived inbox file: {archive_file}")

        # Determine task file name from done file
        task_filename = done_file_path.name

        # Remove from Needs_Action
        needs_action_file = needs_action_dir / task_filename
        if needs_action_file.exists():
            needs_action_file.unlink()
            logger.info(f"[CLEANUP] Deleted from Needs_Action: {needs_action_file}")

        # Remove plan file
        if plan_reference_match:
            plan_filename = plan_reference_match.group(1).strip()
            # Handle both with and without PLAN_ prefix
            plan_path = plans_dir / Path(plan_filename).name
            if plan_path.exists():
                plan_path.unlink()
                logger.info(f"[CLEANUP] Deleted plan file: {plan_path}")

            # Also try deriving plan name from task name
            task_name = self.extract_task_name(done_file_path)
            derived_plan = plans_dir / f"PLAN_{task_name}.md"
            if derived_plan.exists() and derived_plan != plan_path:
                derived_plan.unlink()
                logger.info(f"[CLEANUP] Deleted derived plan file: {derived_plan}")

        # Remove from Pending_Approval
        pending_file = pending_dir / task_filename
        if pending_file.exists():
            pending_file.unlink()
            logger.info(f"[CLEANUP] Deleted from Pending_Approval: {pending_file}")

        # For LinkedIn posts, also clean up the Pending_Approval directory
        if task_type == "linkedin_post":
            linkedin_pending = self.pending_approval_dir / "linkedin"
            linkedin_plan = self.plans_dir / "linkedin"

            # Remove from linkedin pending
            if linkedin_pending.exists():
                for f in linkedin_pending.glob(f"*{done_file_path.stem}*"):
                    f.unlink()
                    logger.info(f"[CLEANUP] Deleted LinkedIn pending file: {f}")

            # Remove linkedin plan
            if linkedin_plan.exists():
                for f in linkedin_plan.glob(f"*{done_file_path.stem}*"):
                    f.unlink()
                    logger.info(f"[CLEANUP] Deleted LinkedIn plan file: {f}")

    def _cleanup_related_files_for_task(self, done_file_path: Path, task_type: str):
        """
        Cleanup helper for tasks moved to Done by process_approved_task.
        Removes related files from inbox, needs_action, plans, pending_approval.
        """
        try:
            content = done_file_path.read_text(encoding="utf-8")
        except Exception as e:
            logger.error(f"Cannot read done file for cleanup: {done_file_path.name}: {e}")
            return

        # Extract original_file and plan_reference from frontmatter
        original_file_match = re.search(r"original_file:\s*(.+)", content)
        plan_reference_match = re.search(r"plan_reference:\s*(.+)", content)

        is_whatsapp = task_type == "whatsapp_task"

        # Determine subdirs based on task type
        inbox_subdir = self.inbox_dir / ("whatsapp" if is_whatsapp else "email")
        archive_dir = self.inbox_dir / "Archive"
        needs_action_dir = self.whatsapp_needs_action if is_whatsapp else self.email_needs_action
        plans_dir = self.whatsapp_plans if is_whatsapp else self.email_plans
        pending_dir = self.whatsapp_pending if is_whatsapp else self.email_pending

        # Remove original inbox file (from inbox or archive)
        if original_file_match:
            original_filename = original_file_match.group(1).strip()
            inbox_file = inbox_subdir / original_filename
            archive_file = archive_dir / original_filename

            if inbox_file.exists():
                inbox_file.unlink()
                logger.info(f"[CLEANUP] Deleted inbox file: {inbox_file}")
            if archive_file.exists():
                archive_file.unlink()
                logger.info(f"[CLEANUP] Deleted archived inbox file: {archive_file}")

        # Determine task file name
        task_filename = done_file_path.name
        task_name = self.extract_task_name(done_file_path)

        # Remove from Needs_Action
        needs_action_file = needs_action_dir / task_filename
        if needs_action_file.exists():
            needs_action_file.unlink()
            logger.info(f"[CLEANUP] Deleted from Needs_Action: {needs_action_file}")

        # Remove plan file
        plan_path = None
        if plan_reference_match:
            plan_filename = plan_reference_match.group(1).strip()
            plan_path = plans_dir / Path(plan_filename).name
            if plan_path.exists():
                plan_path.unlink()
                logger.info(f"[CLEANUP] Deleted plan file: {plan_path}")

        # Also try deriving plan name from task name
        derived_plan = plans_dir / f"PLAN_{task_name}.md"
        if derived_plan.exists() and derived_plan != plan_path:
            derived_plan.unlink()
            logger.info(f"[CLEANUP] Deleted derived plan file: {derived_plan}")

        # Remove from Pending_Approval
        pending_file = pending_dir / task_filename
        if pending_file.exists():
            pending_file.unlink()
            logger.info(f"[CLEANUP] Deleted from Pending_Approval: {pending_file}")

    # ------------------------------------------------------------------
    # Inbox cleanup (called on approve/reject)
    # ------------------------------------------------------------------

    def _cleanup_inbox_file(self, task_file_path: Path):
        """Archive original inbox file and remove task from Needs_Action if still present."""
        try:
            content = task_file_path.read_text(encoding="utf-8")
        except Exception:
            return

        orig_match = re.search(r"original_file:\s*(.+)", content)
        type_match = re.search(r"^type:\s*(\S+)", content, re.MULTILINE)
        if not orig_match:
            return

        original_filename = orig_match.group(1).strip()
        task_type = type_match.group(1).strip() if type_match else "email_task"

        inbox_subdir = self.inbox_dir / ("whatsapp" if task_type == "whatsapp_task" else "email")
        archive_dir = self.inbox_dir / "Archive"
        archive_dir.mkdir(exist_ok=True)

        inbox_file = inbox_subdir / original_filename
        if inbox_file.exists():
            shutil.move(str(inbox_file), str(archive_dir / original_filename))
            logger.info(f"Archived inbox file: {original_filename}")

        # Safety: remove from Needs_Action subfolder if still present
        na_subdir = self.whatsapp_needs_action if task_type == "whatsapp_task" else self.email_needs_action
        na_file = na_subdir / task_file_path.name
        if na_file.exists():
            na_file.unlink()
            logger.info(f"Removed from Needs_Action: {task_file_path.name}")

    # ------------------------------------------------------------------
    # Task routing
    # ------------------------------------------------------------------

    def process_task_file(self, task_file_path):
        task_name = self.extract_task_name(task_file_path)
        task_type = self.get_task_type(task_file_path)

        if task_type == "email_task":
            plan_path = self.email_plans / f"PLAN_{task_name}.md"
            pending_dir = self.email_pending
            if not plan_path.exists() or not self._plan_is_valid(plan_path):
                self._generate_email_plan(task_file_path)

        elif task_type == "whatsapp_task":
            plan_path = self.whatsapp_plans / f"PLAN_{task_name}.md"
            pending_dir = self.whatsapp_pending
            if not plan_path.exists() or not self._plan_is_valid(plan_path):
                self._generate_whatsapp_plan(task_file_path)

        else:
            plan_path = self.plans_dir / f"PLAN_{task_name}.md"
            pending_dir = self.pending_approval_dir
            if not plan_path.exists():
                return  # other task types still need a plan externally

        current_status = self.get_file_status(task_file_path)
        if current_status in ("rejected", "completed", "pending_approval", "awaiting_approval"):
            return

        logger.info(f"Routing task to Pending_Approval: {task_name}")

        # Inject metadata if missing
        content = task_file_path.read_text(encoding="utf-8")
        if "plan_reference:" not in content:
            reason = "whatsapp_reply_requires_approval" if task_type == "whatsapp_task" else "email_reply_requires_approval"
            content = content.replace(
                "---",
                f"---\nplan_reference: PLAN_{task_name}.md\nreason: {reason}",
                1,
            )

        # Inject the Proposed Response from the Plan file inline so the reviewer
        # sees the full draft reply without needing to open a separate Plan file.
        if "## Proposed Response" not in content and plan_path.exists():
            plan_text = plan_path.read_text(encoding="utf-8")
            match = re.search(r"(## Proposed Response\s*\n.*?)(?=\n## |\Z)", plan_text, re.DOTALL)
            if match:
                content = content.rstrip() + "\n\n" + match.group(1).strip() + "\n"

        task_file_path.write_text(content, encoding="utf-8")

        self.update_task_status(task_file_path, "awaiting_approval")
        target = pending_dir / task_file_path.name
        shutil.move(str(task_file_path), str(target))

        self.write_log(task_name, "PENDING_APPROVAL", "Waiting for user decision")
        logger.info(f"Moved to Pending_Approval: {task_name}")

    def process_approved_task(self, task_file_path):
        task_name = self.extract_task_name(task_file_path)

        current_status = self.get_file_status(task_file_path)
        if current_status == "completed":
            return

        task_type = self.get_task_type(task_file_path)

        # Archive original inbox file and clean up Needs_Action
        self._cleanup_inbox_file(task_file_path)

        done_dir = self.whatsapp_done if task_type == "whatsapp_task" else self.email_done

        if task_type == "email_task":
            logger.info(f"Email task approved — sending: {task_name}")
            self.update_task_status(task_file_path, "processing")
            project_root = str(Path(__file__).parent.parent)
            result = subprocess.run(
                [sys.executable, ".claude/commands/send_email_executor.py", str(task_file_path.resolve())],
                capture_output=True,
                text=True,
                cwd=project_root,
            )
            if result.returncode == 0:
                logger.info(f"Email sent successfully: {task_name}")
            else:
                logger.error(f"Email send failed for {task_name}:\n{result.stderr}")
                lock_path = str(task_file_path) + ".lock"
                with FileLock(lock_path, timeout=10):
                    retry_count = self._get_retry_count(task_file_path)
                    if retry_count < 3:
                        self._increment_retry_count(task_file_path)
                        self.update_task_status(task_file_path, "awaiting_approval")
                        logger.warning(f"Email send failed — retry {retry_count + 1}/3 for {task_name}")
                    else:
                        self.update_task_status(task_file_path, "failed")
                        self.write_log(task_name, "FAILED", "Max retries (3) reached — client NOT notified. Moved to Failed/email/.")
                        logger.error(f"Max retries reached — email NOT sent to client: {task_name}")
                        failed_dir = Path(self.vault_path) / "Failed" / "email"
                        failed_dir.mkdir(parents=True, exist_ok=True)
                        failed_target = failed_dir / task_file_path.name
                        shutil.move(str(task_file_path), str(failed_target))
                        logger.info(f"Moved failed task to Failed/email/: {task_name}")
        else:
            logger.info(f"Processing approved task: {task_name}")
            self.update_task_status(task_file_path, "completed")
            target = done_dir / task_file_path.name
            shutil.move(str(task_file_path), str(target))

            # Cleanup related files for WhatsApp/general tasks
            self._cleanup_related_files_for_task(target, task_type)

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

        task_type = self.get_task_type(task_file_path)

        # Archive original inbox file and clean up Needs_Action
        self._cleanup_inbox_file(task_file_path)

        # Clean up plan file
        is_whatsapp = task_type == "whatsapp_task"
        plans_dir = self.whatsapp_plans if is_whatsapp else self.email_plans
        plan_path = plans_dir / f"PLAN_{task_name}.md"
        if plan_path.exists():
            plan_path.unlink()
            logger.info(f"[CLEANUP] Deleted plan for rejected task: {plan_path.name}")

        # Also check plan_reference in frontmatter
        try:
            content = task_file_path.read_text(encoding="utf-8")
            plan_ref_match = re.search(r"plan_reference:\s*(.+)", content)
            if plan_ref_match:
                ref_name = plan_ref_match.group(1).strip()
                ref_path = plans_dir / Path(ref_name).name
                if ref_path.exists() and ref_path != plan_path:
                    ref_path.unlink()
                    logger.info(f"[CLEANUP] Deleted referenced plan: {ref_path.name}")
        except Exception:
            pass

        # Clean up from Pending_Approval if still there
        pending_dir = self.whatsapp_pending if is_whatsapp else self.email_pending
        pending_file = pending_dir / task_file_path.name
        if pending_file.exists():
            pending_file.unlink()
            logger.info(f"[CLEANUP] Deleted from Pending_Approval: {pending_file.name}")

        self.update_dashboard(task_name, "Rejected")
        self.write_log(task_name, "REJECTED", "Task rejected by user")

    # ------------------------------------------------------------------
    # Cleanup loop for completed tasks
    # ------------------------------------------------------------------

    def _cleanup_done_files(self):
        """Scan Done folder and cleanup related files for completed tasks."""
        try:
            # Check all done subdirectories
            for subdir in [self.email_done, self.whatsapp_done, self.done_dir / "linkedin"]:
                if not subdir.exists():
                    continue
                for file in subdir.glob("*.md"):
                    self._cleanup_completed_task(file)
        except Exception as e:
            logger.error(f"Error in cleanup loop: {e}")

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    def run(self):
        check_interval = int(os.getenv("TASK_PROCESSOR_INTERVAL", "20"))
        cleanup_counter = 0
        logger.info(f"Starting Task Processor (interval: {check_interval}s)...")

        while True:
            try:
                needs_action_files = (
                    list(self.email_needs_action.glob("TASK_*.md"))
                    + list(self.whatsapp_needs_action.glob("TASK_*.md"))
                    + list(self.odoo_needs_action.glob("TASK_*.md"))
                    + list(self.social_needs_action.glob("TASK_*.md"))
                )
                for file in needs_action_files:
                    self.process_task_file(file)

                approved_files = (
                    list(self.email_approved.glob("TASK_*.md"))
                    + list(self.whatsapp_approved.glob("TASK_*.md"))
                    + list(self.odoo_approved.glob("TASK_*.md"))
                    + list(self.social_approved.glob("TASK_*.md"))
                )
                for file in approved_files:
                    self.process_approved_task(file)

                rejected_files = (
                    list(self.email_rejected.glob("TASK_*.md"))
                    + list(self.whatsapp_rejected.glob("TASK_*.md"))
                    + list(self.odoo_rejected.glob("TASK_*.md"))
                    + list(self.social_rejected.glob("TASK_*.md"))
                )
                for file in rejected_files:
                    self.process_rejected_task(file)

                # Run cleanup every 5 iterations
                cleanup_counter += 1
                if cleanup_counter >= 5:
                    self._cleanup_done_files()
                    cleanup_counter = 0

                time.sleep(check_interval)

            except KeyboardInterrupt:
                logger.info("Stopping Task Processor...")
                break
            except Exception as e:
                logger.exception(f"Error in task processor loop: {e}")
                time.sleep(10)


if __name__ == "__main__":
    TaskProcessor().run()
