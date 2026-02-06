try {
    require.resolve('dotenv');
} catch (e) {
    console.error("❌ Dependencies not found. Please run 'npm install' manually before starting the bot.");
    process.exit(1);
}

require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { validateEnvironment } = require('./config/validator');
const { initDatabase, pool } = require('./database');
const commandHandler = require('./src/handlers/commandHandler');
const eventHandler = require('./src/handlers/eventHandler');
const botHandler = require('./src/handlers/botHandler');
const { initErrorHandlers } = require('./src/utils/errorHandler');
const { startScheduledBackups } = require('./src/utils/backup');
const { startBankAI } = require('./src/ai/bankAI');
const guildEvents = require('./src/handlers/guildEvents');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.commands = new Collection();

async function gracefulShutdown() {
    console.log('Shutting down...');
    try {
        await client.destroy();
        if (pool) {
            await pool.end();
        }
        process.exit(0);
    } catch (error) {
        process.exit(1);
    }
}

// Main startup function
(async () => {
    try {
        await initDatabase();
        await pool.query('UPDATE users SET last_work = NULL');

        commandHandler(client);
        eventHandler(client);
        botHandler(client);
        guildEvents(client);
        initErrorHandlers(client);
        startScheduledBackups(client);
        startBankAI();

        const discordToken = process.env.DISCORD_TOKEN;
        await client.login(discordToken);
    } catch (error) {
        console.error('Startup Error:', error);
        process.exit(1);
    }
})();

process.on('SIGINT', () => gracefulShutdown());
process.on('SIGTERM', () => gracefulShutdown());

