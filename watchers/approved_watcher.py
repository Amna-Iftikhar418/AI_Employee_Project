"""
approved_watcher.py
Monitors vault/AI_Employee_Vault/Approved/ for LINKEDIN_POST_*.md files
and automatically triggers linkedin_executor.run_linkedin_post().

Run with:
    uv run watchers/approved_watcher.py
    (or: python watchers/approved_watcher.py)
"""

import json
import os
import sys
import time
from pathlib import Path

# Add project root to sys.path so linkedin_executor can be imported
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from linkedin_executor import run_linkedin_post  # noqa: E402

APPROVED        = ROOT / "vault" / "AI_Employee_Vault" / "Approved" / "linkedin"
PROCESSED_FILE  = APPROVED / ".processed_approved.json"
CHECK_INTERVAL  = 5  # seconds between scans


# ── Processed-set helpers ─────────────────────────────────────────────────────

def _load_processed() -> set:
    """Load filenames already handled in a previous watcher run."""
    if PROCESSED_FILE.exists():
        try:
            with open(PROCESSED_FILE, "r", encoding="utf-8") as f:
                return set(json.load(f).get("processed", []))
        except Exception:
            pass
    return set()


def _save_processed(processed: set):
    """Atomically persist the processed-filenames set."""
    try:
        tmp = PROCESSED_FILE.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"processed": sorted(processed)}, f, indent=2)
        os.replace(str(tmp), str(PROCESSED_FILE))
    except Exception as e:
        print(f"[ERROR] Could not save processed set: {e}")


# ── Frontmatter quick-check ───────────────────────────────────────────────────

def _is_completed(file_path: Path) -> bool:
    """Return True if the file's frontmatter already says status: completed."""
    try:
        text = file_path.read_text(encoding="utf-8")
        if not text.startswith("---"):
            return False
        end = text.find("---", 3)
        if end == -1:
            return False
        for line in text[3:end].splitlines():
            if "status" in line and "completed" in line:
                return True
    except Exception:
        pass
    return False


# ── Watcher loop ──────────────────────────────────────────────────────────────

def watch():
    print("[AUTO] -------------------------------------------")
    print("[AUTO]  LinkedIn Approved Watcher - started")
    print(f"[AUTO]  Watching : {APPROVED}")
    print(f"[AUTO]  Interval : {CHECK_INTERVAL}s")
    print("[AUTO] -------------------------------------------")

    APPROVED.mkdir(parents=True, exist_ok=True)

    # Files successfully processed in previous runs (persisted to disk)
    persisted = _load_processed()

    # Files attempted in THIS run (not saved — allows retry on restart)
    attempted_this_run: set = set()

    while True:
        try:
            # Glob in filename order (oldest timestamp first)
            for file_path in sorted(APPROVED.glob("LINKEDIN_POST_*.md")):

                name = file_path.name

                # Skip if successfully processed in a previous run
                if name in persisted:
                    continue

                # Skip if we already attempted it this session
                if name in attempted_this_run:
                    continue

                # Skip files that are already marked completed
                if _is_completed(file_path):
                    print(f"[SKIP]  Already completed: {name}")
                    persisted.add(name)
                    _save_processed(persisted)
                    continue

                print(f"\n[AUTO] -- New file ------------------------------")
                attempted_this_run.add(name)   # mark before calling (avoid double-trigger)

                try:
                    run_linkedin_post(file_path)
                except Exception as e:
                    print(f"[ERROR] Unhandled exception for {name}: {e}")
                    # File left in Approved/ — retry on next watcher restart
                    continue

                # If the file is now gone (moved to Done/) → mark as fully done
                if not file_path.exists():
                    persisted.add(name)
                    _save_processed(persisted)
                    print(f"[AUTO]  Marked as processed: {name}")
                else:
                    # File still in Approved/ → posting failed, leave for retry
                    print(f"[AUTO]  File remains in Approved/ - will retry on restart.")

        except Exception as e:
            print(f"[ERROR] Watcher loop error: {e}")

        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    watch()
