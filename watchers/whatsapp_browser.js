// whatsapp_browser.js
// Stateless Node.js Playwright script.
// Called by whatsapp_watcher.py each cycle via subprocess.
// Scrapes unread WhatsApp Web chats, prints JSON array to stdout, exits.
//
// Selectors verified against live WhatsApp Business Web DOM (March 2026):
//   Chat list grid:  [aria-label="Chat list"]
//   Unread rows:     [role="row"][aria-label*="unread message"]
//   Row aria-label format: "<Sender> <HH:MM AM/PM> <text> <N> unread message(s)"

const { chromium } = require('playwright');
const path = require('path');

const SESSION_DIR = path.join(__dirname, '..', '.whatsapp_session');
const HEADLESS = true; // set false once to scan QR, then restore true

// FIX: Reduced hard-exit timeout from 30s to 15s — Python never waits more
// than 15s per cycle for a response from this stateless scraper script
const hardExit = setTimeout(() => {
    process.stderr.write('[whatsapp_browser] Hard timeout — forcing exit\n');
    process.exit(1);
}, 15000);

// Parse sender + message text from a row aria-label like:
// "Amna Rajpoot 10:42 AM Hi 1 unread message"
function parseRowLabel(label) {
    // Match: <sender> <time HH:MM AM/PM> <message text> <N> unread message(s)
    const match = label.match(/^(.+?)\s+\d{1,2}:\d{2}\s+[AP]M\s+(.*?)\s+\d+\s+unread messages?$/i);
    if (match) {
        return { sender: match[1].trim(), text: match[2].trim() };
    }
    // Fallback: return raw label so we don't silently drop messages
    return { sender: 'Unknown', text: label };
}

async function run() {
    let context;
    try {
        context = await chromium.launchPersistentContext(SESSION_DIR, {
            headless: HEADLESS,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
            ],
        });
    } catch (err) {
        process.stderr.write(`[whatsapp_browser] Failed to launch browser: ${err.message}\n`);
        console.log(JSON.stringify([]));
        clearTimeout(hardExit);
        process.exit(1);
    }

    const page = await context.newPage();

    try {
        await page.goto('https://web.whatsapp.com', {
            waitUntil: 'domcontentloaded',
            timeout: 20000,
        });

        // Wait for chat list OR QR code
        const arrived = await Promise.race([
            page.waitForSelector('[aria-label="Chat list"]', { timeout: 15000 })
                .then(() => 'chats'),
            page.waitForSelector('canvas[aria-label="Scan me!"], [data-testid="qrcode"]', { timeout: 15000 })
                .then(() => 'qr'),
        ]).catch(() => 'timeout');

        if (arrived === 'timeout') {
            process.stderr.write('[whatsapp_browser] WhatsApp Web not ready — session may be invalid\n');
            console.log(JSON.stringify([]));
            await context.close();
            clearTimeout(hardExit);
            process.exit(0);
        }

        if (arrived === 'qr') {
            process.stderr.write('[whatsapp_browser] QR code shown — scan it with your phone now...\n');
            // Wait up to 90s for user to scan and chats to load
            const scanned = await page
                .waitForSelector('[aria-label="Chat list"]', { timeout: 90000 })
                .then(() => true)
                .catch(() => false);

            if (!scanned) {
                process.stderr.write('[whatsapp_browser] QR scan timed out\n');
                console.log(JSON.stringify([]));
                await context.close();
                clearTimeout(hardExit);
                process.exit(0);
            }
            process.stderr.write('[whatsapp_browser] QR scan successful! Session saved to .whatsapp_session/\n');
            console.log(JSON.stringify([]));
            await context.close();
            clearTimeout(hardExit);
            process.exit(0);
        }

        // Small wait for chat list to fully render
        await page.waitForTimeout(1500);

        // Find all unread chat rows — verified selector from live DOM
        const unreadRows = await page
            .locator('[aria-label="Chat list"] [role="row"][aria-label*="unread message"]')
            .all();

        const messages = [];

        for (const row of unreadRows) {
            const label = await row.getAttribute('aria-label').catch(() => '');
            if (!label) continue;

            const { sender, text } = parseRowLabel(label);

            // Skip system/meta rows
            if (!text || text.length < 1) continue;

            messages.push({ sender, text });
        }

        console.log(JSON.stringify(messages));
        await context.close();
        clearTimeout(hardExit);
        process.exit(0);

    } catch (err) {
        process.stderr.write(`[whatsapp_browser] Runtime error: ${err.message}\n`);
        console.log(JSON.stringify([]));
        try { await context.close(); } catch (_) {}
        clearTimeout(hardExit);
        process.exit(1);
    }
}

run();
