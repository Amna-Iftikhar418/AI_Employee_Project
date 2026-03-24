"""
vault_utils.py
Shared vault I/O utilities — single source of truth for log, dashboard,
frontmatter parsing, and processed-set persistence.

Imported by all watchers and executors to eliminate duplicate implementations.
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path

from filelock import FileLock


def append_log(logs_dir: Path, block: str) -> None:
    """Append a block of text to today's log file (file-locked, crash-safe)."""
    logs_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    log_file = logs_dir / f"log_{today}.md"
    lock_path = str(log_file.resolve()) + ".lock"
    with FileLock(lock_path, timeout=10):
        with open(log_file, "a", encoding="utf-8") as f:
            f.write("\n" + block + "\n")


def append_dashboard(dashboard_file: Path, block: str) -> None:
    """Append a block of text to Dashboard.md (file-locked, crash-safe)."""
    dashboard_file.parent.mkdir(parents=True, exist_ok=True)
    lock_path = str(dashboard_file.resolve()) + ".lock"
    with FileLock(lock_path, timeout=10):
        with open(dashboard_file, "a", encoding="utf-8") as f:
            f.write("\n" + block + "\n")


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Parse YAML-style frontmatter block. Returns (fields_dict, body_text).

    Handles simple key: value pairs. Finds the first --- ... --- block
    anywhere in the file, so it works even when a header precedes the block.
    """
    fields: dict = {}
    body = text
    match = re.search(r"---\s*\n(.*?)\n---\s*\n(.*)", text, re.DOTALL)
    if match:
        for line in match.group(1).splitlines():
            if ":" in line:
                key, _, value = line.partition(":")
                fields[key.strip()] = value.strip()
        body = match.group(2)
    return fields, body


def load_processed(file_path: Path) -> set:
    """Load persisted set of processed filenames from JSON (file-locked)."""
    lock = FileLock(str(file_path) + ".lock")
    with lock:
        if file_path.exists():
            try:
                data = json.loads(file_path.read_text(encoding="utf-8"))
                return set(data.get("processed", []))
            except Exception:
                pass
    return set()


def save_processed(file_path: Path, processed: set) -> None:
    """Atomically persist processed filenames to JSON (file-locked, crash-safe).

    Uses write-to-temp + os.replace() so a crash mid-write never leaves a
    half-written file.
    """
    lock = FileLock(str(file_path) + ".lock")
    with lock:
        try:
            tmp = file_path.with_suffix(".tmp")
            tmp.write_text(
                json.dumps({"processed": sorted(processed)}, indent=2),
                encoding="utf-8",
            )
            os.replace(str(tmp), str(file_path))
        except Exception:
            pass
