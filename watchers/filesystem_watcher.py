import shutil
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))
from vault_utils import load_processed, save_processed
from base_watcher import BaseWatcher


class FileSystemWatcher(BaseWatcher):

    def __init__(self, vault_path: str):
        super().__init__(vault_path, check_interval=5)
        self.inbox = self.vault_path / "Inbox" / "email"
        self.archive = self.inbox / "Archive"
        self.archive.mkdir(parents=True, exist_ok=True)
        self._processed_file = self.inbox / ".processed_inbox.json"

        # Migrate processed file from old Inbox/ root to new Inbox/email/ location
        _old = self.vault_path / "Inbox" / ".processed_inbox.json"
        if _old.exists() and not self._processed_file.exists():
            shutil.move(str(_old), str(self._processed_file))

        # Warn (do not crash) if directories are not writable
        self._check_write_permissions()

        self.processed = self._load_processed()

    # ------------------------------------------------------------------
    # Startup check — warns but does NOT crash
    # ------------------------------------------------------------------

    def _check_write_permissions(self):
        """Verify required directories are writable. Log warnings, do not crash.

        OneDrive-synced paths often fail this check with PermissionError.
        If that happens, a clear advisory is printed but the watcher continues.
        Moving the project to C:\\AI_Employee_Project resolves these errors.
        """
        dirs_to_check = [
            self.inbox,
            self.archive,
            self.needs_action / "email",
        ]

        vault_str = str(self.vault_path).lower()
        in_onedrive = "onedrive" in vault_str or "skydrive" in vault_str

        for path in dirs_to_check:
            try:
                path.mkdir(parents=True, exist_ok=True)
                test_file = path / ".write_test"
                test_file.touch()
                test_file.unlink()
            except OSError as e:
                self.logger.warning(
                    f"[WRITE-CHECK] Directory not writable: {path}\n"
                    f"              Error: {e}"
                )
                if in_onedrive:
                    self.logger.warning(
                        "[WRITE-CHECK] OneDrive detected — this is likely causing the "
                        "permission error. Fix: move project to C:\\AI_Employee_Project"
                    )
                else:
                    self.logger.warning(
                        "[WRITE-CHECK] Fix: ensure the directory exists and is not "
                        "read-only. Run as Administrator if needed."
                    )
                # Do NOT raise — watcher continues and will fail gracefully per-operation

    # ------------------------------------------------------------------
    # Processed-set persistence (locked + atomic)
    # ------------------------------------------------------------------

    def _load_processed(self) -> set:
        return load_processed(self._processed_file)

    def _save_processed(self, filename: str):
        self.processed.add(filename)
        save_processed(self._processed_file, self.processed)

    # ------------------------------------------------------------------
    # Watcher interface
    # ------------------------------------------------------------------

    def check_for_updates(self) -> list:
        new_files = []

        for file in self.inbox.glob("*"):
            if file.is_dir():
                continue
            if file.name.startswith("."):
                continue
            if file.name in self.processed:
                continue

            task_file = self.needs_action / "email" / f"TASK_{file.name}.md"
            if not task_file.exists():
                new_files.append(file)

        return new_files

    def _parse_email_content(self, file_path: Path) -> dict:
        """Parse email file to extract From, Subject, Body."""
        try:
            raw = file_path.read_text(encoding="utf-8")
        except Exception:
            return {"from": "Unknown", "subject": file_path.name, "body": ""}

        sender = "Unknown"
        subject = file_path.name
        body = ""
        lines = raw.splitlines()
        body_start = 0

        for i, line in enumerate(lines):
            if line.startswith("From:"):
                sender = line[5:].strip()
            elif line.startswith("Subject:"):
                subject = line[8:].strip()
            elif line.strip() == "Body:":
                body_start = i + 1
                break

        body = "\n".join(lines[body_start:]).strip()
        return {"from": sender, "subject": subject, "body": body}

    def create_action_file(self, file_path: Path):
        created = datetime.now().isoformat()
        is_email = file_path.name.startswith("email_") and file_path.suffix == ".txt"

        if is_email:
            parsed = self._parse_email_content(file_path)
            content = f"""---
type: email_task
source: gmail
original_file: {file_path.name}
created: {created}
priority: normal
status: pending
---

## Email Task

**From:** {parsed['from']}
**Subject:** {parsed['subject']}

## Body

{parsed['body']}

## Suggested Actions

- [ ] Review email
- [ ] Process task
- [ ] Move to Done
"""
        else:
            content = f"""---
type: file_task
source: inbox
original_file: {file_path.name}
created: {created}
priority: normal
status: pending
---

## Task

A new file was added to the inbox.

File name: {file_path.name}

## Suggested Actions

- [ ] Review file
- [ ] Process task
- [ ] Move to Done
"""

        email_needs_action = self.needs_action / "email"
        email_needs_action.mkdir(parents=True, exist_ok=True)
        action_file = email_needs_action / f"TASK_{file_path.name}.md"
        action_file.write_text(content, encoding="utf-8")

        self._save_processed(file_path.name)

        return action_file
