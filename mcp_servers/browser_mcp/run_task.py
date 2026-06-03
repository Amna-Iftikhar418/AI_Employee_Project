"""
run_task.py — standalone Playwright runner for browser_executor.py
Called via: uv --directory mcp_servers/browser_mcp run python run_task.py <url> <action> <screenshot_path> [scrape_out]

Exit codes:
  0 — success
  1 — navigation / playwright error
  2 — bad arguments
"""

import sys
from pathlib import Path


def main():
    if len(sys.argv) < 4:
        print("Usage: run_task.py <url> <action> <screenshot_path> [scrape_output_path]", file=sys.stderr)
        sys.exit(2)

    url = sys.argv[1]
    action = sys.argv[2].lower()
    screenshot_path = Path(sys.argv[3])
    scrape_out = Path(sys.argv[4]) if len(sys.argv) > 4 else None

    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        print(f"[run_task] Playwright not available: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(
                viewport={"width": 1280, "height": 720},
                locale="en-US",
                extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
            )
            page = ctx.new_page()
            page.set_default_timeout(30_000)

            print(f"[run_task] Navigating to {url} ...")
            page.goto(url, wait_until="domcontentloaded", timeout=30_000)

            screenshot_path.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshot_path))
            print(f"[run_task] Screenshot saved: {screenshot_path}")

            if action == "scrape" and scrape_out:
                text = page.inner_text("body")[:5000]
                scrape_out.parent.mkdir(parents=True, exist_ok=True)
                scrape_out.write_text(text, encoding="utf-8")
                print(f"[run_task] Scrape saved: {scrape_out}")

            browser.close()

    except Exception as e:
        print(f"[run_task] Error: {e}", file=sys.stderr)
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
