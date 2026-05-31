"""
Browser MCP Server — Web automation for payment portals and form filling.

Tools:
  browser_navigate      — Navigate to a URL and wait for page load
  browser_get_content   — Get current page URL, title, and visible text
  browser_click         — Click an element by CSS selector or visible text
  browser_fill_field    — Fill a form input field by CSS selector
  browser_screenshot    — Capture and save a screenshot to the vault
  browser_check_element — Check whether an element exists on the page
  browser_get_text      — Get text content of a specific element
  browser_select_option — Select a value from a <select> dropdown
  browser_close_session — Close the browser and release all resources

Safety contract:
  This server exposes raw browser capabilities.
  Payment portal interactions MUST be routed through the vault HITL pipeline:
    Pending_Approval/ → human approves → Approved/ → this MCP executes.
  Never submit a payment form without a corresponding Approved/ file.

Environment variables:
  BROWSER_HEADLESS  — "true" (default) or "false" (show browser window)
  BROWSER_TIMEOUT   — Default page/element timeout in ms (default: 30000)
  VAULT_ROOT        — Absolute path to vault root for screenshot storage
                      (default: auto-detected from MCP server location)
"""

import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastmcp import FastMCP

load_dotenv()

mcp = FastMCP(
    "browser-mcp",
    instructions=(
        "Browser automation MCP for the AI Employee. Use to navigate web portals, "
        "fill forms, and capture screenshots. ALL payment or destructive form "
        "submissions require a corresponding Approved/ vault file — never submit "
        "without human approval."
    ),
)

# ── Browser session (lazy-initialised, shared across tool calls) ──────────────

_lock = threading.Lock()
_pw = None       # Playwright instance
_browser = None  # Browser instance
_page = None     # Active page


def _timeout() -> int:
    return int(os.getenv("BROWSER_TIMEOUT", "30000"))


def _headless() -> bool:
    return os.getenv("BROWSER_HEADLESS", "true").lower() != "false"


def _vault_screenshots() -> Path:
    """Return path to vault Screenshots folder, creating it if needed."""
    vault_env = os.getenv("VAULT_ROOT", "")
    if vault_env:
        base = Path(vault_env)
    else:
        # Resolve relative to project root (three levels up from this file)
        base = Path(__file__).parent.parent.parent.parent.parent
    folder = base / "vault" / "AI_Employee_Vault" / "Screenshots"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _get_page():
    """Return the active Playwright page, starting the browser if needed."""
    global _pw, _browser, _page

    with _lock:
        # Import here so the server starts even if playwright isn't installed yet
        from playwright.sync_api import sync_playwright

        if _pw is None:
            _pw = sync_playwright().start()

        if _browser is None or not _browser.is_connected():
            _browser = _pw.chromium.launch(headless=_headless())

        if _page is None or _page.is_closed():
            ctx = _browser.new_context(viewport={"width": 1280, "height": 720})
            _page = ctx.new_page()
            _page.set_default_timeout(_timeout())

    return _page


def _close_all() -> None:
    global _pw, _browser, _page
    with _lock:
        try:
            if _page and not _page.is_closed():
                _page.close()
        except Exception:
            pass
        try:
            if _browser and _browser.is_connected():
                _browser.close()
        except Exception:
            pass
        try:
            if _pw:
                _pw.stop()
        except Exception:
            pass
        _pw = _browser = _page = None


# ── Tools ─────────────────────────────────────────────────────────────────────


