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
  browser_back          — Go back to the previous page in history
  browser_forward       — Go forward to the next page in history
  browser_reload        — Reload the current page
  browser_press_key     — Press a key or key combo (optionally on an element)
  browser_type          — Type text with real per-key keystrokes
  browser_hover         — Hover the mouse over an element
  browser_scroll        — Scroll an element into view or scroll the window
  browser_wait_for      — Wait for a selector/text/state or a fixed delay
  browser_set_checkbox  — Check or uncheck a checkbox element
  browser_get_attribute — Read an attribute value from an element
  browser_evaluate      — Run arbitrary JavaScript in the page context
  browser_get_links     — List all anchor links on the page
  browser_upload_file   — Upload a local file into a file input
  browser_handle_dialog — Arm auto-accept/dismiss for browser dialogs
  browser_list_tabs     — List all open tabs (index, url, title)
  browser_switch_tab    — Switch the active tab by index
  browser_new_tab       — Open a new tab, optionally navigating to a URL

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

# Armed behavior for the NEXT (and subsequent) browser dialog(s).
# Updated by browser_handle_dialog; read by the persistent listener attached
# in _get_page(). Default: dismiss every dialog so automation never hangs.
_dialog_behavior = {"accept": False, "prompt_text": ""}


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
            _attach_dialog_listener(_page)

    return _page


def _dialog_handler(dialog) -> None:
    """Persistent, exception-safe dialog handler reading _dialog_behavior."""
    try:
        if _dialog_behavior.get("accept"):
            dialog.accept(_dialog_behavior.get("prompt_text") or None)
        else:
            dialog.dismiss()
    except Exception:
        # If accept/dismiss races with another handler, fail silently so the
        # automation never crashes on a stray dialog.
        pass


def _attach_dialog_listener(page) -> None:
    """Attach a single persistent dialog listener to a newly created page."""
    try:
        page.on("dialog", _dialog_handler)
    except Exception:
        pass


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


