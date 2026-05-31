#!/usr/bin/env python3
"""
Stop hook: Ralph Wiggum Loop.

When Claude finishes a `claude -p` session, this hook checks whether the task
file referenced in the original prompt has moved to Done/. If not, it re-injects
the original prompt so Claude retries. Stops after MAX_ITERATIONS to prevent
infinite loops.

Event (stdin, JSON):
    {"session_id": "...", "hook_event_name": "Stop", "transcript_path": "..."}

Output (stdout, JSON) — only written when re-injecting:
    {"continue": true, "prompt": "...original prompt..."}

State file: .claude/hooks/.task_state.json  (keyed by session_id)
"""

import json
import re
import sys
from pathlib import Path

VAULT = Path("vault/AI_Employee_Vault")
DONE_DIR = VAULT / "Done"
STATE_FILE = Path(".claude/hooks/.task_state.json")
MAX_ITERATIONS = 10

# Task file patterns that are expected to move to Done/ on completion.
# PLAN_* files are excluded — they live in Plans/, not Done/.
_TASK_PATTERNS = [
    r"\b(TASK_[A-Za-z0-9_\-]+\.md)\b",
    r"\b(LINKEDIN_POST_[A-Za-z0-9_\-]+\.md)\b",
    r"\b(SOCIAL_POST_[A-Za-z0-9_\-]+\.md)\b",
]


# ── State helpers ──────────────────────────────────────────────────────────────

def _load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def _clear_session(all_state: dict, session_id: str) -> None:
    all_state.pop(session_id, None)
    if all_state:
        _save_state(all_state)
    elif STATE_FILE.exists():
        STATE_FILE.unlink()


# ── Done-check ─────────────────────────────────────────────────────────────────

def _task_in_done(task_filename: str) -> bool:
    """Return True if task_filename exists anywhere under Done/."""
    if not DONE_DIR.exists():
        return False
    # rglob covers Done/email/, Done/linkedin/, Done/whatsapp/, etc.
    return bool(next(DONE_DIR.rglob(task_filename), None))


# ── Transcript parsing ─────────────────────────────────────────────────────────

def _get_first_user_prompt(transcript_path: str) -> str | None:
    """Read the transcript file and return the text of the first user message."""
    try:
        raw = Path(transcript_path).read_text(encoding="utf-8").strip()
        if not raw:
            return None

        # Try JSON array format (list of message objects)
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                for entry in data:
                    text = _extract_user_text(entry)
                    if text is not None:
                        return text
        except json.JSONDecodeError:
            pass

        # Try JSONL format (one message object per line)
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                text = _extract_user_text(json.loads(line))
                if text is not None:
                    return text
            except json.JSONDecodeError:
                continue
    except Exception:
        pass
    return None


def _extract_user_text(entry: object) -> str | None:
    """Return the text content of a user/human message, or None if not user."""
    if not isinstance(entry, dict):
        return None

    role = entry.get("role", "")

    # Handle nested wrapper: {"type": "message", "message": {"role": ..., "content": ...}}
    if not role:
        inner = entry.get("message")
        if isinstance(inner, dict):
            return _extract_user_text(inner)
        return None

    if role not in ("user", "human"):
        return None

    content = entry.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                return block.get("text", "")
    return None


# ── Task filename extraction ───────────────────────────────────────────────────

def _find_task_filename(prompt: str) -> str | None:
    """Return the first task filename found in the prompt string, or None."""
    for pattern in _TASK_PATTERNS:
        m = re.search(pattern, prompt)
        if m:
            return m.group(1)
    return None


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    raw = sys.stdin.read().strip()
    try:
        event = json.loads(raw) if raw else {}
    except Exception:
        sys.exit(0)

    session_id = event.get("session_id", "")
    transcript_path = event.get("transcript_path", "")

    all_state = _load_state()
    session = all_state.get(session_id, {})

    # ── First stop event: discover which task this session was processing ──────
    if "task_file" not in session:
        if not transcript_path:
            sys.exit(0)  # No transcript — nothing to track

        prompt = _get_first_user_prompt(transcript_path)
        if not prompt:
            sys.exit(0)  # No user message found

        task_filename = _find_task_filename(prompt)
        if not task_filename:
            sys.exit(0)  # Prompt has no trackable task file reference

        session = {
            "task_file": task_filename,
            "original_prompt": prompt,
            "iterations": 0,
        }

    task_filename = session["task_file"]

    # ── Task complete: file landed in Done/ ───────────────────────────────────
    if _task_in_done(task_filename):
        _clear_session(all_state, session_id)
        sys.exit(0)

    # ── Safety valve: prevent infinite loops ──────────────────────────────────
    iterations = session.get("iterations", 0)
    if iterations >= MAX_ITERATIONS:
        _clear_session(all_state, session_id)
        print(
            f"[stop_hook] MAX_ITERATIONS ({MAX_ITERATIONS}) reached for {task_filename}. "
            f"Exiting to prevent infinite loop.",
            file=sys.stderr,
        )
        sys.exit(0)

    # ── Task not done: re-inject original prompt ───────────────────────────────
    session["iterations"] = iterations + 1
    all_state[session_id] = session
    _save_state(all_state)

    print(json.dumps({"continue": True, "prompt": session["original_prompt"]}))
    sys.exit(0)


if __name__ == "__main__":
    main()
