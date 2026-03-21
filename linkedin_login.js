/**
 * linkedin_login.js  —  ONE-TIME SETUP
 *
 * Opens the LinkedIn executor browser profile and waits for you to log in.
 * Once logged in, the session is saved permanently.
 * You never need to run this again.
 *
 * Usage:
 *   node linkedin_login.js
 */

const { chromium } = require('playwright');
const path = require('path');
const os   = require('os');
const readline = require('readline');

const PROFILE_DIR = path.join(os.homedir(), '.linkedin-executor-profile');

async function main() {
    console.log('');
    console.log('══════════════════════════════════════════════════');
    console.log('  LinkedIn Executor — One-Time Login Setup');
    console.log('══════════════════════════════════════════════════');
    console.log('');
    console.log('Profile: ' + PROFILE_DIR);
    console.log('');
    console.log('A browser window will open.');
    console.log('→ Log in to LinkedIn normally in that window.');
    console.log('→ Come back here and press ENTER when done.');
    console.log('');

    const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        args: ['--no-sandbox']
    });

    const page = browser.pages()[0] || await browser.newPage();
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });

    // Wait for user to confirm login
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolve => rl.question('Press ENTER after you have logged in... ', resolve));
    rl.close();

    // Verify login worked
    try {
        await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(4000);  // give LinkedIn time to fully render

        // Check multiple indicators — LinkedIn varies by region/language
        const indicators = [
            '[aria-label="Start a post"]',
            'button:has-text("Start a post")',
            '.share-box-feed-entry__trigger',
            '[data-control-name="share.post"]',
            '.feed-identity-module'   // profile card shown only when logged in
        ];

        let loggedIn = false;
        for (const sel of indicators) {
            if (await page.locator(sel).count() > 0) { loggedIn = true; break; }
        }

        // Also check URL — if still on login page, not logged in
        const currentUrl = page.url();
        if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
            loggedIn = false;
        }

        if (loggedIn) {
            console.log('');
            console.log('✅ Login successful! Session saved to profile.');
            console.log('   The approved_watcher will now post automatically.');
            console.log('');
        } else {
            console.log('');
            console.log('⚠  Could not verify login — current URL: ' + currentUrl);
            console.log('   BUT your session cookies may still be saved.');
            console.log('   Try running: uv run watchers/approved_watcher.py');
            console.log('   If it still fails, run this login script again.');
            console.log('');
        }
    } catch (e) {
        console.log('⚠  Verification check failed: ' + e.message);
        console.log('   Your session may still be saved — try the watcher.');
    }

    await browser.close();
}

main().catch(err => {
    console.error('Error: ' + err.message);
    process.exit(1);
});
