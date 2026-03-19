import os
import json
import shutil
from pathlib import Path
from datetime import datetime

# FIX: filelock prevents race conditions when multiple processes read/write
# the processed-set JSON at the same time
from filelock import FileLock

from base_watcher import BaseWatcher


class FileSystemWatcher(BaseWatcher):

    def __init__(self, vault_path: str):
        super().__init__(vault_path, check_interval=10)
        self.inbox = self.vault_path / "Inbox"
        self.archive = self.inbox / "Archive"
        self.archive.mkdir(parents=True, exist_ok=True)
        self._processed_file = self.inbox / ".processed_inbox.json"

        # FIX: One lock file per JSON — prevents concurrent corruption
        self._lock = FileLock(str(self._processed_file) + ".lock")

        # FIX: Fail fast on startup if directories are not writable
        self._check_write_permissions()

        self.processed = self._load_processed()

    # ------------------------------------------------------------------
    # Startup check
    # ------------------------------------------------------------------

    def _check_write_permissions(self):
        """Verify all required directories are writable before starting."""
        for path in [self.inbox, self.archive, self.needs_action]:
            path.mkdir(parents=True, exist_ok=True)
            test_file = path / ".write_test"
            try:
                test_file.touch()
                test_file.unlink()
            except OSError as e:
                raise RuntimeError(
                    f"No write permission on directory: {path}\n"
                    f"Error: {e}\n"
                    "Fix directory permissions before starting the watcher."
                ) from e

    # ------------------------------------------------------------------
    # Processed-set persistence (locked + atomic)
    # ------------------------------------------------------------------

    def _load_processed(self) -> set:
        """Load persisted set of processed inbox filenames from disk."""
        # FIX: Acquire lock before reading — prevents torn reads
        with self._lock:
            if self._processed_file.exists():
                try:
                    with open(self._processed_file, "r") as f:
                        data = json.load(f)
                        return set(data.get("processed", []))
                except (json.JSONDecodeError, IOError) as e:
                    self.logger.error(f"Error loading processed set (starting fresh): {e}")
        return set()

    def _save_processed(self, filename: str):
        """Atomically persist a newly processed inbox filename to disk.

        FIX: Uses write-to-temp + os.replace() so a crash mid-write never
        leaves a half-written or empty JSON file.
        """
        self.processed.add(filename)
        with self._lock:
            try:
                data = {"processed": list(self.processed)}
                # Write to .tmp first, then atomically replace the real file
                tmp = self._processed_file.with_suffix(".tmp")
                with open(tmp, "w") as f:
                    json.dump(data, f, indent=2)
                # os.replace is atomic on POSIX; on Windows it's best-effort
                os.replace(str(tmp), str(self._processed_file))
            except IOError as e:
                self.logger.error(f"Failed to save processed set: {e}")

    # ------------------------------------------------------------------
    # Watcher interface
    # ------------------------------------------------------------------

    def check_for_updates(self) -> list:
        new_files = []

        for file in self.inbox.glob("*"):
            # Skip directories (e.g. Archive/)
            if file.is_dir():
                continue

            # Skip hidden tracking files
            if file.name.startswith("."):
                continue

            # Already processed — file should have been archived.
            # If it's still sitting in Inbox (orphaned), move it to Archive now
            # so it doesn't accumulate. This happens when gmail_watcher rewrites
            # the same filename for a repeat sender after the original was archived.
            if file.name in self.processed:
                archive_path = self.archive / file.name
                if not archive_path.exists():
                    shutil.move(str(file), str(archive_path))
                    self.logger.warning(
                        f"Orphaned inbox file archived: {file.name} "
                        "(already in processed set — likely a repeat-sender filename collision)"
                    )
                else:
                    file.unlink()
                    self.logger.warning(f"Duplicate orphaned file removed: {file.name}")
                continue

            task_file = self.needs_action / f"TASK_{file.name}.md"
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

        # Step 1: Archive FIRST — prevents re-detection even if step 2 crashes
        archive_path = self.archive / file_path.name
        shutil.move(str(file_path), str(archive_path))

        # Step 2: Create task file in Needs_Action
        action_file = self.needs_action / f"TASK_{file_path.name}.md"
        action_file.write_text(content, encoding="utf-8")

        # Step 3: Persist to disk so restarts don't re-detect this file
        self._save_processed(file_path.name)

        return action_file
