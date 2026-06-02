/**
 * linkedin_post.js  v3
 * Robust LinkedIn post publisher using Playwright persistent context.
 *
 * Fixes applied vs v2:
 *   1. Delete SingletonLock before launch  → prevents Chrome exit-code 21 crash
 *   2. URL-based login detection           → works even when DOM classes change
 *   3. waitForLoadState('networkidle')     → page fully rendered before searches
 *   4. Semantic selectors (role/aria)      → survive LinkedIn DOM obfuscation
 *   5. page.getByText / getByRole()        → Playwright built-ins as final fallback
 *   6. body.click() before keyboard 'c'   → ensures focus before shortcut
 *   7. Screenshot saved on every failure  → easy debugging
 *
 * Usage:
 *   node linkedin_post.js --content-file <path>
 *
 * Prints one JSON line to stdout:
 *   {"success": true/false, "postUrl": "...", "error": "..."}
 */

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const PROFILE_DIR = path.join(os.homedir(), '.linkedin-profile');
const DEBUG_DIR   = path.join(__dirname, 'linkedin_debug');

function log(msg) { console.error(msg); }

// ── Kill existing Chromium processes using our profile ────────────────────────
function killExistingBrowserSessions() {
    const { execSync } = require('child_process');
    try {
        if (process.platform === 'win32') {
            // Find chrome.exe processes whose command line references our profile dir
            const out = execSync(
                'wmic process where "name=\'chrome.exe\'" get ProcessId,CommandLine /format:csv',
                { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
            );
            for (const line of out.split('\n')) {
                if (line.toLowerCase().includes('linkedin-profile')) {
                    const parts = line.split(',');
                    const pid = parts[parts.length - 1]?.trim();
                    if (pid && /^\d+$/.test(pid)) {
                        try {
                            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                            log(`[CLEANUP] Killed stale Chromium PID: ${pid}`);
                        } catch (_) {}
                    }
                }
            }
        }
    } catch (e) {
        log(`[CLEANUP] Session kill check failed (non-fatal): ${e.message}`);
    }
}

// ── Profile lock cleanup (prevents Chrome exit code 21 on Windows) ────────────
function cleanProfileLocks() {
    const locks = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
    for (const lf of locks) {
        try {
            fs.unlinkSync(path.join(PROFILE_DIR, lf));
            log(`[CLEANUP] Removed stale lock: ${lf}`);
        } catch (_) {}
    }
}

// ── Debug screenshot helper ───────────────────────────────────────────────────
async function saveDebug(page, label) {
    try {
        fs.mkdirSync(DEBUG_DIR, { recursive: true });
        const ts = Date.now();
        await page.screenshot({ path: path.join(DEBUG_DIR, `${label}_${ts}.png`) });
        fs.writeFileSync(
            path.join(DEBUG_DIR, `${label}_${ts}.html`),
            await page.content(),
            'utf8'
        );
        log(`[DEBUG] Saved screenshot: linkedin_debug/${label}_${ts}.png`);
    } catch (_) {}
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args  = process.argv.slice(2);
const cfIdx = args.indexOf('--content-file');

if (cfIdx === -1 || !args[cfIdx + 1]) {
    console.log(JSON.stringify({ success: false, error: 'Missing --content-file argument' }));
    process.exit(1);
}

let content;
try {
    content = fs.readFileSync(args[cfIdx + 1], 'utf8').trim();
} catch (e) {
    console.log(JSON.stringify({ success: false, error: `Cannot read content file: ${e.message}` }));
    process.exit(1);
}

// ── Selectors ─────────────────────────────────────────────────────────────────

// Editor: semantic first (aria/role), class-based fallback
const EDITOR_SELECTOR = [
    'div[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"][aria-multiline="true"]',
    'div[aria-label="Text editor for creating content"]',
    'div[aria-label*="editor"][contenteditable="true"]',
    'div[contenteditable="true"][spellcheck="true"]',
    '.ql-editor[contenteditable="true"]',
    'div.share-creation-state__text-editor[contenteditable="true"]',
    '.editor-content[contenteditable="true"]',
    'div[role="dialog"] [contenteditable="true"]',
].join(', ');

// Start-a-post: aria/text first, class-based fallback
const START_POST_SELECTORS = [
    '[aria-label="Start a post"]',
    '[aria-label*="Start a post"]',
    'button:has-text("Start a post")',
    '[data-control-name="share.sharebox_open"]',
    '.share-box-feed-entry__trigger',
    '.share-creation-state__placeholder',
    'button.artdeco-button:has-text("Post")',
    '.share-box__open',
];

// Post submit button
const POST_BTN_SELECTORS = [
    'button.share-actions__primary-action',
    'button[aria-label="Post"]:not([disabled])',
    'button[aria-label="Post now"]:not([disabled])',
    'div[role="dialog"] button.artdeco-button--primary:not([disabled])',
    'div[role="dialog"] button:has-text("Post"):not([disabled])',
    '.share-creation-footer__action--primary',
    'button.artdeco-button--primary:has-text("Post")',
    '.share-actions__primary-action',
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function postToLinkedIn(content) {

    // 1. Kill stale sessions, then clean lock files
    killExistingBrowserSessions();
    cleanProfileLocks();

    log('Launching browser with persistent profile...');

    const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--disable-notifications',
            '--no-first-run',
            '--no-default-browser-check',
        ],
        viewport: { width: 1280, height: 800 },
        timeout: 30000,
        permissions: ['clipboard-read', 'clipboard-write'],
    });

    const page = browser.pages()[0] || await browser.newPage();

    // Mask automation fingerprints
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver',  { get: () => undefined });
        Object.defineProperty(navigator, 'plugins',    { get: () => [1, 2, 3, 4] });
        Object.defineProperty(navigator, 'languages',  { get: () => ['en-US', 'en'] });
    });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    try {
        // ── Step 1: Navigate ──────────────────────────────────────────────────
        log('Navigating to LinkedIn feed (shareActive=true)...');
        await page.goto('https://www.linkedin.com/feed/?shareActive=true', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });

        // Wait for LinkedIn SPA to finish rendering
        try {
            await page.waitForLoadState('networkidle', { timeout: 8000 });
        } catch (_) {
            // LinkedIn keeps background requests open — networkidle may not settle
        }
        await page.waitForTimeout(2000);

        // ── Step 2: Login check (URL-based — survives DOM obfuscation) ────────
        const currentUrl = page.url();
        const onLoginPage = /\/(login|checkpoint|authwall|uas\/login)/i.test(currentUrl);

        if (onLoginPage) {
            log('NOT_LOGGED_IN: LinkedIn session expired. Waiting up to 5 minutes for manual login...');
            await saveDebug(page, 'not_logged_in');
            try {
                await page.waitForURL(
                    u => !/\/(login|checkpoint|authwall|uas\/login)/i.test(u),
                    { timeout: 300000 }
                );
                log('Login detected — re-navigating...');
            } catch {
                return { success: false, error: 'NOT_LOGGED_IN: Timed out waiting for manual login.' };
            }
            await page.goto('https://www.linkedin.com/feed/?shareActive=true', {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            });
            try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch (_) {}
            await page.waitForTimeout(2000);
        }

        // ── Step 3: Find / open the post editor ───────────────────────────────
        log('Waiting for post editor...');

        let editorFound = await page.locator(EDITOR_SELECTOR).first()
            .waitFor({ state: 'visible', timeout: 6000 })
            .then(() => true).catch(() => false);

        if (!editorFound) {
            log('Editor not auto-opened — trying to click "Start a post" button...');
            let clicked = false;

            // Try each selector-based button
            for (const sel of START_POST_SELECTORS) {
                try {
                    const btn = page.locator(sel).first();
                    if (await btn.isVisible().catch(() => false)) {
                        log(`Clicking button: ${sel}`);
                        await btn.click();
                        clicked = true;
                        break;
                    }
                } catch (_) {}
            }

            // Playwright's getByText — works even with obfuscated class names
            if (!clicked) {
                try {
                    const textBtn = page.getByText('Start a post', { exact: false });
                    if (await textBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
                        log('Clicking via getByText("Start a post")...');
                        await textBtn.first().click();
                        clicked = true;
                    }
                } catch (_) {}
            }

            // Keyboard shortcut 'C' — LinkedIn's built-in composer shortcut
            // Click body first to guarantee keyboard focus
            if (!clicked) {
                log('No button found — focusing body and pressing keyboard shortcut C...');
                await page.click('body');
                await page.waitForTimeout(300);
                await page.keyboard.press('c');
            }

            // Wait for editor to appear after click/shortcut
            editorFound = await page.locator(EDITOR_SELECTOR).first()
                .waitFor({ state: 'visible', timeout: 15000 })
                .then(() => true).catch(() => false);
        }

        // Ultimate fallback: Playwright's semantic getByRole
        if (!editorFound) {
            log('Trying getByRole("textbox") as final fallback...');
            editorFound = await page.getByRole('textbox').first()
                .waitFor({ state: 'visible', timeout: 5000 })
                .then(() => true).catch(() => false);
        }

        if (!editorFound) {
            await saveDebug(page, 'editor_not_found');
            throw new Error('Post editor not found after all attempts — see linkedin_debug/ for screenshot.');
        }

        // Resolve the editor locator
        let editor;
        const editorLocator = page.locator(EDITOR_SELECTOR);
        const editorCount   = await editorLocator.count().catch(() => 0);
        if (editorCount > 0) {
            editor = editorLocator.first();
        } else {
            editor = page.getByRole('textbox').first();
        }

        await editor.waitFor({ state: 'visible', timeout: 5000 });
        log('Editor is ready.');

        // ── Step 4: Enter content ─────────────────────────────────────────────
        const normalized = content
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        log(`Entering content (${normalized.split(' ').length} words)...`);
        await editor.click();
        await page.waitForTimeout(500);

        // Method 1: Clipboard paste (fires all React events, handles emojis)
        let contentEntered = false;
        try {
            await page.evaluate(async (text) => {
                const item = new ClipboardItem({
                    'text/plain': new Blob([text], { type: 'text/plain' }),
                });
                await navigator.clipboard.write([item]);
            }, normalized);
            await editor.click();
            await page.keyboard.press('Control+a');
            await page.waitForTimeout(200);
            await page.keyboard.press('Control+v');
            await page.waitForTimeout(1000);
            const afterPaste = (await editor.innerText().catch(() => '')).trim();
            if (afterPaste.length > 10) {
                log('Content entered via clipboard paste.');
                contentEntered = true;
            }
        } catch (e) {
            log(`Clipboard method failed: ${e.message}`);
        }

        // Method 2: execCommand insertText
        if (!contentEntered) {
            log('Trying execCommand insertText...');
            await editor.evaluate((el, text) => {
                el.focus();
                const sel   = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(el);
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand('insertText', false, text);
            }, normalized);
            await page.waitForTimeout(1000);
            const afterExec = (await editor.innerText().catch(() => '')).trim();
            if (afterExec.length > 10) {
                log('Content entered via execCommand.');
                contentEntered = true;
            }
        }

        // Method 3: keyboard.type — slow but works everywhere
        if (!contentEntered) {
            log('Falling back to keyboard.type (slow)...');
            await editor.click();
            await page.keyboard.press('Control+a');
            await page.waitForTimeout(300);
            await page.keyboard.type(normalized, { delay: 10 });
            await page.waitForTimeout(500);
            const afterType = (await editor.innerText().catch(() => '')).trim();
            if (!afterType) {
                throw new Error('All text entry methods failed — editor rejected all input.');
            }
            log('Content entered via keyboard.type.');
            contentEntered = true;
        }

        log('Content entered successfully.');
        await page.waitForTimeout(1500);

        // ── Step 5: Click the Post button ─────────────────────────────────────
        let postBtn = null;

        for (const sel of POST_BTN_SELECTORS) {
            try {
                const btn = page.locator(sel).last();
                if (await btn.isVisible().catch(() => false)) {
                    postBtn = btn;
                    log(`Post button found: ${sel}`);
                    break;
                }
            } catch (_) {}
        }

        // Playwright's semantic fallback
        if (!postBtn) {
            try {
                const roleBtn = page.getByRole('button', { name: /^Post$/i });
                if (await roleBtn.last().isVisible({ timeout: 3000 }).catch(() => false)) {
                    postBtn = roleBtn.last();
                    log('Post button found via getByRole("button", {name: "Post"})');
                }
            } catch (_) {}
        }

        if (!postBtn) {
            await saveDebug(page, 'post_button_not_found');
            throw new Error('Post button not found — tried all known selectors.');
        }

        log('Clicking Post button...');
        await postBtn.click();

        // ── Step 6: Verify success ────────────────────────────────────────────
        const TOAST_SELECTOR = [
            '[data-test-snackbar]',
            '.artdeco-toast-item--visible',
            '.artdeco-toast-item',
            '[role="alert"]',
        ].join(', ');

        const toastAppeared = await page
            .waitForSelector(TOAST_SELECTOR, { state: 'visible', timeout: 10000 })
            .then(() => true).catch(() => false);

        const postUrl = page.url();

        if (toastAppeared) {
            const toastText = await page.locator(TOAST_SELECTOR).first().innerText().catch(() => '');
            log(`Toast: "${toastText}"`);
            const isError = /error|fail|couldn't|went wrong/i.test(toastText);
            if (!isError) {
                log(`SUCCESS (toast confirmed) — URL: ${postUrl}`);
                return { success: true, postUrl };
            }
            return { success: false, error: `LinkedIn error toast: "${toastText}"` };
        }

        // Check for success text elsewhere on page
        const successText = await page.locator(
            ':text("Post successful"), :text("Your post is now live"), :text("Your post was shared")'
        ).count().catch(() => 0);
        if (successText > 0) {
            log(`SUCCESS (success text) — URL: ${postUrl}`);
            return { success: true, postUrl };
        }

        // Heuristic: composer closed with no error
        await page.waitForTimeout(2000);
        const composerOpen  = await page.locator('div[role="dialog"]:has([contenteditable])').count().catch(() => 0);
        const errorVisible  = await page.locator(
            ':text("error"), :text("couldn\'t post"), :text("something went wrong"), :text("failed to post")'
        ).count().catch(() => 0);

        if (composerOpen === 0 && errorVisible === 0) {
            log(`SUCCESS (composer closed, no errors) — URL: ${postUrl}`);
            return { success: true, postUrl };
        }

        await saveDebug(page, 'post_failed');
        return { success: false, error: 'Post button clicked but no success confirmation received.' };

    } catch (err) {
        log(`Fatal error: ${err.message}`);
        try { await saveDebug(page, 'fatal_error'); } catch (_) {}
        return { success: false, error: err.message };
    } finally {
        try { await browser.close(); } catch (_) {}
    }
}

// ── Run ───────────────────────────────────────────────────────────────────────

postToLinkedIn(content)
    .then(result => {
        console.log(JSON.stringify(result));
        process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
        console.log(JSON.stringify({ success: false, error: err.message }));
        process.exit(1);
    });
