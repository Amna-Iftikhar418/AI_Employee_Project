from base_watcher import BaseWatcher
from pathlib import Path
from datetime import datetime


class FileSystemWatcher(BaseWatcher):

    def __init__(self, vault_path: str):
        super().__init__(vault_path, check_interval=10)
        self.inbox = self.vault_path / "Inbox"
        self.processed = set(f.name for f in self.needs_action.glob("TASK_*"))

    def check_for_updates(self) -> list:
        files = list(self.inbox.glob("*"))
        new_files = []

        for file in files:
            task_file = self.needs_action / f"TASK_{file.name}.md"

            if file.name not in self.processed and not task_file.exists():
                new_files.append(file)

        return new_files

    def create_action_file(self, file_path: Path):
        content = f"""---
type: file_task
source: inbox
original_file: {file_path.name}
created: {datetime.now().isoformat()}
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

        action_file = self.needs_action / f"TASK_{file_path.name}.md"

        action_file.write_text(content)

        self.processed.add(file_path.name)

        return action_file