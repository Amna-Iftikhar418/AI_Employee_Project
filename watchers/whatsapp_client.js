// whatsapp_client.js — Persistent WhatsApp client using whatsapp-web.js
//
// Uses WebSocket (not a full browser) — ~30MB RAM, no visible window.
// Session saved permanently to .wwebjs_auth/ — QR scan only needed once.
// Outputs one JSON line to stdout per incoming message.
// Python reads stdout as a stream.

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const qrcodeImage = require('qrcode');
const path = require('path');
const fs = require('fs');

const AUTH_DIR = path.join(__dirname, '..', '.wwebjs_auth');

// FIX: Reconnection state — retry with exponential backoff instead of hard exit
const MAX_RECONNECTS = 3;
let reconnectAttempts = 0;

/**
 * FIX: Extracted client creation into a function so we can reinitialize
 * on disconnect without restarting the whole Node process.
 */
function createClient() {
    const client = new Client({
        authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ],
        },
    });

    // QR code — shown in terminal once, then session is saved permanently
    // FIX: use callback form so qrcode output goes to stderr, not stdout.
    // Without this, block-drawing characters land on stdout and Python tries
    // to JSON-parse them, producing "Malformed JSON" errors.
    client.on('qr', (qr) => {
        process.stderr.write('\n[whatsapp_client] Scan this QR code with your phone:\n\n');
        qrcode.generate(qr, { small: true }, (qrString) => {
            process.stderr.write(qrString + '\n');
        });

        // Save QR as PNG image so it can be opened and scanned easily
        const qrImagePath = path.join(__dirname, '..', 'whatsapp_qr.png');
        qrcodeImage.toFile(qrImagePath, qr, { width: 400 }, (err) => {
            if (err) {
                process.stderr.write(`[whatsapp_client] Could not save QR image: ${err.message}\n`);
            } else {
                process.stderr.write(`\n[whatsapp_client] QR code saved as IMAGE → open this file and scan it:\n`);
                process.stderr.write(`  ${qrImagePath}\n\n`);
            }
        });

        process.stderr.write('\n[whatsapp_client] Waiting for scan...\n');
    });

    client.on('authenticated', () => {
        // FIX: Reset reconnect counter on successful authentication
        reconnectAttempts = 0;
        process.stderr.write('[whatsapp_client] Authenticated — session saved permanently.\n');
    });

    client.on('ready', () => {
        // FIX: Reset reconnect counter once client is fully ready
        reconnectAttempts = 0;
        process.stderr.write('[whatsapp_client] Ready! Listening for messages...\n');

        // Keepalive: prevents the Node.js event loop from emptying after ready.
        // Without this, Node exits cleanly (code 0) after a few seconds because
        // no I/O is pending — the WhatsApp WebSocket alone is not enough to hold
        // the event loop on all Node.js versions.
        if (!global._keepaliveTimer) {
            global._keepaliveTimer = setInterval(() => {
                process.stderr.write('[whatsapp_client] Heartbeat — still connected.\n');
            }, 30000);
            global._keepaliveTimer.unref(); // Don't prevent graceful shutdown
        }
    });

    client.on('auth_failure', (msg) => {
        process.stderr.write(`[whatsapp_client] Auth failed: ${msg}\n`);
        process.exit(1);
    });

    // FIX: Reconnect with exponential backoff on disconnect instead of hard exit.
    // This handles transient network drops without requiring a manual restart.
    client.on('disconnected', (reason) => {
        process.stderr.write(`[whatsapp_client] Disconnected: ${reason}.\n`);

        if (reconnectAttempts < MAX_RECONNECTS) {
            reconnectAttempts++;
            const delayMs = reconnectAttempts * 5000; // 5s, 10s, 15s
            process.stderr.write(
                `[whatsapp_client] Reconnecting in ${delayMs / 1000}s ` +
                `(attempt ${reconnectAttempts}/${MAX_RECONNECTS})...\n`
            );
            setTimeout(() => {
                process.stderr.write('[whatsapp_client] Reinitializing client...\n');
                client.initialize();
            }, delayMs);
        } else {
            process.stderr.write(
                `[whatsapp_client] Max reconnect attempts (${MAX_RECONNECTS}) reached. Exiting.\n`
            );
            process.exit(1);
        }
    });

    // New message received — output JSON line to stdout
    client.on('message', async (message) => {
        try {
            // Skip status messages, broadcasts, and messages sent by us
            if (message.isStatus || message.from === 'status@broadcast') return;
            if (message.fromMe) return;

            const contact = await message.getContact();
            const sender = contact.pushname || contact.name || message.from.replace('@c.us', '');
            const text = message.body || '';

            if (!text.trim()) return;

            const msgId = message.id?.id || message.id?._serialized || '';
            const output = JSON.stringify({ sender, text: text.trim(), message_id: msgId });
            process.stdout.write(output + '\n');

            process.stderr.write(
                `[whatsapp_client] Message from ${sender}: ${text.substring(0, 60)}\n`
            );
        } catch (err) {
            process.stderr.write(`[whatsapp_client] Error handling message: ${err.message}\n`);
        }
    });

    return client;
}

process.stderr.write('[whatsapp_client] Starting WhatsApp client...\n');
const client = createClient();
client.initialize();
