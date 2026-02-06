const EventEmitter = require('events');
const mineflayer = require('mineflayer');
const AternosClient = require('./src/aternos/client');

class BotManager extends EventEmitter {
    constructor() {
        super();
        this.bot = null;
        this.isBotOnline = false;
        this.reconnectTimeout = null;
    }

    /**
     * Check if the bot is currently connected to the server
     */
    isOnline() {
        return this.isBotOnline;
    }

    /**
     * Start the process: Check Aternos status, start if needed, then connect bot
     */
    async launchServer() {
        try {
            const client = await AternosClient.getClient();
            const { status } = await client.getServerStatus();

            if (status === 'online') {
                this.connectBot();
                return { success: true, message: 'Server is online. Connecting bot...' };
            } else if (status === 'offline' || status === 'stopping') {
                const res = await client.startServer();
                if (res.success) {
                    this.monitorServerStart();
                }
                return res;
            } else {
                // starting, queued, etc.
                this.monitorServerStart();
                return { success: true, message: `Server is ${status}. Waiting for it to go online...` };
            }
        } catch (error) {
            console.error('Launch error:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Explicit start command (alias for launchServer logic context)
     */
    async start() {
        return this.launchServer();
    }

    async stop() {
        if (this.bot) {
            this.bot.quit();
            this.bot = null;
            this.isBotOnline = false;
        }

        const client = await AternosClient.getClient();
        return await client.stopServer();
    }

    async restart() {
        if (this.bot) {
            this.bot.quit();
        }
        const client = await AternosClient.getClient();
        const res = await client.restartServer();
        if (res.success) {
            this.monitorServerStart();
        }
        return res;
    }

    async getLogs() {
        const client = await AternosClient.getClient();
        return await client.getLogs();
    }

    /**
     * Connect the mineflayer bot to the MC server
     */
    connectBot() {
        if (this.bot) return;

        const options = {
            host: process.env.MC_HOST,
            port: parseInt(process.env.MC_PORT || '25565'),
            username: process.env.MC_USERNAME || 'SpadeBot',
            // auth: 'microsoft' // Optional, depending on server mode
        };

        try {
            this.bot = mineflayer.createBot(options);

            this.bot.on('login', () => {
                this.isBotOnline = true;
                this.emit('status', 'connected');
                console.log('Bot logged in');
            });

            this.bot.on('end', (reason) => {
                this.isBotOnline = false;
                this.bot = null;
                this.emit('status', 'disconnected', reason);
                console.log('Bot disconnected:', reason);
            });

            this.bot.on('error', (err) => {
                console.error('Bot error:', err);
                // handle auth errors or connection refused
                if (err.message.includes('ECONNREFUSED')) {
                    this.emit('status', 'disconnected', 'Connection Refused (Server likely offline)');
                }
            });

            this.bot.on('kicked', (reason) => {
                console.log('Bot kicked:', reason);
                this.emit('status', 'disconnected', `Kicked: ${reason}`);
            });

        } catch (err) {
            console.error('Failed to create bot:', err);
        }
    }

    monitorServerStart() {
        // Poll Aternos status every 30 seconds until online
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

        const check = async () => {
            try {
                const client = await AternosClient.getClient();
                const { status } = await client.getServerStatus();

                if (status === 'online') {
                    console.log('Server is now online! Connecting bot...');
                    this.connectBot();
                } else if (status === 'offline') {
                    // Stop polling if it went back to offline (failed start)
                    console.log('Server went offline during startup monitoring.');
                } else {
                    // Still starting/queued
                    this.reconnectTimeout = setTimeout(check, 30000);
                }
            } catch (e) {
                console.error('Monitor error:', e);
            }
        };

        this.reconnectTimeout = setTimeout(check, 30000);
    }
}

module.exports = new BotManager();
