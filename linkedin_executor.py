"""
linkedin_executor.py
Automated LinkedIn post executor — called by approved_watcher.py.

Reads an approved LINKEDIN_POST_*.md file, calls Node.js Playwright to post,
then updates metadata, appends to Dashboard/Log, and moves file to Done/.

Retry logic: up to MAX_RETRIES attempts with logging for each attempt.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

from filelock import FileLock

sys.path.insert(0, str(Path(__file__).parent))
from vault_utils import append_log, append_dashboard, parse_frontmatter

ROOT        = Path(__file__).parent
VAULT       = ROOT / "vault" / "AI_Employee_Vault"
APPROVED    = VAULT / "Approved"  / "linkedin"
DONE        = VAULT / "Done"      / "linkedin"
PLANS       = VAULT / "Plans"     / "linkedin"
DASHBOARD   = VAULT / "Dashboard.md"
LOGS_DIR    = VAULT / "Logs"
NODE_SCRIPT = ROOT / "linkedin_post.js"

MAX_RETRIES = 2   # one retry on non-terminal errors
DEV_MODE = os.getenv("DEV_MODE", "false").strip().lower() == "true"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_frontmatter(text: str) -> dict:
    fields, _ = parse_frontmatter(text)
    return fields


def _update_frontmatter(text: str, updates: dict) -> str:
    """Patch specific keys in the YAML frontmatter block."""
    if not text.startswith("---"):
        return text
    end = text.find("---", 3)
    if end == -1:
        return text

    lines = text[3:end].splitlines()
    new_lines = []
    updated = set()

    for line in lines:
        if ":" in line:
            key = line.split(":", 1)[0].strip()
            if key in updates:
                new_lines.append(f"{key}: {updates[key]}")
                updated.add(key)
                continue
        new_lines.append(line)

    for key, val in updates.items():
        if key not in updated:
            new_lines.append(f"{key}: {val}")

    return "---\n" + "\n".join(new_lines) + "\n" + text[end:]


def _extract_post_content(text: str) -> str:
    """Pull text under the ## Post Content section."""
    m = re.search(r"## Post Content\s*\n(.*?)(?=\n##|\Z)", text, re.DOTALL)
    return m.group(1).strip() if m else ""


def _append_dashboard(block: str):
    append_dashboard(DASHBOARD, block)


def _append_log(block: str):
    append_log(LOGS_DIR, block)


def _cleanup_linkedin_related_files(file_path: Path, plan_reference: str):
    """Remove related LinkedIn plan/pending files after successful post."""
    # Remove plan file
    if plan_reference:
        plan_path = PLANS / Path(plan_reference).name
        if plan_path.exists():
            plan_path.unlink()
            print(f"[CLEANUP] Deleted LinkedIn plan file: {plan_path}")

    # Also look for plans matching the file stem
    for plan_file in PLANS.glob(f"*{file_path.stem}*"):
        if plan_file.exists():
            plan_file.unlink()
            print(f"[CLEANUP] Deleted LinkedIn plan file: {plan_file}")

    # Remove from Pending_Approval/linkedin if exists
    linkedin_pending = VAULT / "Pending_Approval" / "linkedin"
    if linkedin_pending.exists():
        for pending_file in linkedin_pending.glob(f"*{file_path.stem}*"):
            if pending_file.exists():
                pending_file.unlink()
                print(f"[CLEANUP] Deleted from Pending_Approval: {pending_file}")


# ── Browser call (single attempt) ────────────────────────────────────────────

def _clean_profile_locks():
    """Delete Chrome SingletonLock files to prevent exit-code 21 crashes."""
    profile_dir = Path.home() / ".linkedin-profile"
    for lock in ("SingletonLock", "SingletonSocket", "SingletonCookie"):
        lock_path = profile_dir / lock
        if lock_path.exists():
            try:
                lock_path.unlink()
                print(f"[PRE-FLIGHT] Removed stale lock: {lock_path}")
            except Exception as e:
                print(f"[WARN] Could not remove {lock}: {e}")


