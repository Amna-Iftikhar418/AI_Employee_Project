"""
tests/test_task_processor.py
Unit tests for TaskProcessor — covers email parsing, plan validation,
task name extraction, and task type detection.
"""
from pathlib import Path
import pytest
from task_processor import TaskProcessor


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_processor(tmp_path: Path) -> TaskProcessor:
    """Instantiate TaskProcessor with an isolated temp vault (no real disk side-effects)."""
    tp = TaskProcessor.__new__(TaskProcessor)
    vault = tmp_path / "vault" / "AI_Employee_Vault"

    tp.vault_path            = vault
    tp.needs_action_dir      = vault / "Needs_Action"
    tp.plans_dir             = vault / "Plans"
    tp.pending_approval_dir  = vault / "Pending_Approval"
    tp.approved_dir          = vault / "Approved"
    tp.rejected_dir          = vault / "Rejected"
    tp.done_dir              = vault / "Done"
    tp.logs_dir              = vault / "Logs"
    tp.inbox_dir             = vault / "Inbox"
    tp.dashboard_file        = vault / "Dashboard.md"
    tp.email_needs_action    = tp.needs_action_dir / "email"
    tp.whatsapp_needs_action = tp.needs_action_dir / "whatsapp"
    tp.email_plans           = tp.plans_dir / "email"
    tp.whatsapp_plans        = tp.plans_dir / "whatsapp"
    tp.email_pending         = tp.pending_approval_dir / "email"
    tp.whatsapp_pending      = tp.pending_approval_dir / "whatsapp"
    tp.email_approved        = tp.approved_dir / "email"
    tp.whatsapp_approved     = tp.approved_dir / "whatsapp"
    tp.email_rejected        = tp.rejected_dir / "email"
    tp.whatsapp_rejected     = tp.rejected_dir / "whatsapp"
    tp.email_done            = tp.done_dir / "email"
    tp.whatsapp_done         = tp.done_dir / "whatsapp"
    tp.sensitive_keywords    = ["invoice", "payment", "money"]
    tp.require_approval_for_all = True

    for folder in [tp.email_plans, tp.whatsapp_plans, tp.logs_dir]:
        folder.mkdir(parents=True, exist_ok=True)
    tp.dashboard_file.parent.mkdir(parents=True, exist_ok=True)
    tp.dashboard_file.write_text("# Dashboard\n")
    return tp


# ── extract_task_name ─────────────────────────────────────────────────────────

def test_extract_task_name_strips_prefix():
    tp = TaskProcessor.__new__(TaskProcessor)
    path = Path("vault/Needs_Action/email/TASK_email_john_20260321.md")
    assert tp.extract_task_name(path) == "email_john_20260321"


def test_extract_task_name_without_prefix():
    tp = TaskProcessor.__new__(TaskProcessor)
    path = Path("vault/Needs_Action/email/email_john_20260321.md")
    assert tp.extract_task_name(path) == "email_john_20260321"


# ── get_task_type ─────────────────────────────────────────────────────────────

def test_get_task_type_email(tmp_path):
    tp = TaskProcessor.__new__(TaskProcessor)
    f = tmp_path / "TASK_test.md"
    f.write_text("type: email_task\nstatus: pending\n")
    assert tp.get_task_type(f) == "email_task"


def test_get_task_type_whatsapp(tmp_path):
    tp = TaskProcessor.__new__(TaskProcessor)
    f = tmp_path / "TASK_test.md"
    f.write_text("type: whatsapp_task\nstatus: pending\n")
    assert tp.get_task_type(f) == "whatsapp_task"


def test_get_task_type_unknown(tmp_path):
    tp = TaskProcessor.__new__(TaskProcessor)
    f = tmp_path / "TASK_test.md"
    f.write_text("status: pending\n")
    assert tp.get_task_type(f) == "unknown"


# ── _plan_is_valid ────────────────────────────────────────────────────────────

