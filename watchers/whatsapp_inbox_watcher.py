"""WhatsApp Inbox Watcher — converts whatsapp_*.txt files from Inbox/ into TASK files.

Mirrors filesystem_watcher.py but handles only WhatsApp files.
Zero overlap with email logic — filesystem_watcher.py is NOT modified.
Updates Log and Dashboard at each step.
"""

import logging
import logging.handlers
import shutil
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))
from base_watcher import BaseWatcher
from vault_utils import append_log, append_dashboard, load_processed, save_processed

PROCESSED_FILE_NAME = ".processed_whatsapp_inbox.json"

# ------------------------------------------------------------------
# Structured rotating logger
# FIX: Prevents unbounded log-file growth
# ------------------------------------------------------------------
_log_dir = Path(__file__).parent.parent
_file_handler = logging.handlers.RotatingFileHandler(
    str(_log_dir / "whatsapp_inbox_watcher.log"),
    maxBytes=5 * 1024 * 1024,   # 5 MB
    backupCount=3,
)
_stream_handler = logging.StreamHandler()
_fmt = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
_file_handler.setFormatter(_fmt)
_stream_handler.setFormatter(_fmt)
logging.basicConfig(level=logging.INFO, handlers=[_file_handler, _stream_handler])


class WhatsAppInboxWatcher(BaseWatcher):
    """Watches Inbox/ for whatsapp_*.txt files and creates TASK files in Needs_Action/."""

    def __init__(self, vault_path: str):
        super().__init__(vault_path, check_interval=10)
        self.inbox = self.vault_path / "Inbox" / "whatsapp"
        self.archive = self.vault_path / "Inbox" / "Archive"
        self.logs_dir = self.vault_path / "Logs"
        self.dashboard_file = self.vault_path / "Dashboard.md"
        self._processed_file = self.inbox / PROCESSED_FILE_NAME

        # Migrate processed file from old Inbox/ root to new Inbox/whatsapp/ location
        _old = self.vault_path / "Inbox" / PROCESSED_FILE_NAME
        if _old.exists() and not self._processed_file.exists():
            shutil.move(str(_old), str(self._processed_file))

        self.archive.mkdir(parents=True, exist_ok=True)
        self.needs_action.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)

        # FIX: Fail fast if any required directory is not writable
        self._check_write_permissions()

        self._processed: set = self._load_processed()

    # ------------------------------------------------------------------
    # Startup check
    # ------------------------------------------------------------------

    def _check_write_permissions(self):
        """Verify all required directories are writable before starting."""
        for path in [self.inbox, self.archive, self.needs_action / "whatsapp", self.logs_dir]:
            test = path / ".write_test"
            try:
                test.touch()
                test.unlink()
            except OSError as e:
                raise RuntimeError(
                    f"Directory not writable: {path}\nError: {e}"
                ) from e

    # ------------------------------------------------------------------
    # Dedup — separate from email's .processed_inbox.json
    # ------------------------------------------------------------------

    def _load_processed(self) -> set:
        return load_processed(self._processed_file)

    def _save_processed(self, filename: str):
        self._processed.add(filename)
        save_processed(self._processed_file, self._processed)

    # ------------------------------------------------------------------
    # Log + Dashboard helpers
    # ------------------------------------------------------------------

    def _write_log(self, filename: str, sender: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        append_log(
            self.logs_dir,
            f"[{timestamp}] RECEIVED: {filename} - WhatsApp message from {sender}, task created",
        )

    def _update_dashboard(self, filename: str):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        append_dashboard(self.dashboard_file, f"- [Received] {filename} - {timestamp}")

    # ------------------------------------------------------------------
    # File parser
    # ------------------------------------------------------------------

    def _parse_whatsapp_file(self, file_path: Path) -> dict:
        """Extract From and Body from a whatsapp_*.txt inbox file."""
        try:
            raw = file_path.read_text(encoding="utf-8")
        except Exception:
            return {"from": "Unknown", "body": ""}

        sender = "Unknown"
        body = ""
        lines = raw.splitlines()
        body_start = 0

        for i, line in enumerate(lines):
            if line.startswith("From:"):
                sender = line[5:].strip()
            elif line.strip() == "Body:":
                body_start = i + 1
                break

        body = "\n".join(lines[body_start:]).strip()
        return {"from": sender, "body": body}

    # ------------------------------------------------------------------
    # BaseWatcher interface
    # ------------------------------------------------------------------

    _PIPELINE_STAGES = [
        "Needs_Action", "Plans", "Pending_Approval", "Approved", "Done", "Rejected"
    ]

    def _task_exists_in_pipeline(self, inbox_filename: str) -> bool:
        """Return True if the TASK file for this inbox file exists anywhere in the pipeline."""
        task_name = f"TASK_{inbox_filename}.md"
        return any(
            (self.vault_path / stage / "whatsapp" / task_name).exists()
            for stage in self._PIPELINE_STAGES
        )

    def check_for_updates(self) -> list:
        """Return *.txt files in Inbox/whatsapp/ that need a TASK file created.

        Uses pipeline-wide TASK existence as the source of truth instead of
        relying solely on the processed set.  This prevents inbox files from
        getting permanently stuck when their TASK file is deleted or moved to
        Done/Rejected without the inbox file being archived.
        """
        new_files = []
        for file in self.inbox.glob("*.txt"):
            if file.is_dir():
                continue
            if self._task_exists_in_pipeline(file.name):
                # Ensure it is recorded as processed so future runs skip it quickly
                if file.name not in self._processed:
                    self._save_processed(file.name)
                continue
            # TASK missing — process (or re-process) this inbox file
            if file.name in self._processed:
                # TASK was lost; clear the stale processed flag so create_action_file
                # can mark it again after successfully writing the new TASK.
                self._processed.discard(file.name)
                save_processed(self._processed_file, self._processed)
                self.logger.info(
                    f"[whatsapp] Stale processed entry removed for {file.name} "
                    "(TASK not found in pipeline — will reprocess)"
                )
            new_files.append(file)
        return new_files

    def create_action_file(self, file_path: Path):
        """Archive the inbox file and create a TASK in Needs_Action/."""
        created = datetime.now().isoformat()
        parsed = self._parse_whatsapp_file(file_path)
        sender = parsed["from"]
        body = parsed["body"]

        content = f"""---
type: whatsapp_task
source: whatsapp
original_file: {file_path.name}
created: {created}
priority: high
status: pending
---

## WhatsApp Message

**From:** {sender}

## Body

{body}

## Suggested Actions

- [ ] Reply to message
- [ ] Take action
- [ ] Escalate if needed
"""

        # 1. Write TASK file in Needs_Action/whatsapp/
        # Original file stays in Inbox/whatsapp/ until approved/rejected
        whatsapp_needs_action = self.needs_action / "whatsapp"
        whatsapp_needs_action.mkdir(parents=True, exist_ok=True)
        task_file = whatsapp_needs_action / f"TASK_{file_path.name}.md"
        task_file.write_text(content, encoding="utf-8")

        # 2. Persist to dedup set
        self._save_processed(file_path.name)

        # 3. Update log and dashboard
        self._write_log(file_path.name, sender)
        self._update_dashboard(file_path.name)

        self.logger.info(f"Created task: {task_file.name}")
        return task_file


if __name__ == "__main__":
    vault = Path(__file__).parent.parent / "vault" / "AI_Employee_Vault"
    WhatsAppInboxWatcher(str(vault)).run()