def _run_browser_attempt(post_content: str, attempt: int) -> dict:
    """
    Write post content to temp file, invoke Node.js script, parse JSON result.
    Returns dict with keys: success (bool), postUrl (str), error (str).
    """
    # Clean profile locks before every attempt
    _clean_profile_locks()

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False, encoding="utf-8"
        ) as tmp:
            tmp.write(post_content)
            tmp_path = tmp.name

        print(f"[AUTO]  [Attempt {attempt}/{MAX_RETRIES}] Launching browser...")
        process = subprocess.Popen(
            ["node", str(NODE_SCRIPT), "--content-file", tmp_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=str(ROOT),
        )

        # Wait with a hard timeout so a hung Node process never blocks forever
        try:
            stdout_output, _ = process.communicate(timeout=180)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
            return {"success": False, "error": f"Browser script timed out after 180s on attempt {attempt}"}

        # Print all output and find the JSON result line
        json_result = None
        for line in stdout_output.splitlines():
            line = line.rstrip()
            print(f"[NODE] {line}")
            stripped = line.strip()
            if stripped.startswith("{"):
                try:
                    json_result = json.loads(stripped)
                except json.JSONDecodeError:
                    pass

        if json_result:
            return json_result

        # No valid JSON found
        return {
            "success": False,
            "error": f"No JSON response from browser script (exit code {process.returncode})"
        }

    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Browser script timed out on attempt {attempt}"}
    except FileNotFoundError:
        return {"success": False, "error": "node is not installed or not in PATH"}
    except Exception as e:
        return {"success": False, "error": f"Unexpected error on attempt {attempt}: {e}"}
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


# ── Main entry point ──────────────────────────────────────────────────────────

def run_linkedin_post(file_path):
    """
    Process one approved LinkedIn post file end-to-end.
    Retries up to MAX_RETRIES times before giving up.
    On failure: logs error, leaves file in Approved/ (retryable on restart).
    On success: updates frontmatter, logs, moves to Done/.
    """
    file_path = Path(file_path)
    print(f"\n[AUTO] -- Processing: {file_path.name}")

    # Read file
    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"[ERROR] Cannot read {file_path.name}: {e}")
        return

    # Guard: correct type
    fm = _extract_frontmatter(content)
    if fm.get("type") != "linkedin_post":
        print(f"[SKIP]  Not a linkedin_post: {file_path.name}")
        return

    # Guard: already completed
    if fm.get("status") == "completed":
        print(f"[SKIP]  Already completed: {file_path.name}")
        return

    # Guard: post_url already set (published but cleanup crashed) — auto-recover
    if fm.get("post_url"):
        print(f"[RECOVER] post_url already set — post was published but not moved. Auto-recovering...")
        DONE.mkdir(parents=True, exist_ok=True)
        done_path = DONE / file_path.name
        shutil.move(str(file_path), str(done_path))
        print(f"[RECOVER] Moved to Done/{file_path.name}")
        return True

    # Extract post content
    post_content = _extract_post_content(content)
    if not post_content:
        print(f"[ERROR] No ## Post Content section in {file_path.name}")
        return False

    topic          = fm.get("topic", "")
    # Normalize plan_reference: strip any accidental subfolder prefix
    raw_ref        = fm.get("plan_reference", "")
    plan_reference = Path(raw_ref).name if raw_ref else ""
    word_count     = len(post_content.split())

    print(f"[AUTO]  Topic     : {topic}")
    print(f"[AUTO]  Words     : {word_count}")
    print(f"[AUTO]  Max tries : {MAX_RETRIES}")

    # Verify plan file exists
    if plan_reference and not (PLANS / plan_reference).exists():
        print(f"[ERROR] Plan file missing: {plan_reference}")
        _append_log(
            f"## {datetime.now().isoformat()} — {file_path.stem} [FAILURE]\n\n"
            f"- Post File: {file_path.name}\n"
            f"- Step Failed: plan_verification\n"
            f"- Error: Plan file not found: {plan_reference}\n"
            f"- Status: failed\n"
            f"- File Location: Approved/ (unchanged)\n"
        )
        return False

    # ── DEV_MODE guard ────────────────────────────────────────────────────────
    if DEV_MODE:
        print(f"[DEV MODE] Would have posted to LinkedIn — skipping actual browser call.")
        _append_log(
            f"## {datetime.now().isoformat()} — {file_path.stem} [DEV MODE]\n\n"
            f"- Post File: {file_path.name}\n"
            f"- Topic: {topic}\n"
            f"- Status: skipped (DEV_MODE=true)\n"
        )
        return False

    # ── Retry loop ────────────────────────────────────────────────────────────
    response = {}
    last_error = "No attempts made"

    for attempt in range(1, MAX_RETRIES + 1):
        if attempt > 1:
            backoff = 5 * (attempt - 1)
            print(f"[RETRY] Waiting {backoff}s before attempt {attempt}/{MAX_RETRIES}...")
            time.sleep(backoff)
            print(f"[RETRY] Attempt {attempt}/{MAX_RETRIES} — previous error: {last_error}")

        response = _run_browser_attempt(post_content, attempt)

        if response.get("success"):
            print(f"[SUCCESS] Post published on attempt {attempt}/{MAX_RETRIES}!")
            break

        last_error = response.get("error", "Unknown error")
        print(f"[ERROR] Attempt {attempt}/{MAX_RETRIES} failed: {last_error}")

        # Terminal errors — no point retrying
        TERMINAL = (
            "NOT_LOGGED_IN",
            "node is not installed",
            "All text entry methods failed",
            "Missing --content-file",
        )
        if any(t in last_error for t in TERMINAL):
            print(f"[ERROR] Terminal error — stopping retries.")
            break

    # ── Handle final result ───────────────────────────────────────────────────

    if not response.get("success"):
        # All attempts failed
        final_error = response.get("error", last_error)
        print(f"[ERROR] All {MAX_RETRIES} attempts failed.")
        print(f"[ERROR] Final error: {final_error}")
        _append_log(
            f"## {datetime.now().isoformat()} — {file_path.stem} [FAILURE]\n\n"
            f"- Post File: {file_path.name}\n"
            f"- Step Failed: browser_post\n"
            f"- Error: {final_error}\n"
            f"- Attempts: {MAX_RETRIES}\n"
            f"- Status: failed\n"
            f"- File Location: Approved/ (unchanged — retryable on restart)\n"
        )
        return False

    # ── Success path ──────────────────────────────────────────────────────────

    post_url     = response.get("postUrl", "")
    published_at = datetime.now().isoformat()

    print(f"[SUCCESS] Posted to LinkedIn!")
    if post_url:
        print(f"[SUCCESS] URL: {post_url}")

    # Atomic frontmatter update (includes post_url as duplicate guard)
    content = file_path.read_text(encoding="utf-8")
    file_path.write_text(
        _update_frontmatter(content, {
            "status":       "completed",
            "published_at": published_at,
            "executed_by":  "approved_watcher_auto",
            "post_url":     post_url,
        }),
        encoding="utf-8",
    )

    # Append to Dashboard
    _append_dashboard(
        f"## Recent Activity\n\n"
        f"- LinkedIn post published (auto): {file_path.name}\n"
        f"- Topic: {topic}\n"
        f"- Plan followed: {plan_reference}\n"
        f"- Published at: {published_at}\n"
        f"- Post URL: {post_url}\n"
        f"- Date: {datetime.now().strftime('%Y-%m-%d')}\n"
    )

    # Append to log
    _append_log(
        f"## {published_at} — {file_path.stem} [LINKEDIN POST PUBLISHED]\n\n"
        f"- Post File: {file_path.name}\n"
        f"- Plan Reference: {plan_reference}\n"
        f"- Topic: {topic}\n"
        f"- Published At: {published_at}\n"
        f"- Word Count: {word_count}\n"
        f"- Post URL: {post_url}\n"
        f"- Status: completed\n"
        f"- Executed By: approved_watcher_auto\n"
    )

    # Move to Done/
    DONE.mkdir(parents=True, exist_ok=True)
    done_path = DONE / file_path.name
    shutil.move(str(file_path), str(done_path))

    # Cleanup related files
    _cleanup_linkedin_related_files(file_path, plan_reference)

    print(f"[AUTO]  Moved to Done/{file_path.name}")
    print(f"[AUTO]  Dashboard + log updated.")
    return True
