#!/usr/bin/env python3
"""
Functional test for .claude/hooks/stop_hook.py  (TASK-9.5)

Tests:
  1. No task filename in prompt  -> hook exits silently (not triggered)
  2. Task NOT in Done/           -> hook re-injects prompt (loop iteration)
  3. Task in Done/               -> hook exits cleanly (no re-injection)
  4. MAX_ITERATIONS guard        -> exits cleanly after 10 re-injections
  5. Multi-step loop end-to-end  -> loops N times, then exits when file lands in Done/

Run from the project root:
    python docs/test_stop_hook.py
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Paths are relative to project root (where the hook expects them)
PROJECT_ROOT = Path(__file__).parent.parent
HOOK = PROJECT_ROOT / ".claude/hooks/stop_hook.py"
VAULT = PROJECT_ROOT / "vault/AI_Employee_Vault"
DONE_DIR = VAULT / "Done"
STATE_FILE = PROJECT_ROOT / ".claude/hooks/.task_state.json"

TEST_TASK = "TASK_stop_hook_test_9999.md"
SESSION_ID = "test-session-stop-hook-9999"

PASS = "PASS"
FAIL = "FAIL"
_failures: list[str] = []


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_transcript(task_name: str, tmp: Path) -> str:
    path = tmp / "transcript.jsonl"
    path.write_text(
        json.dumps({"role": "user", "content": f"Process {task_name} and move it to Done/"}) + "\n",
        encoding="utf-8",
    )
    return str(path)


def _make_transcript_no_task(tmp: Path) -> str:
    path = tmp / "transcript_no_task.jsonl"
    path.write_text(
        json.dumps({"role": "user", "content": "Tell me a joke"}) + "\n",
        encoding="utf-8",
    )
    return str(path)


def _call_hook(session_id: str, transcript_path: str) -> tuple[int, str, str]:
    event = json.dumps({"session_id": session_id, "transcript_path": transcript_path})
    result = subprocess.run(
        [sys.executable, str(HOOK)],
        input=event,
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def _reset_state() -> None:
    if STATE_FILE.exists():
        try:
            state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            state.pop(SESSION_ID, None)
            if state:
                STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
            else:
                STATE_FILE.unlink()
        except Exception:
            STATE_FILE.unlink(missing_ok=True)


def _assert(condition: bool, message: str) -> bool:
    if not condition:
        _failures.append(message)
        print(f"  {FAIL}: {message}")
        return False
    return True


def _done_path(subdir: str = "email") -> Path:
    return DONE_DIR / subdir / TEST_TASK


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_no_task_in_prompt(tmp: Path) -> None:
    """Prompt with no TASK_*.md filename -> hook exits silently."""
    _reset_state()
    transcript = _make_transcript_no_task(tmp)
    rc, out, err = _call_hook(SESSION_ID, transcript)
    ok = (
        _assert(rc == 0, f"exit code should be 0, got {rc}")
        and _assert(out == "", f"stdout should be empty, got: {out!r}")
    )
    print(f"  {PASS if ok else FAIL}: prompt with no task filename -> silent exit")


def test_loop_when_not_done(tmp: Path) -> None:
    """Task NOT in Done/ -> hook outputs continue=true with original prompt."""
    _reset_state()
    transcript = _make_transcript(TEST_TASK, tmp)
    rc, out, err = _call_hook(SESSION_ID, transcript)

    ok = _assert(rc == 0, f"exit code {rc}")
    if ok:
        try:
            data = json.loads(out)
            ok = (
                _assert(data.get("continue") is True, f"continue should be true, got {data}")
                and _assert(TEST_TASK in data.get("prompt", ""), f"original prompt missing in output")
            )
        except json.JSONDecodeError:
            ok = _assert(False, f"stdout is not valid JSON: {out!r}")
    print(f"  {PASS if ok else FAIL}: task not in Done/ -> re-injects prompt")


def test_exit_when_done(tmp: Path) -> None:
    """Task IS in Done/ -> hook exits cleanly (empty stdout)."""
    _reset_state()
    p = _done_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.touch()
    try:
        transcript = _make_transcript(TEST_TASK, tmp)
        rc, out, err = _call_hook(SESSION_ID, transcript)
        ok = (
            _assert(rc == 0, f"exit code {rc}")
            and _assert(out == "", f"stdout should be empty, got: {out!r}")
        )
        print(f"  {PASS if ok else FAIL}: task in Done/ -> clean exit (no re-injection)")
    finally:
        p.unlink(missing_ok=True)


def test_max_iterations_guard(tmp: Path) -> None:
    """At MAX_ITERATIONS (10) -> exits cleanly with no re-injection."""
    _reset_state()
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    state = {
        SESSION_ID: {
            "task_file": TEST_TASK,
            "original_prompt": f"Process {TEST_TASK}",
            "iterations": 10,  # = MAX_ITERATIONS
        }
    }
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")

    transcript = _make_transcript(TEST_TASK, tmp)
    rc, out, err = _call_hook(SESSION_ID, transcript)
    ok = (
        _assert(rc == 0, f"exit code {rc}")
        and _assert(out == "", f"stdout should be empty at MAX_ITERATIONS, got: {out!r}")
    )
    print(f"  {PASS if ok else FAIL}: MAX_ITERATIONS guard -> clean exit (no infinite loop)")


def test_multi_step_loop(tmp: Path) -> None:
    """
    End-to-end loop simulation:
      Iter 1: not done -> re-inject
      Iter 2: not done -> re-inject
      Iter 3: file lands in Done/ -> clean exit
    """
    _reset_state()
    transcript = _make_transcript(TEST_TASK, tmp)

    # Iter 1
    rc, out, _ = _call_hook(SESSION_ID, transcript)
    try:
        d = json.loads(out)
        iter1_ok = _assert(d.get("continue") is True, f"iter 1: expected continue=true, got {d}")
    except Exception:
        iter1_ok = _assert(False, f"iter 1: invalid JSON: {out!r}")

    # Iter 2
    rc, out, _ = _call_hook(SESSION_ID, transcript)
    try:
        d = json.loads(out)
        iter2_ok = _assert(d.get("continue") is True, f"iter 2: expected continue=true, got {d}")
    except Exception:
        iter2_ok = _assert(False, f"iter 2: invalid JSON: {out!r}")

    # Now the task file "lands in Done/" (simulating the approved_watcher moving it)
    p = _done_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.touch()
    try:
        # Iter 3: task is done -> clean exit
        rc, out, _ = _call_hook(SESSION_ID, transcript)
        iter3_ok = (
            _assert(rc == 0, f"iter 3: exit code {rc}")
            and _assert(out == "", f"iter 3: expected empty stdout, got: {out!r}")
        )

        all_ok = iter1_ok and iter2_ok and iter3_ok
        print(f"  {PASS if all_ok else FAIL}: multi-step loop - looped 2x, then exited cleanly when task landed in Done/")
    finally:
        p.unlink(missing_ok=True)


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    print(f"Stop Hook Functional Tests  ({HOOK.relative_to(PROJECT_ROOT)})\n")
    with tempfile.TemporaryDirectory() as tmp_str:
        tmp = Path(tmp_str)
        print("[1/5] No task filename in prompt")
        test_no_task_in_prompt(tmp)

        print("[2/5] Task not in Done/ -> re-inject prompt")
        test_loop_when_not_done(tmp)

        print("[3/5] Task in Done/ -> clean exit")
        test_exit_when_done(tmp)

        print("[4/5] MAX_ITERATIONS guard -> clean exit")
        test_max_iterations_guard(tmp)

        print("[5/5] Multi-step loop: loops until file lands in Done/")
        test_multi_step_loop(tmp)

    _reset_state()  # clean up any leftover state

    print()
    if _failures:
        print(f"FAILED - {len(_failures)} failure(s):")
        for f in _failures:
            print(f"  • {f}")
        sys.exit(1)
    else:
        print("All 5 tests passed. Stop hook (Ralph Wiggum Loop) is working correctly.")


if __name__ == "__main__":
    main()