def _set_active_page(page):
    """Make `page` the module-global active page (for tab switching)."""
    global _page
    with _lock:
        _page = page
    return _page


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
    timeout_ms: int = 0,
) -> dict:
    """
    Args:
        url:        The URL to navigate to (must include scheme, e.g. https://).
        wait_until: When to consider navigation done. One of:
                    'domcontentloaded' (default), 'load', 'networkidle'.
        timeout_ms: Navigation timeout in ms. Uses the server default when <= 0.
    Returns:
        {"success": True, "url": "...", "title": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        timeout = timeout_ms if timeout_ms > 0 else _timeout()
        page.goto(url, wait_until=wait_until, timeout=timeout)
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
    nth: int = 0,
) -> dict:
    """
    Args:
        selector: CSS selector for the target element (e.g. '#submit-btn').
        text:     Visible text of the element to click (e.g. 'Submit').
                  If both are provided, `selector` takes priority.
        nth:      Zero-based index to pick when multiple elements match
                  (default 0 = first match).
    Returns:
        {"success": True, "clicked": "<description>"}
        {"success": False, "error": "..."}
    """
    if not selector and not text:
        return {"success": False, "error": "Provide 'selector' or 'text'."}
    try:
        page = _get_page()
        if selector:
            locator = page.locator(selector).nth(nth)
            clicked = f"{selector} [nth={nth}]"
        else:
            locator = page.get_by_text(text, exact=False).nth(nth)
            clicked = f"text={text!r} [nth={nth}]"
        # Best-effort scroll into view before clicking; ignore if not scrollable.
        try:
            locator.scroll_into_view_if_needed()
        except Exception:
            pass
        locator.click()
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
def browser_screenshot(filename: str = "", full_page: bool = False) -> dict:
    """
    Args:
        filename:  Optional filename (without extension). Defaults to a
                   timestamp-based name like 'screenshot_20260531_143000'.
        full_page: Capture the full scrollable page when True (default False
                   captures only the current viewport).
    Returns:
        {"success": True, "path": "...", "filename": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        if not filename:
            filename = "screenshot_" + datetime.now().strftime("%Y%m%d_%H%M%S")
        dest = _vault_screenshots() / f"{filename}.png"
        page.screenshot(path=str(dest), full_page=full_page)
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
        "Go back to the previous page in the browser history. "
        "Returns the resolved URL and title after navigating back."
    )
)
def browser_back() -> dict:
    """
    Returns:
        {"success": True, "url": "...", "title": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        page.go_back(timeout=_timeout())
        return {"success": True, "url": page.url, "title": page.title()}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Go forward to the next page in the browser history. "
        "Returns the resolved URL and title after navigating forward."
    )
)
def browser_forward() -> dict:
    """
    Returns:
        {"success": True, "url": "...", "title": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        page.go_forward(timeout=_timeout())
        return {"success": True, "url": page.url, "title": page.title()}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Reload the current page. Returns the resolved URL and title "
        "after the reload completes."
    )
)
def browser_reload() -> dict:
    """
    Returns:
        {"success": True, "url": "...", "title": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        page.reload(timeout=_timeout())
        return {"success": True, "url": page.url, "title": page.title()}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Press a keyboard key or key combination. If a selector is given, "
        "the element is focused first; otherwise the key is sent to the page. "
        "Supports combos like 'Control+A', 'Enter', 'Tab'."
    )
)
def browser_press_key(key: str, selector: str = "") -> dict:
    """
    Args:
        key:      Key or combo to press (e.g. 'Enter', 'Tab', 'Control+A').
        selector: Optional CSS selector to focus before pressing the key.
    Returns:
        {"success": True, "key": "...", "selector": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        if selector:
            page.press(selector, key)
        else:
            page.keyboard.press(key)
        return {"success": True, "key": key, "selector": selector}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Type text into a field using real per-key keystrokes (simulates a "
        "human typing, firing keydown/keypress/keyup for each character). "
        "Unlike browser_fill_field, this triggers JS keystroke handlers."
    )
)
def browser_type(selector: str, value: str, clear_first: bool = True) -> dict:
    """
    Args:
        selector:    CSS selector for the input/textarea/contenteditable.
        value:       The text to type, one keystroke at a time.
        clear_first: Clear the field before typing when True (default).
    Returns:
        {"success": True, "selector": "...", "value": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        if clear_first:
            # Clear existing content before typing the new value.
            page.fill(selector, "")
        page.type(selector, value, delay=30)
        return {"success": True, "selector": selector, "value": value}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Hover the mouse over an element identified by its CSS selector. "
        "Useful to reveal dropdown menus or tooltips."
    )
)
def browser_hover(selector: str) -> dict:
    """
    Args:
        selector: CSS selector of the element to hover over.
    Returns:
        {"success": True, "selector": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        page.hover(selector)
        return {"success": True, "selector": selector}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Scroll the page. If a selector is given, scroll that element into "
        "view; otherwise scroll the window by (x, y) pixels."
    )
)
def browser_scroll(selector: str = "", x: int = 0, y: int = 0) -> dict:
    """
    Args:
        selector: Optional CSS selector to scroll into view.
        x:        Horizontal pixels to scroll the window (used when no selector).
        y:        Vertical pixels to scroll the window (used when no selector).
    Returns:
        {"success": True, "scrolled": "<description>"}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        if selector:
            page.locator(selector).first.scroll_into_view_if_needed()
            scrolled = f"{selector} into view"
        else:
            page.mouse.wheel(x, y)
            scrolled = f"window by ({x}, {y})"
        return {"success": True, "scrolled": scrolled}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Wait for a condition before continuing. Wait for a selector to reach "
        "a state (visible/hidden/attached/detached), for text to appear, or — "
        "if neither is given — pause for a fixed number of milliseconds."
    )
)
def browser_wait_for(
    selector: str = "",
    text: str = "",
    state: str = "visible",
    timeout_ms: int = 0,
) -> dict:
    """
    Args:
        selector:   CSS selector to wait for.
        text:       Visible text to wait for (used if no selector).
        state:      Target state for the selector: 'visible' (default),
                    'hidden', 'attached', or 'detached'.
        timeout_ms: Maximum wait in ms. Uses the server default when <= 0.
    Returns:
        {"success": True, "waited_for": "<description>"}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        timeout = timeout_ms if timeout_ms > 0 else _timeout()
        if selector:
            page.wait_for_selector(selector, state=state, timeout=timeout)
            waited = f"selector {selector!r} state={state}"
        elif text:
            page.get_by_text(text, exact=False).first.wait_for(
                state=state, timeout=timeout
            )
            waited = f"text={text!r} state={state}"
        else:
            page.wait_for_timeout(timeout)
            waited = f"{timeout} ms fixed delay"
        return {"success": True, "waited_for": waited}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Check or uncheck a checkbox (or radio) element identified by its "
        "CSS selector."
    )
)
def browser_set_checkbox(selector: str, checked: bool = True) -> dict:
    """
    Args:
        selector: CSS selector for the checkbox/radio element.
        checked:  True to check the box (default), False to uncheck it.
    Returns:
        {"success": True, "selector": "...", "checked": True/False}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        if checked:
            page.check(selector)
        else:
            page.uncheck(selector)
        return {"success": True, "selector": selector, "checked": checked}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Read the value of an attribute (e.g. 'href', 'value', 'class') "
        "from the first element matching the CSS selector."
    )
)
def browser_get_attribute(selector: str, attribute: str) -> dict:
    """
    Args:
        selector:  CSS selector of the target element.
        attribute: Name of the attribute to read (e.g. 'href').
    Returns:
        {"success": True, "attribute": "...", "value": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        value = page.locator(selector).first.get_attribute(attribute)
        return {"success": True, "attribute": attribute, "value": value}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Run arbitrary JavaScript in the page context and return its result. "
        "Non-JSON-serialisable results are stringified."
    )
)
def browser_evaluate(script: str) -> dict:
    """
    Args:
        script: JavaScript expression or function body to evaluate
                (e.g. 'document.title' or '() => window.scrollY').
    Returns:
        {"success": True, "result": <value>}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        result = page.evaluate(script)
        # Guard against non-serialisable results (e.g. DOM nodes).
        try:
            import json
            json.dumps(result)
        except (TypeError, ValueError):
            result = str(result)
        return {"success": True, "result": result}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Return up to 200 links on the current page as a list of "
        "{'text': ..., 'href': ...} objects."
    )
)
def browser_get_links() -> dict:
    """
    Returns:
        {"success": True, "count": N, "links": [{"text": "...", "href": "..."}]}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        links = page.evaluate(
            "() => Array.from(document.querySelectorAll('a')).slice(0, 200)"
            ".map(a => ({text: (a.innerText || '').trim(), href: a.href}))"
        )
        return {"success": True, "count": len(links), "links": links}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Upload a local file into a file input element. Validates the file "
        "exists before attempting the upload."
    )
)
def browser_upload_file(selector: str, file_path: str) -> dict:
    """
    Args:
        selector:  CSS selector for the <input type='file'> element.
        file_path: Absolute path to a local file that must already exist.
    Returns:
        {"success": True, "selector": "...", "file_path": "..."}
        {"success": False, "error": "..."}
    """
    try:
        if not Path(file_path).is_file():
            return {
                "success": False,
                "error": f"File not found: {file_path}",
            }
        page = _get_page()
        page.set_input_files(selector, file_path)
        return {"success": True, "selector": selector, "file_path": file_path}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Arm how the NEXT (and subsequent) browser dialog(s) — alert, confirm, "
        "prompt, beforeunload — are handled. A persistent listener auto-accepts "
        "or auto-dismisses dialogs using this setting until it is changed."
    )
)
def browser_handle_dialog(accept: bool = True, prompt_text: str = "") -> dict:
    """
    Args:
        accept:      True to accept dialogs (default), False to dismiss them.
        prompt_text: Text entered into prompt dialogs when accepting.
    Returns:
        {"success": True, "behavior": "<description>"}
        {"success": False, "error": "..."}
    """
    try:
        # Ensure the page (and its persistent dialog listener) exists.
        _get_page()
        _dialog_behavior["accept"] = accept
        _dialog_behavior["prompt_text"] = prompt_text
        if accept:
            behavior = (
                f"accept dialogs (prompt_text={prompt_text!r})"
                if prompt_text
                else "accept dialogs"
            )
        else:
            behavior = "dismiss dialogs"
        return {"success": True, "behavior": f"Armed: {behavior}."}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "List all open tabs (pages) in the current browser context, "
        "each with its index, URL, and title."
    )
)
def browser_list_tabs() -> dict:
    """
    Returns:
        {"success": True, "count": N, "tabs": [{"index": i, "url": ..., "title": ...}]}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        tabs = []
        for i, p in enumerate(page.context.pages):
            try:
                title = p.title()
            except Exception:
                title = ""
            tabs.append({"index": i, "url": p.url, "title": title})
        return {"success": True, "count": len(tabs), "tabs": tabs}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Switch the active tab to the one at the given index (see "
        "browser_list_tabs). Brings it to the front and returns its URL/title."
    )
)
def browser_switch_tab(index: int) -> dict:
    """
    Args:
        index: Zero-based index of the tab to activate.
    Returns:
        {"success": True, "index": i, "url": "...", "title": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        pages = page.context.pages
        if index < 0 or index >= len(pages):
            return {
                "success": False,
                "error": f"Tab index {index} out of range (0-{len(pages) - 1}).",
            }
        target = pages[index]
        target.bring_to_front()
        _set_active_page(target)
        return {
            "success": True,
            "index": index,
            "url": target.url,
            "title": target.title(),
        }
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@mcp.tool(
    description=(
        "Open a new tab in the current browser context, make it active, and "
        "optionally navigate it to a URL. Returns the new tab's URL/title."
    )
)
def browser_new_tab(url: str = "") -> dict:
    """
    Args:
        url: Optional URL to navigate the new tab to (must include scheme).
    Returns:
        {"success": True, "url": "...", "title": "..."}
        {"success": False, "error": "..."}
    """
    try:
        page = _get_page()
        new_page = page.context.new_page()
        new_page.set_default_timeout(_timeout())
        _attach_dialog_listener(new_page)
        _set_active_page(new_page)
        if url:
            new_page.goto(url, wait_until="domcontentloaded", timeout=_timeout())
        return {"success": True, "url": new_page.url, "title": new_page.title()}
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