@mcp.tool(
    description=(
        "Navigate the browser to a URL and wait for the page to load. "
        "Returns the resolved URL and page title after navigation."
    )
)
def browser_navigate(
    url: str,
    wait_until: str = "domcontentloaded",
) -> dict:
    """
    Args:
        url:        The URL to navigate to (must include scheme, e.g. https://).
        wait_until: When to consider navigation done. One of:
                    'domcontentloaded' (default), 'load', 'networkidle'.
    Returns:
        {"success": True, "url": "...", "title": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        page.goto(url, wait_until=wait_until, timeout=_timeout())
        return {"success": True, "url": page.url, "title": page.title()}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Return the current page URL, title, and visible text content "
        "(truncated to 5000 characters). Useful for reading portal data "
        "before deciding on the next action."
    )
)
def browser_get_content() -> dict:
    """
    Returns:
        {"success": True, "url": "...", "title": "...", "text": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        text = page.inner_text("body")
        return {
            "success": True,
            "url":   page.url,
            "title": page.title(),
            "text":  text[:5000],
        }
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Click an element on the page. Identify it either by a CSS selector "
        "or by its visible text. One of `selector` or `text` is required."
    )
)
def browser_click(
    selector: str = "",
    text: str = "",
) -> dict:
    """
    Args:
        selector: CSS selector for the target element (e.g. '#submit-btn').
        text:     Visible text of the element to click (e.g. 'Submit').
                  If both are provided, `selector` takes priority.
    Returns:
        {"success": True, "clicked": "<description>"}
        {"success": False, "error": "..."}
    """
    if not selector and not text:
        return {"success": False, "error": "Provide 'selector' or 'text'."}
    try:
        page = _get_page()
        if selector:
            page.click(selector)
            clicked = selector
        else:
            page.get_by_text(text, exact=False).first.click()
            clicked = f"text={text!r}"
        return {"success": True, "clicked": clicked}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Fill a form input field identified by its CSS selector with a value. "
        "Clears any existing content before typing."
    )
)
def browser_fill_field(
    selector: str,
    value: str,
) -> dict:
    """
    Args:
        selector: CSS selector for the <input>, <textarea>, or contenteditable
                  element (e.g. 'input[name=\"amount\"]').
        value:    The text to type into the field.
    Returns:
        {"success": True, "selector": "...", "value": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        page.fill(selector, value)
        return {"success": True, "selector": selector, "value": value}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Take a screenshot of the current browser window and save it to "
        "vault/AI_Employee_Vault/Screenshots/. Returns the file path."
    )
)
def browser_screenshot(filename: str = "") -> dict:
    """
    Args:
        filename: Optional filename (without extension). Defaults to a
                  timestamp-based name like 'screenshot_20260531_143000'.
    Returns:
        {"success": True, "path": "...", "filename": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        if not filename:
            filename = "screenshot_" + datetime.now().strftime("%Y%m%d_%H%M%S")
        dest = _vault_screenshots() / f"{filename}.png"
        page.screenshot(path=str(dest), full_page=False)
        return {"success": True, "path": str(dest), "filename": dest.name}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Check whether an element matching the CSS selector exists and "
        "is visible on the current page."
    )
)
def browser_check_element(selector: str) -> dict:
    """
    Args:
        selector: CSS selector to look for.
    Returns:
        {"success": True, "exists": True/False, "visible": True/False}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        locator = page.locator(selector)
        count   = locator.count()
        visible = locator.first.is_visible() if count > 0 else False
        return {"success": True, "exists": count > 0, "visible": visible, "count": count}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Read the visible text content of an element identified by "
        "its CSS selector."
    )
)
def browser_get_text(selector: str) -> dict:
    """
    Args:
        selector: CSS selector of the target element.
    Returns:
        {"success": True, "text": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        text = page.locator(selector).first.inner_text()
        return {"success": True, "text": text}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Select an option from a <select> dropdown element. "
        "Provide either the option value or display label."
    )
)
def browser_select_option(
    selector: str,
    value: Optional[str] = None,
    label: Optional[str] = None,
) -> dict:
    """
    Args:
        selector: CSS selector for the <select> element.
        value:    The option value attribute to select.
        label:    The option visible label to select (used if value not given).
    Returns:
        {"success": True, "selector": "...", "selected": "..."}
        {"success": False, "error": "..."}
    """
    if not value and not label:
        return {"success": False, "error": "Provide 'value' or 'label'."}
    try:
        page = _get_page()
        if value:
            page.select_option(selector, value=value)
            selected = value
        else:
            page.select_option(selector, label=label)
            selected = label
        return {"success": True, "selector": selector, "selected": selected}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Close the current browser session and release all resources. "
        "Call this when the portal interaction is complete."
    )
)
def browser_close_session() -> dict:
    """
    Returns:
        {"success": True, "message": "Browser session closed."}
        {"success": False, "error": "..."}
    """
    try:
        _close_all()
        return {"success": True, "message": "Browser session closed."}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
