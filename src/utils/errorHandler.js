/**
 * Global Error Handler with Discord Webhook Alerts
 * Catches unhandled errors and sends them to a configured webhook
 */

const https = require('https');
const url = require('url');

// Rate limiting to prevent webhook spam
const errorCache = new Map();
const RATE_LIMIT_MS = 60000; // 1 minute between same errors
const MAX_ERRORS_PER_MINUTE = 5;
let errorCount = 0;
let lastReset = Date.now();

/**
 * Send error to Discord webhook
 */
async function sendToWebhook(error, context = 'Unknown') {
    const webhookUrl = process.env.ERROR_WEBHOOK_URL;
    if (!webhookUrl) return;

    // Rate limiting
    const now = Date.now();
    if (now - lastReset > 60000) {
        errorCount = 0;
        lastReset = now;
    }
    if (errorCount >= MAX_ERRORS_PER_MINUTE) return;

    // Deduplicate same errors
    const errorKey = `${error.message}:${context}`;
    if (errorCache.has(errorKey) && now - errorCache.get(errorKey) < RATE_LIMIT_MS) {
        return;
    }
    errorCache.set(errorKey, now);
    errorCount++;

    const payload = {
        embeds: [{
            title: '🚨 Bot Error',
            color: 0xFF0000,
            fields: [
                { name: 'Context', value: context.slice(0, 256), inline: true },
                { name: 'Error', value: `\`\`\`${(error.message || error).slice(0, 1000)}\`\`\``, inline: false },
                { name: 'Stack', value: `\`\`\`${(error.stack || 'No stack').slice(0, 1000)}\`\`\``, inline: false }
            ],
            timestamp: new Date().toISOString(),
            footer: { text: process.env.NODE_ENV || 'production' }
        }]
    };

    try {
        const parsedUrl = new url.URL(webhookUrl);
        const postData = JSON.stringify(payload);

        const options = {
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options);
        req.on('error', () => { }); // Silently fail
        req.write(postData);
        req.end();
    } catch (e) {
        console.error('[ErrorHandler] Failed to send webhook:', e.message);
    }
}

/**
 * Initialize global error handlers
 */
function initErrorHandlers(client) {
    // Unhandled Promise Rejections
    process.on('unhandledRejection', (reason, promise) => {
        console.error('[UNHANDLED REJECTION]', reason);
        sendToWebhook(reason, 'Unhandled Promise Rejection');
    });

    // Uncaught Exceptions
    process.on('uncaughtException', (error) => {
        console.error('[UNCAUGHT EXCEPTION]', error);
        sendToWebhook(error, 'Uncaught Exception');
        // Give time to send webhook before exit
        setTimeout(() => process.exit(1), 1000);
    });

    // Discord.js Errors
    if (client) {
        client.on('error', (error) => {
            console.error('[DISCORD ERROR]', error);
            sendToWebhook(error, 'Discord.js Client Error');
        });

        client.on('shardError', (error, shardId) => {
            console.error(`[SHARD ${shardId} ERROR]`, error);
            sendToWebhook(error, `Shard ${shardId} Error`);
        });
    }

    console.log('[ErrorHandler] Global error handlers initialized');
}

/**
 * Wrap async command handlers
 */
function wrapCommand(commandName, handler) {
    return async (...args) => {
        try {
            return await handler(...args);
        } catch (error) {
            console.error(`[COMMAND ERROR] ${commandName}:`, error);
            sendToWebhook(error, `Command: ${commandName}`);
            throw error;
        }
    };
}

module.exports = {
    initErrorHandlers,
    sendToWebhook,
    wrapCommand
};
