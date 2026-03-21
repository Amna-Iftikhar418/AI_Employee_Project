"""
linkedin_executor.py
Automated LinkedIn post executor — called by approved_watcher.py.

Reads an approved LINKEDIN_POST_*.md file, calls Node.js Playwright to post,
then updates metadata, appends to Dashboard/Log, and moves file to Done/.

Never modifies any existing skill files or watchers.
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

from filelock import FileLock

ROOT    = Path(__file__).parent
VAULT   = ROOT / "vault" / "AI_Employee_Vault"
APPROVED   = VAULT / "Approved"  / "linkedin"
DONE       = VAULT / "Done"      / "linkedin"
PLANS      = VAULT / "Plans"     / "linkedin"
DASHBOARD  = VAULT / "Dashboard.md"
LOGS_DIR   = VAULT / "Logs"
NODE_SCRIPT = ROOT / "linkedin_post.js"


# ── Helpers ──────────────────────────────────────────────────────────────────

def _extract_frontmatter(text: str) -> dict:
    """Return key/value dict from YAML frontmatter block."""
    fields = {}
    if not text.startswith("---"):
        return fields
    end = text.find("---", 3)
    if end == -1:
        return fields
    for line in text[3:end].splitlines():
        if ":" in line:
            key, _, val = line.partition(":")
            fields[key.strip()] = val.strip()
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
    DASHBOARD.parent.mkdir(parents=True, exist_ok=True)
    lock_path = str(DASHBOARD.resolve()) + ".lock"
    with FileLock(lock_path, timeout=10):
        with open(DASHBOARD, "a", encoding="utf-8") as f:
            f.write("\n" + block + "\n")


def _append_log(block: str):
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    log_file = LOGS_DIR / f"log_{today}.md"
    lock_path = str(log_file.resolve()) + ".lock"
    with FileLock(lock_path, timeout=10):
        with open(log_file, "a", encoding="utf-8") as f:
            f.write("\n" + block + "\n")


# ── Main entry point ─────────────────────────────────────────────────────────

def run_linkedin_post(file_path):
    """
    Process one approved LinkedIn post file end-to-end.
    On any error: prints message, leaves file in Approved/ (retryable).
    """
    file_path = Path(file_path)
    print(f"[AUTO] Detected: {file_path.name}")

    # Read file
    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"[ERROR] Cannot read {file_path.name}: {e}")
        return

    # Guard: correct type and not already done
    fm = _extract_frontmatter(content)
    if fm.get("type") != "linkedin_post":
        print(f"[SKIP]  Not a linkedin_post: {file_path.name}")
        return
    if fm.get("status") == "completed":
        print(f"[SKIP]  Already completed: {file_path.name}")
        return
    # ── DUPLICATE GUARD ────────────────────────────────────────────────────────
    # If post_url is already written, the post was published but cleanup crashed.
    # Skip immediately to prevent re-posting the same content.
    if fm.get("post_url"):
        print(f"[SKIP]  post_url already set — post was already published: {file_path.name}")
        print(f"[SKIP]  Move file manually to Done/ if cleanup is needed.")
        return
    post_content = _extract_post_content(content)
    if not post_content:
        print(f"[ERROR] No ## Post Content section in {file_path.name}")
        return

    topic          = fm.get("topic", "")
    plan_reference = fm.get("plan_reference", "")
    word_count     = len(post_content.split())

    print(f"[AUTO]  Topic     : {topic}")
    print(f"[AUTO]  Words     : {word_count}")

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
        return

    # Write post content to a temp file for the Node.js script
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False, encoding="utf-8"
        ) as tmp:
            tmp.write(post_content)
            tmp_path = tmp.name

        # Call Node.js Playwright script
        print(f"[AUTO]  Launching browser...")
        result = subprocess.run(
            ["node", str(NODE_SCRIPT), "--content-file", tmp_path],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(ROOT),
        )

        if result.stderr.strip():
            for line in result.stderr.strip().splitlines():
                print(f"[AUTO]  {line}")

        # Parse JSON result from stdout
        response = {}
        for line in result.stdout.strip().splitlines():
            line = line.strip()
            if line.startswith("{"):
                try:
                    response = json.loads(line)
                    break
                except json.JSONDecodeError:
                    pass

        if not response.get("success"):
            error_msg = response.get("error", "No JSON response from browser script")
            print(f"[ERROR] Posting failed: {error_msg}")
            _append_log(
                f"## {datetime.now().isoformat()} — {file_path.stem} [FAILURE]\n\n"
                f"- Post File: {file_path.name}\n"
                f"- Step Failed: browser_post\n"
                f"- Error: {error_msg}\n"
                f"- Reason Code: post_submission_failed\n"
                f"- Status: failed\n"
                f"- File Location: Approved/ (unchanged — retryable)\n"
            )
            return

    except subprocess.TimeoutExpired:
        print("[ERROR] Browser script timed out (120s)")
        return
    except Exception as e:
        print(f"[ERROR] Unexpected error running browser script: {e}")
        return
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    # ── Success path ──────────────────────────────────────────────────────────

    post_url     = response.get("postUrl", "")
    published_at = datetime.now().isoformat()

    print(f"[SUCCESS] Posted to LinkedIn!")
    if post_url:
        print(f"[SUCCESS] URL: {post_url}")

    # ── Update frontmatter — single atomic write with all post-success fields ──
    # post_url is included so the duplicate guard fires if a later step crashes
    # and this file is encountered again on the next watcher run.
    content = file_path.read_text(encoding="utf-8")
    file_path.write_text(
        _update_frontmatter(content, {
            "status":       "completed",
            "published_at": published_at,
            "executed_by":  "approved_watcher_auto",
            "attempts":     "1",
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
        f"- Attempts: 1\n"
        f"- Executed By: approved_watcher_auto\n"
        f"- Status: completed\n"
    )

    # Move to Done/
    DONE.mkdir(parents=True, exist_ok=True)
    done_path = DONE / file_path.name
    shutil.move(str(file_path), str(done_path))

    print(f"[AUTO]  Moved to Done/{file_path.name}")
    print(f"[AUTO]  Dashboard + log updated.")
