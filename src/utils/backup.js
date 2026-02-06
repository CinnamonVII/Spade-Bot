/**
 * Automated Backup System
 * Exports database to SQL and uploads to Discord channel
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { parse: parseUrl } = require('url');

const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const BACKUP_DIR = path.join(__dirname, '../../backups');

let backupInterval = null;
let discordClient = null;

/**
 * Create backup directory if it doesn't exist
 */
function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

/**
 * Generate backup filename with timestamp
 */
function getBackupFilename() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `backup-${timestamp}.sql`;
}

/**
 * Export PostgreSQL database to SQL file
 * SECURITY FIX: Using execFile() to prevent command injection
 */
async function exportDatabase() {
    return new Promise((resolve, reject) => {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
            return reject(new Error('DATABASE_URL not configured'));
        }

        ensureBackupDir();
        const filename = getBackupFilename();
        const filepath = path.join(BACKUP_DIR, filename);

        // Use pg_dump with execFile (no shell injection possible)
        const args = [databaseUrl, '--no-owner', '--no-acl'];

        execFile('pg_dump', args, {
            maxBuffer: 50 * 1024 * 1024, // 50MB max
            timeout: 60000, // 60s timeout
            shell: false // SECURITY: Explicitly disable shell
        }, (error, stdout, stderr) => {
            if (error) {
                // Fallback: Export using query
                console.log('[Backup] pg_dump not available, using JSON export...');
                exportAsJson(filepath.replace('.sql', '.json'))
                    .then(resolve)
                    .catch(reject);
                return;
            }

            // Write stdout to file
            try {
                fs.writeFileSync(filepath, stdout);
                resolve(filepath);
            } catch (writeError) {
                reject(writeError);
            }
        });
    });
}

/**
 * Fallback: Export data as JSON
 * SECURITY FIX: Whitelist validation for table names
 */
async function exportAsJson(filepath) {
    const { pool } = require('../../database');

    // SECURITY: Whitelist of allowed table names
    const ALLOWED_TABLES = new Set([
        'users', 'guilds', 'shop_items', 'user_items', 'transactions',
        'active_boosts', 'loans', 'credit_history', 'stocks', 'user_stocks',
        'recipes', 'market_listings'
    ]);

    const tables = ['users', 'guilds', 'shop_items', 'user_items', 'transactions', 'loans', 'stocks', 'user_stocks', 'recipes', 'market_listings'];
    const data = {};

    for (const table of tables) {
        // SECURITY: Validate table name against whitelist
        if (!ALLOWED_TABLES.has(table)) {
            console.warn(`[Backup] Skipping invalid table name: ${table}`);
            continue;
        }

        try {
            // SECURITY: Use parameterized identifier (pg doesn't support params for table names,
            // but we've validated against whitelist above)
            const result = await pool.query(`SELECT * FROM "${table}"`);
            data[table] = result.rows;
        } catch (e) {
            // Table might not exist
            console.warn(`[Backup] Table ${table} not found or error:`, e.message);
            data[table] = [];
        }
    }

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    return filepath;
}

/**
 * Upload backup to Discord channel
 */
async function uploadBackup(filepath) {
    const channelId = process.env.BACKUP_CHANNEL_ID;
    if (!channelId || !discordClient) {
        console.log('[Backup] No backup channel configured or client not ready');
        return false;
    }

    try {
        const channel = await discordClient.channels.fetch(channelId);
        if (!channel) {
            console.error('[Backup] Backup channel not found');
            return false;
        }

        const stats = fs.statSync(filepath);
        const sizeKB = (stats.size / 1024).toFixed(2);

        const embed = new EmbedBuilder()
            .setTitle('📦 Database Backup')
            .setColor(0x00FF00)
            .addFields(
                { name: 'Filename', value: path.basename(filepath), inline: true },
                { name: 'Size', value: `${sizeKB} KB`, inline: true },
                { name: 'Timestamp', value: new Date().toISOString(), inline: false }
            )
            .setFooter({ text: 'Automated backup' });

        const attachment = new AttachmentBuilder(filepath, { name: path.basename(filepath) });

        await channel.send({ embeds: [embed], files: [attachment] });
        console.log('[Backup] Backup uploaded successfully');

        // Clean up old backups (keep last 7)
        cleanOldBackups(7);

        return true;
    } catch (error) {
        console.error('[Backup] Upload failed:', error.message);
        return false;
    }
}

/**
 * Clean up old backup files
 */
function cleanOldBackups(keepCount) {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('backup-'))
            .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
            .sort((a, b) => b.time - a.time);

        for (let i = keepCount; i < files.length; i++) {
            fs.unlinkSync(path.join(BACKUP_DIR, files[i].name));
            console.log(`[Backup] Deleted old backup: ${files[i].name}`);
        }
    } catch (e) {
        // Ignore cleanup errors
    }
}

/**
 * Run backup manually
 */
async function runBackup() {
    console.log('[Backup] Starting backup...');
    try {
        const filepath = await exportDatabase();
        await uploadBackup(filepath);
        return { success: true, path: filepath };
    } catch (error) {
        console.error('[Backup] Backup failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Start scheduled backups
 */
function startScheduledBackups(client) {
    discordClient = client;

    if (backupInterval) {
        clearInterval(backupInterval);
    }

    // Run first backup after 1 hour (to not slow down startup)
    setTimeout(() => {
        runBackup();
        // Then every 24 hours
        backupInterval = setInterval(runBackup, BACKUP_INTERVAL_MS);
    }, 60 * 60 * 1000);

    console.log('[Backup] Scheduled backups initialized (every 24h)');
}

/**
 * Stop scheduled backups
 */
function stopScheduledBackups() {
    if (backupInterval) {
        clearInterval(backupInterval);
        backupInterval = null;
    }
}

module.exports = {
    runBackup,
    startScheduledBackups,
    stopScheduledBackups,
    exportDatabase
};
