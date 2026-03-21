"""
tests/test_send_email_executor.py
Unit tests for send_email_executor — frontmatter parser and section extractor.
These are pure string-processing functions with no external dependencies.
"""
import pytest
from send_email_executor import parse_frontmatter, extract_section


# ── parse_frontmatter ─────────────────────────────────────────────────────────

def test_parse_frontmatter_extracts_fields():
    text = "# Title\n\n---\ntype: email_task\nfrom: john@example.com\nstatus: pending\n---\n\n## Body\n\nContent"
    fields, body = parse_frontmatter(text)
    assert fields["type"] == "email_task"
    assert fields["from"] == "john@example.com"
    assert fields["status"] == "pending"


def test_parse_frontmatter_returns_body():
    text = "---\ntype: email_task\n---\n\n## Proposed Response\n\nDear John,"
    fields, body = parse_frontmatter(text)
    assert "Proposed Response" in body
    assert "Dear John" in body


def test_parse_frontmatter_no_frontmatter():
    text = "Just some text with no frontmatter"
    fields, body = parse_frontmatter(text)
    assert fields == {}
    assert body == text


def test_parse_frontmatter_colon_in_value():
    text = "---\nsubject: Re: Invoice #1234: Payment Due\n---\n\nBody"
    fields, _ = parse_frontmatter(text)
    assert "Invoice" in fields["subject"]


def test_parse_frontmatter_empty_values():
    text = "---\ntype: email_task\nfrom:\n---\n\nBody"
    fields, _ = parse_frontmatter(text)
    assert fields["type"] == "email_task"
    assert fields["from"] == ""


# ── extract_section ───────────────────────────────────────────────────────────

def test_extract_section_basic():
    text = "## Proposed Response\n\nDear John,\n\nThank you.\n\n## Status\n\npending"
    result = extract_section(text, "Proposed Response")
    assert "Dear John" in result
    assert "Thank you" in result
    assert "Status" not in result


def test_extract_section_at_end_of_file():
    text = "## Objective\n\nReply to email.\n\n## Proposed Response\n\nDear John,"
    result = extract_section(text, "Proposed Response")
    assert "Dear John" in result


def test_extract_section_missing_returns_empty():
    text = "## Objective\n\nReply to email.\n"
    result = extract_section(text, "Proposed Response")
    assert result == ""


def test_extract_section_case_insensitive():
    text = "## proposed response\n\nHello there."
    result = extract_section(text, "Proposed Response")
    assert "Hello there" in result


def test_extract_section_strips_whitespace():
    text = "## Proposed Response\n\n   Dear John,   \n\n"
    result = extract_section(text, "Proposed Response")
    assert result == "Dear John,"
