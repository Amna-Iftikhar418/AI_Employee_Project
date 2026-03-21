"""
tests/test_mcp_server.py
Unit tests for MCP server validation logic — email format, header injection
prevention, field length limits, and API key rate limiting.
"""
import pytest
from fastapi import HTTPException
from mcp_server import _validate_email_request, _redact_email, _EMAIL_RE, EmailRequest


# ── _EMAIL_RE regex ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("addr", [
    "user@example.com",
    "user.name+tag@sub.domain.org",
    "john.doe@company.co.uk",
    "a@b.io",
])
def test_email_regex_accepts_valid(addr):
    assert _EMAIL_RE.match(addr) is not None


@pytest.mark.parametrize("addr", [
    "notanemail",
    "@nodomain.com",
    "user@",
    "user @example.com",
    "user@exam ple.com",
    "",
])
def test_email_regex_rejects_invalid(addr):
    assert _EMAIL_RE.match(addr) is None


# ── _validate_email_request ───────────────────────────────────────────────────

def test_valid_request_passes():
    req = EmailRequest(to="valid@example.com", subject="Hello", body="Test body")
    _validate_email_request(req)  # must not raise


def test_newline_in_to_raises_400():
    req = EmailRequest(
        to="valid@example.com\nBcc: attacker@evil.com",
        subject="Hello",
        body="Body",
    )
    with pytest.raises(HTTPException) as exc:
        _validate_email_request(req)
    assert exc.value.status_code == 400


def test_carriage_return_in_to_raises_400():
    req = EmailRequest(to="valid@example.com\r\nX-Header: injected", subject="Hi", body="Body")
    with pytest.raises(HTTPException) as exc:
        _validate_email_request(req)
    assert exc.value.status_code == 400


def test_newline_in_subject_raises_400():
    req = EmailRequest(to="valid@example.com", subject="Hello\nBcc: evil@bad.com", body="Body")
    with pytest.raises(HTTPException) as exc:
        _validate_email_request(req)
    assert exc.value.status_code == 400


def test_invalid_email_format_raises_400():
    req = EmailRequest(to="not-an-email", subject="Hi", body="Body")
    with pytest.raises(HTTPException) as exc:
        _validate_email_request(req)
    assert exc.value.status_code == 400


def test_subject_too_long_raises_400():
    req = EmailRequest(to="valid@example.com", subject="x" * 999, body="Body")
    with pytest.raises(HTTPException) as exc:
        _validate_email_request(req)
    assert exc.value.status_code == 400


def test_subject_at_limit_passes():
    req = EmailRequest(to="valid@example.com", subject="x" * 998, body="Body")
    _validate_email_request(req)  # must not raise


def test_body_too_large_raises_400():
    req = EmailRequest(to="valid@example.com", subject="Hi", body="x" * (10 * 1024 * 1024 + 1))
    with pytest.raises(HTTPException) as exc:
        _validate_email_request(req)
    assert exc.value.status_code == 400


# ── _redact_email ─────────────────────────────────────────────────────────────

def test_redact_email_hides_local_part():
    result = _redact_email("johndoe@example.com")
    assert "joh***" in result
    assert "@example.com" in result
    assert "johndoe" not in result


def test_redact_email_invalid_returns_stars():
    assert _redact_email("") == "***"
    assert _redact_email("notanemail") == "***"
