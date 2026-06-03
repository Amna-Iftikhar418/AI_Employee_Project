"""
browser_executor.py
Direct browser executor for approved browser tasks.
Delegates actual Playwright work to mcp_servers/browser_mcp/run_task.py
via the browser_mcp's uv environment (which has Playwright + Chromium installed).

Handles: navigate (screenshot), scrape (page text)
Fill-form / submit tasks still require the browser_handler skill via Claude.
"""

import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent
VAULT = ROOT / "vault" / "AI_Employee_Vault"
BROWSER_MCP_DIR = ROOT / "mcp_servers" / "browser_mcp"
RUN_TASK_SCRIPT = BROWSER_MCP_DIR / "run_task.py"

sys.path.insert(0, str(ROOT))
from vault_utils import append_log, append_dashboard  # noqa: E402


# ── helpers ────────────────────────────────────────────────────────────────────

def _read_frontmatter(text: str) -> dict:
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    fm = {}
    for line in text[3:end].splitlines():
        line = line.strip()
        # match: key: value  OR  key: "value"
        m = re.match(r'^(\w+):\s*"?([^"]*)"?\s*$', line)
        if m:
            fm[m.group(1)] = m.group(2).strip()
    return fm


def _update_file_status(file_path: Path, status: str) -> None:
    try:
        text = file_path.read_text(encoding="utf-8")
        if re.search(r"^status:", text, re.MULTILINE):
            text = re.sub(r"^status:.*$", f"status: {status}", text, flags=re.MULTILINE)
        else:
            text = text.replace("---\n", f"---\nstatus: {status}\n", 1)
        file_path.write_text(text, encoding="utf-8")
    except Exception:
        pass


def _log(task_name: str, action: str, detail: str) -> None:
    logs_dir = VAULT / "Logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    append_log(logs_dir, f"[{datetime.now().strftime('%H:%M')}] [browser] {action}: {task_name} - {detail}")


def _dashboard(line: str) -> None:
    dashboard = VAULT / "Dashboard.md"
    append_dashboard(dashboard, line)


def _screenshots_dir() -> Path:
    d = VAULT / "Screenshots"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _move_to_done(file_path: Path) -> None:
    done_dir = VAULT / "Done" / "browser"
    done_dir.mkdir(parents=True, exist_ok=True)
    try:
        file_path.replace(done_dir / file_path.name)
    except Exception as e:
        print(f"[browser_executor] Could not move to Done: {e}")


def _move_to_rejected(file_path: Path, reason: str) -> None:
    rejected_dir = VAULT / "Rejected" / "browser"
    rejected_dir.mkdir(parents=True, exist_ok=True)
    try:
        _update_file_status(file_path, "rejected")
        file_path.replace(rejected_dir / file_path.name)
        print(f"[browser_executor] Moved to Rejected: {reason}")
    except Exception as e:
        print(f"[browser_executor] Could not move to Rejected: {e}")


# ── main executor ──────────────────────────────────────────────────────────────

def run_browser_task(file_path: Path) -> bool:
    """Execute an approved browser task. Returns True on success."""
    try:
        text = file_path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"[browser_executor] Cannot read task file: {e}")
        return False

    fm = _read_frontmatter(text)
    task_name = file_path.stem
    status = fm.get("status", "").strip().lower()
    if status == "completed":
        print(f"[browser_executor] Already completed — skipping: {task_name}")
        return True

    url = fm.get("url", "").strip()
    action = fm.get("action", "navigate").strip().lower()

    # fall back to body JSON for old-format tasks
    if not url:
        m = re.search(r'"url"\s*:\s*"([^"]+)"', text)
        if m:
            url = m.group(1)
    if action in ("browser", ""):
        m = re.search(r'"action"\s*:\s*"([^"]+)"', text)
        action = m.group(1).lower() if m else "navigate"

    if not url:
        print(f"[browser_executor] No URL found — rejecting: {task_name}")
        _log(task_name, "ERROR", "No URL in task file")
        _move_to_rejected(file_path, "No URL in task file")
        return False

    # fill-form / submit require interactive Claude session — not automatable here
    if action in ("fill-form", "submit"):
        reason = f"'{action}' requires manual execution via the browser_handler Claude skill"
        print(f"[browser_executor] {reason}")
        _log(task_name, "REJECTED", reason)
        _move_to_rejected(file_path, reason)
        return False

    print(f"[browser_executor] Running '{action}' on {url}")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    screenshot_path = _screenshots_dir() / f"browser_{task_name}_{ts}.png"

    # Scrape output goes to Plans/browser/
    scrape_out = None
    if action == "scrape":
        plans_dir = VAULT / "Plans" / "browser"
        plans_dir.mkdir(parents=True, exist_ok=True)
        scrape_out = plans_dir / f"SCRAPE_{task_name}_{ts}.txt"

    cmd = [
        "uv", "--directory", str(BROWSER_MCP_DIR),
        "run", "python", str(RUN_TASK_SCRIPT),
        url, action, str(screenshot_path),
    ]
    if scrape_out:
        cmd.append(str(scrape_out))

    try:
        result = subprocess.run(
            cmd,
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.stdout:
            print(result.stdout.strip())
        if result.stderr:
            print(result.stderr.strip(), file=sys.stderr)

        if result.returncode != 0:
            error_msg = result.stderr.strip() or f"exit code {result.returncode}"
            print(f"[browser_executor] run_task failed: {error_msg}")
            _log(task_name, "ERROR", error_msg)
            _move_to_rejected(file_path, error_msg)
            return False

    except subprocess.TimeoutExpired:
        print(f"[browser_executor] Timed out after 60s")
        _log(task_name, "ERROR", "Timed out after 60s")
        _move_to_rejected(file_path, "Timeout")
        return False
    except Exception as e:
        print(f"[browser_executor] Subprocess error: {e}")
        _log(task_name, "ERROR", str(e))
        _move_to_rejected(file_path, str(e))
        return False

    # Success
    detail = f"{action} on {url} | screenshot: {screenshot_path.name}"
    _log(task_name, "DONE", detail)
    _dashboard(
        f"- [{datetime.now().strftime('%H:%M')}] Browser: {action} on {url} "
        f"— success | {screenshot_path.name}"
    )
    _update_file_status(file_path, "completed")
    _move_to_done(file_path)
    print(f"[browser_executor] Done. Screenshot: {screenshot_path}")
    return True


# ── CLI entry ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python browser_executor.py <path/to/TASK_*.md>")
        sys.exit(1)
    success = run_browser_task(Path(sys.argv[1]))
    sys.exit(0 if success else 1)
