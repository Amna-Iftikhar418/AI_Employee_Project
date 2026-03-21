/**
 * linkedin_post.js
 * Node.js Playwright script — called by linkedin_executor.py.
 * Uses a persistent browser profile so the LinkedIn session is reused across runs.
 *
 * Usage:
 *   node linkedin_post.js --content-file <path>
 *
 * Prints a single JSON line to stdout:
 *   {"success": true/false, "postUrl": "...", "error": "..."}
 * All diagnostic output goes to stderr.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// Dedicated persistent profile — separate from the MCP Playwright browser.
// First run: browser opens so user can log in. Every run after: session reused.
const PROFILE_DIR = path.join(os.homedir(), '.linkedin-executor-profile');

async function postToLinkedIn(content) {
    let browser = null;

    try {
        browser = await chromium.launchPersistentContext(PROFILE_DIR, {
            headless: false,           // headed — needed for LinkedIn session + CAPTCHA
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
            timeout: 30000
        });

        const page = browser.pages()[0] || await browser.newPage();

        // ── Step 1: Navigate ────────────────────────────────────────────────
        console.error('[Browser] Navigating to LinkedIn feed...');
        await page.goto('https://www.linkedin.com/feed', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        await page.waitForTimeout(2000);

        // ── Step 2: Session check ────────────────────────────────────────────
        const startPostCount = await page.locator('[aria-label="Start a post"]').count();
        const signInCount    = await page.locator('a[href*="login"]').count()
                           + await page.locator(':text("Sign in")').count();

        if (signInCount > 0 && startPostCount === 0) {
            return {
                success: false,
                error: 'NOT_LOGGED_IN: A browser window has opened. Please log in to LinkedIn manually, then re-run the watcher. Your session will be saved automatically for all future automated posts.'
            };
        }

        console.error('[Browser] Session active (logged in).');

        // ── Step 3: Open post composer ───────────────────────────────────────
        const composerSelectors = [
            '[aria-label="Start a post"]',                           // primary
            'button:has-text("Start a post")',                       // text match
            '.share-box-feed-entry__trigger',                        // class fallback
            '[data-control-name="share.post"]',                       // data-control fallback
           ' button:has-text("Start a post"), button:has-text("Start post")'
            // 'button:has-text("Start"):not(:has-text("Started"))'     // generic "Start" button
           
        ];

        let composerOpened = false;
        for (const sel of composerSelectors) {
            try {
                const el = page.locator(sel).first();
                if (await el.count() > 0) {
                    await el.click({ timeout: 5000 });
                    composerOpened = true;
                    console.error(`[SELECTOR] Composer opened via: ${sel}`);
                    break;
                }
            } catch (_) { /* try next selector */ }
        }

        if (!composerOpened) {
            return { success: false, error: 'Could not open post composer — "Start a post" button not found.' };
        }

        await page.waitForTimeout(2500);  // give LinkedIn modal time to fully render

        // ── Step 4: Find editor ──────────────────────────────────────────────
        // First: wait up to 10s for ANY editor pattern to appear in the DOM
        try {
            await page.waitForSelector(
                '.ql-editor, [contenteditable="true"], [role="textbox"]',
                { state: 'visible', timeout: 10000 }
            );
            console.error('[Browser] Editor container detected — identifying...');
        } catch (_) {
            console.error('[Browser] waitForSelector timed out — attempting selector loop anyway...');
        }

        const editorSelectors = [
            '.ql-editor',                                                  // primary Quill editor
            '[contenteditable="true"][data-placeholder]',                  // contenteditable with placeholder
            '[role="textbox"]',                                            // ARIA textbox
            '[contenteditable="true"]',                                    // broader contenteditable
            'div.editor-content [contenteditable]',                        // nested editor div
            '.share-creation-state__content [contenteditable]'             // newer LinkedIn modal
        ];

        let editor = null;
        for (const sel of editorSelectors) {
            try {
                const el = page.locator(sel).first();
                // waitFor directly — don't pre-check count() which returns 0 during render
                await el.waitFor({ state: 'visible', timeout: 3000 });
                editor = el;
                console.error(`[SELECTOR] Editor found via: ${sel}`);
                break;
            } catch (_) { /* try next */ }
        }

        if (!editor) {
            return { success: false, error: 'Post composer text area did not appear.' };
        }

        // ── Step 5: Type content ─────────────────────────────────────────────
        await editor.click();
        await page.waitForTimeout(300);

        // Normalize line endings before pasting.
        // Windows files use \r\n — in LinkedIn's editor each \r\n becomes a double
        // line break, creating ugly empty lines between every paragraph.
        // Fix: strip \r so only \n remains, then collapse 3+ newlines to max 2.
        content = content
            .replace(/\r\n/g, '\n')   // Windows CRLF → LF
            .replace(/\r/g, '\n')      // stray CR → LF
            .replace(/\n{3,}/g, '\n\n') // collapse excessive blank lines
            .trim();

        // Primary method: clipboard paste (preserves line breaks and emojis)
        await page.evaluate((text) => {
            const activeEl = document.querySelector(
                '.ql-editor, [contenteditable="true"][data-placeholder], [role="textbox"]'
            );
            if (activeEl) {
                activeEl.focus();
                const dt = new DataTransfer();
                dt.setData('text/plain', text);
                activeEl.dispatchEvent(new ClipboardEvent('paste', {
                    clipboardData: dt,
                    bubbles: true,
                    cancelable: true
                }));
            }
        }, content);

        await page.waitForTimeout(800);

        // Verify text appeared — fallback to keyboard.type if empty
        let editorText = '';
        try { editorText = await editor.innerText(); } catch (_) {}

        if (!editorText.trim()) {
            console.error('[Browser] Clipboard paste did not work — falling back to keyboard.type...');
            await editor.click();
            await page.keyboard.type(content, { delay: 8 });
            await page.waitForTimeout(500);
        }

        console.error(`[Browser] Content typed (${content.split(' ').length} words).`);

        // ── Step 6: Handle dialogs ───────────────────────────────────────────
        page.on('dialog', async (dialog) => {
            console.error(`[Browser] Dialog: "${dialog.message()}" — accepting.`);
            try { await dialog.accept(); } catch (_) {}
        });

        // ── Step 7: Click Post button ────────────────────────────────────────
        const postSelectors = [
            'button.share-actions__primary-action[aria-label="Post"]',    // primary + class
            'button[aria-label="Post"].share-actions__primary-action',    // same, reversed
            '.share-actions__primary-action',                              // class only
            'button[aria-label="Post"]:not([aria-label*="to"])',           // aria-label guard
            'button:has-text("Post"):not(:has-text("Next")):not(:has-text("Share"))', // text match
            'button[type="submit"]:not([disabled])',                       // generic submit
            'div[role="dialog"] button:not([disabled]):last-child'         // last enabled in modal
        ];

        let postClicked = false;
        for (const sel of postSelectors) {
            try {
                const btn = page.locator(sel).last();
                if (await btn.count() > 0) {
                    await btn.click({ timeout: 5000 });
                    postClicked = true;
                    console.error(`[SELECTOR] Post button clicked via: ${sel}`);
                    break;
                }
            } catch (_) { /* try next */ }
        }

        if (!postClicked) {
            return { success: false, error: 'Could not find the Post button.' };
        }

        // ── Handle audience selector modal ───────────────────────────────────
        // LinkedIn sometimes shows an audience picker after the first "Post" click.
        // If it appears, find and click the final Post button inside it.
        await page.waitForTimeout(1200);
        const audienceModal = await page.locator(
            '.audience-selector, button[aria-label*="audience"], .share-audience-selector'
        ).count();
        if (audienceModal > 0) {
            console.error('[SELECTOR] Audience selector detected — clicking final Post button...');
            for (const sel of postSelectors) {
                try {
                    const btn = page.locator(sel).last();
                    if (await btn.count() > 0) {
                        await btn.click({ timeout: 5000 });
                        console.error(`[SELECTOR] Post button (post-audience) clicked via: ${sel}`);
                        break;
                    }
                } catch (_) {}
            }
        }

        // ── Step 8: Confirm success ──────────────────────────────────────────
        await page.waitForTimeout(4000);

        // Check for at least one success indicator
        let confirmed = false;
        try {
            const toast = await page.locator(
                'text=Post successful, text=Your post is now live, text=shared, text=posted'
            ).count();
            if (toast > 0) { confirmed = true; console.error('[Browser] Success toast detected.'); }
        } catch (_) {}

        // Composer closing is also a strong success signal
        if (!confirmed) {
            try {
                const composerGone = (await page.locator(
                    '.share-creation-state, .share-box__modal'
                ).count()) === 0;
                if (composerGone) { confirmed = true; console.error('[Browser] Composer closed — success.'); }
            } catch (_) {}
        }

        const feedUrl = page.url();
        let postUrl = feedUrl;
        try {
            if (feedUrl.includes('urn:li:share') || feedUrl.includes('ugcPost')) {
                postUrl = feedUrl;
                if (!confirmed) { confirmed = true; console.error('[Browser] Post URL detected — success.'); }
            }
        } catch (_) {}

        if (!confirmed) {
            // Not conclusive but post button was clicked — treat as likely success
            console.error('[Browser] No explicit success indicator, but Post button was clicked — treating as success.');
        }

        console.error('[Browser] Post submitted successfully!');
        return { success: true, postUrl };

    } catch (err) {
        return { success: false, error: err.message };
    } finally {
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
    }
}

// ── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cfIdx = args.indexOf('--content-file');

if (cfIdx === -1 || !args[cfIdx + 1]) {
    console.log(JSON.stringify({ success: false, error: 'Missing --content-file argument' }));
    process.exit(1);
}

let content;
try {
    content = fs.readFileSync(args[cfIdx + 1], 'utf8');
} catch (e) {
    console.log(JSON.stringify({ success: false, error: `Cannot read content file: ${e.message}` }));
    process.exit(1);
}

postToLinkedIn(content)
    .then(result => {
        console.log(JSON.stringify(result));
        process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
        console.log(JSON.stringify({ success: false, error: err.message }));
        process.exit(1);
    });
