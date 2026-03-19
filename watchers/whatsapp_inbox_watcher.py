"""WhatsApp Inbox Watcher — converts whatsapp_*.txt files from Inbox/ into TASK files.

Mirrors filesystem_watcher.py but handles only WhatsApp files.
Zero overlap with email logic — filesystem_watcher.py is NOT modified.
Updates Log and Dashboard at each step.
"""

import json
import logging
import logging.handlers
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

# FIX: filelock prevents race conditions on the processed-set JSON
from filelock import FileLock

sys.path.insert(0, str(Path(__file__).parent))
from base_watcher import BaseWatcher

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
        self.inbox = self.vault_path / "Inbox"
        self.archive = self.inbox / "Archive"
        self.logs_dir = self.vault_path / "Logs"
        self.dashboard_file = self.vault_path / "Dashboard.md"
        self._processed_file = self.inbox / PROCESSED_FILE_NAME

        # FIX: One lock file per JSON — prevents concurrent corruption
        self._lock = FileLock(str(self._processed_file) + ".lock")

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
        for path in [self.inbox, self.archive, self.needs_action, self.logs_dir]:
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
        # FIX: Acquire lock before reading to prevent torn reads
        with self._lock:
            if self._processed_file.exists():
                try:
                    data = json.loads(self._processed_file.read_text(encoding="utf-8"))
                    return set(data.get("processed", []))
                except Exception as e:
                    # FIX: Log full exception — not silent drop
                    self.logger.exception(
                        f"Failed to load processed set (starting fresh): {e}"
                    )
        return set()

    def _save_processed(self, filename: str):
        """Atomically persist processed filename.

        FIX: write-to-temp + os.replace() under file lock — crash-safe.
        """
        self._processed.add(filename)
        with self._lock:
            try:
                tmp = self._processed_file.with_suffix(".tmp")
                tmp.write_text(
                    json.dumps({"processed": list(self._processed)}, indent=2),
                    encoding="utf-8",
                )
                os.replace(str(tmp), str(self._processed_file))
            except Exception as e:
                self.logger.exception(f"Failed to save processed set: {e}")

    # ------------------------------------------------------------------
    # Log + Dashboard helpers
    # ------------------------------------------------------------------

    def _write_log(self, filename: str, sender: str):
        today = datetime.now().strftime("%Y-%m-%d")
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_path = self.logs_dir / f"log_{today}.md"
        entry = (
            f"\n[{timestamp}] RECEIVED: {filename} - "
            f"WhatsApp message from {sender}, task created"
        )
        try:
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(entry)
        except Exception as e:
            self.logger.exception(f"Failed to write log: {e}")

    def _update_dashboard(self, filename: str):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry = f"\n- [Received] {filename} - {timestamp}"
        try:
            with open(self.dashboard_file, "a", encoding="utf-8") as f:
                f.write(entry)
        except Exception as e:
            self.logger.exception(f"Failed to update dashboard: {e}")

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

    def check_for_updates(self) -> list:
        """Return whatsapp_*.txt files in Inbox/ not yet processed."""
        new_files = []
        for file in self.inbox.glob("whatsapp_*.txt"):
            if file.is_dir():
                continue
            if file.name in self._processed:
                continue
            task_file = self.needs_action / f"TASK_{file.name}.md"
            if not task_file.exists():
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

        # 1. Archive FIRST — prevents re-detection on crash
        archive_path = self.archive / file_path.name
        shutil.move(str(file_path), str(archive_path))

        # 2. Write TASK file
        task_file = self.needs_action / f"TASK_{file_path.name}.md"
        task_file.write_text(content, encoding="utf-8")

        # 3. Persist to dedup set
        self._save_processed(file_path.name)

        # 4. Update log and dashboard
        self._write_log(file_path.name, sender)
        self._update_dashboard(file_path.name)

        self.logger.info(f"Created task: {task_file.name}")
        return task_file


if __name__ == "__main__":
    vault = Path(__file__).parent.parent / "vault" / "AI_Employee_Vault"
    WhatsAppInboxWatcher(str(vault)).run()
