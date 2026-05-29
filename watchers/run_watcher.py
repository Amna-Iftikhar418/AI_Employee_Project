import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from filesystem_watcher import FileSystemWatcher

vault_path = os.path.join(os.path.dirname(__file__), "..", "vault", "AI_Employee_Vault")
watcher = FileSystemWatcher(os.path.abspath(vault_path))
watcher.run()