def test_plan_is_valid_with_proposed_response(tmp_path):
    tp = TaskProcessor.__new__(TaskProcessor)
    plan = tmp_path / "PLAN_test.md"
    plan.write_text("# Plan\n\n## Proposed Response\n\nDear John,\n\nThank you.\n")
    assert tp._plan_is_valid(plan) is True


def test_plan_is_valid_missing_section(tmp_path):
    tp = TaskProcessor.__new__(TaskProcessor)
    plan = tmp_path / "PLAN_test.md"
    plan.write_text("# Plan\n\n## Objective\n\nReply to email.\n\n## Action Plan\n\n- [ ] Do something\n")
    assert tp._plan_is_valid(plan) is False


def test_plan_is_valid_case_insensitive(tmp_path):
    tp = TaskProcessor.__new__(TaskProcessor)
    plan = tmp_path / "PLAN_test.md"
    plan.write_text("# Plan\n\n## proposed response\n\nDear John,\n")
    assert tp._plan_is_valid(plan) is True


def test_plan_is_valid_returns_false_on_empty_file(tmp_path):
    tp = TaskProcessor.__new__(TaskProcessor)
    plan = tmp_path / "PLAN_test.md"
    plan.write_text("")
    assert tp._plan_is_valid(plan) is False


# ── _parse_task_content ───────────────────────────────────────────────────────

SAMPLE_TASK = """\
# TASK_email_john_20260321

---
type: email_task
source: gmail
status: pending
---

**From:** John Doe <john.doe@example.com>
**Subject:** Invoice #1234 Payment

## Body

Hi, please confirm payment for invoice #1234.
"""


def test_parse_task_content_extracts_email(tmp_path):
    tp = TaskProcessor.__new__(TaskProcessor)
    f = tmp_path / "TASK_test.md"
    f.write_text(SAMPLE_TASK)
    data = tp._parse_task_content(f)
    assert data["sender_email"] == "john.doe@example.com"


def test_parse_task_content_extracts_first_name(tmp_path):
    tp = TaskProcessor.__new__(TaskProcessor)
    f = tmp_path / "TASK_test.md"
    f.write_text(SAMPLE_TASK)
    data = tp._parse_task_content(f)
    assert data["first_name"] == "John"


def test_parse_task_content_extracts_subject(tmp_path):
    tp = TaskProcessor.__new__(TaskProcessor)
    f = tmp_path / "TASK_test.md"
    f.write_text(SAMPLE_TASK)
    data = tp._parse_task_content(f)
    assert "Invoice" in data["subject"]


def test_parse_task_content_detects_payment_keyword(tmp_path):
    tp = TaskProcessor.__new__(TaskProcessor)
    f = tmp_path / "TASK_test.md"
    f.write_text(SAMPLE_TASK)
    data = tp._parse_task_content(f)
    assert "payment" in data["keywords"] or "invoice" in data["keywords"]
    assert data["priority"] == "high"


def test_parse_task_content_no_sender_gives_empty_email(tmp_path):
    tp = TaskProcessor.__new__(TaskProcessor)
    f = tmp_path / "TASK_test.md"
    f.write_text("# TASK\n\n**Subject:** Hello\n\n## Body\n\nTest\n")
    data = tp._parse_task_content(f)
    assert data["sender_email"] == ""


# ── write_log + update_dashboard (file-locked writes) ────────────────────────

def test_write_log_creates_file(tmp_path):
    tp = make_processor(tmp_path)
    tp.write_log("test_task", "TEST_ACTION", "details here")
    logs = list(tp.logs_dir.glob("log_*.md"))
    assert len(logs) == 1
    assert "TEST_ACTION" in logs[0].read_text()


def test_update_dashboard_appends(tmp_path):
    tp = make_processor(tmp_path)
    tp.update_dashboard("task_one", "Completed")
    tp.update_dashboard("task_two", "Rejected")
    content = tp.dashboard_file.read_text()
    assert "task_one" in content
    assert "task_two" in content
    assert "Completed" in content
    assert "Rejected" in content
