"""
tests/test_whatsapp_watcher.py
Unit tests for WhatsAppWatcher — dedup key logic, name sanitization,
and inbox file path generation.
"""
from pathlib import Path
import pytest
from whatsapp_watcher import WhatsAppWatcher


def make_watcher(tmp_path: Path) -> WhatsAppWatcher:
    """Instantiate WhatsAppWatcher without starting a Node.js subprocess."""
    vault = tmp_path / "vault" / "AI_Employee_Vault"
    w = WhatsAppWatcher.__new__(WhatsAppWatcher)
    w.vault_path = vault
    w.inbox = vault / "Inbox" / "whatsapp"
    w.inbox.mkdir(parents=True, exist_ok=True)
    w._processed = set()
    w._proc = None
    return w


# ── _make_key ─────────────────────────────────────────────────────────────────

def test_make_key_uses_message_id_when_present():
    w = WhatsAppWatcher.__new__(WhatsAppWatcher)
    key = w._make_key("Amna", "Hi", "msg_abc123xyz")
    assert key == "id::msg_abc123xyz"


def test_make_key_falls_back_to_content_when_no_id():
    w = WhatsAppWatcher.__new__(WhatsAppWatcher)
    key = w._make_key("Amna", "Hi there", "")
    assert key == "Amna::Hi there"


def test_make_key_truncates_text_to_80_chars():
    w = WhatsAppWatcher.__new__(WhatsAppWatcher)
    long_text = "x" * 200
    key = w._make_key("Bob", long_text, "")
    assert len(key) == len("Bob::") + 80


def test_make_key_none_message_id_uses_content():
    w = WhatsAppWatcher.__new__(WhatsAppWatcher)
    key = w._make_key("Bob", "Hello", "")
    assert key.startswith("Bob::")


# ── _sanitize_name ────────────────────────────────────────────────────────────

def test_sanitize_name_strips_emoji():
    w = WhatsAppWatcher.__new__(WhatsAppWatcher)
    result = w._sanitize_name("Amna🌸")
    assert "🌸" not in result
    assert "Amna" in result


def test_sanitize_name_blocks_path_traversal():
    w = WhatsAppWatcher.__new__(WhatsAppWatcher)
    result = w._sanitize_name("../../../etc/passwd")
    assert ".." not in result
    assert "/" not in result
    assert "\\" not in result


def test_sanitize_name_collapses_spaces():
    w = WhatsAppWatcher.__new__(WhatsAppWatcher)
    result = w._sanitize_name("John   Doe")
    assert "  " not in result
    assert "John" in result


def test_sanitize_name_max_length():
    w = WhatsAppWatcher.__new__(WhatsAppWatcher)
    result = w._sanitize_name("A" * 100)
    assert len(result) <= 25


def test_sanitize_name_empty_returns_unknown():
    w = WhatsAppWatcher.__new__(WhatsAppWatcher)
    result = w._sanitize_name("🌸🌸🌸")
    assert result == "unknown"


# ── _create_inbox_file ────────────────────────────────────────────────────────

def test_create_inbox_file_writes_file(tmp_path):
    w = make_watcher(tmp_path)
    w._create_inbox_file("Alice", "Hello!", "unique_msg_001")
    files = list(w.inbox.glob("whatsapp_*.txt"))
    assert len(files) == 1
    content = files[0].read_text(encoding="utf-8")
    assert "Alice" in content
    assert "Hello!" in content


def test_create_inbox_file_deduplicates(tmp_path):
    w = make_watcher(tmp_path)
    w._create_inbox_file("Alice", "Hello!", "unique_msg_001")
    w._create_inbox_file("Alice", "Hello!", "unique_msg_001")  # same ID → skip
    files = list(w.inbox.glob("whatsapp_*.txt"))
    assert len(files) == 1  # only one file created


def test_create_inbox_file_different_ids_both_saved(tmp_path):
    w = make_watcher(tmp_path)
    w._create_inbox_file("Alice", "Hi", "msg_001")
    w._create_inbox_file("Alice", "Hi", "msg_002")  # same text, different ID
    files = list(w.inbox.glob("whatsapp_*.txt"))
    assert len(files) == 2  # both saved — dedup is ID-based now


def test_create_inbox_file_content_format(tmp_path):
    w = make_watcher(tmp_path)
    w._create_inbox_file("Bob", "Test message", "msg_xyz")
    files = list(w.inbox.glob("whatsapp_*.txt"))
    content = files[0].read_text(encoding="utf-8")
    assert "From: Bob" in content
    assert "Source: WhatsApp" in content
    assert "Test message" in content
