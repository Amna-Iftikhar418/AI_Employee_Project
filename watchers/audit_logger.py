"""
audit_logger.py
TASK-8.1/8.2/8.3: Structured JSON audit log for all AI Employee actions.

Appends one JSON object per line (JSONL) to:
  vault/AI_Employee_Vault/Logs/YYYY-MM-DD.json

Thread-safe via filelock when available.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

try:
    from filelock import FileLock
    _HAS_FILELOCK = True
except ImportError:
    _HAS_FILELOCK = False

ROOT     = Path(__file__).parent.parent
LOGS_DIR = ROOT / "vault" / "AI_Employee_Vault" / "Logs"


def log_action(
    action_type: str,
    actor: str,
    target: str,
    parameters: dict | None = None,
    approval_status: str = "approved",
    approved_by: str = "human",
    result: str = "",
) -> None:
    """Append one JSONL audit entry to today's YYYY-MM-DD.json log file."""
    try:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        today    = datetime.now().strftime("%Y-%m-%d")
        log_file = LOGS_DIR / f"{today}.json"
        lock_path = str(log_file.resolve()) + ".lock"

        entry = {
            "timestamp":       datetime.now().isoformat(timespec="seconds"),
            "action_type":     action_type,
            "actor":           actor,
            "target":          target,
            "parameters":      parameters or {},
            "approval_status": approval_status,
            "approved_by":     approved_by,
            "result":          result,
        }
        line = json.dumps(entry, ensure_ascii=False)

        if _HAS_FILELOCK:
            with FileLock(lock_path, timeout=10):
                with open(log_file, "a", encoding="utf-8") as f:
                    f.write(line + "\n")
        else:
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(line + "\n")

    except Exception as exc:
        print(f"[WARN] audit_logger: failed to write entry: {exc}", file=sys.stderr)
