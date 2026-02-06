const botManager = require('../../botManager');
const CONSTANTS = require('../../config/constants');
const { sendLogEmbed } = require('../utils/messages');

module.exports = (client) => {
    botManager.on('status', (status, reason) => {
        if (status === 'connected') {
            sendLogEmbed(client, '✅ **Minecraft Server Connected!**\nThe server is online and accessible.', CONSTANTS.COLOR_SUCCESS);
        } else if (status === 'disconnected') {
            let userMessage = `🛑 **Minecraft Server Offline**\nReason: ${reason || 'Unknown'}`;

            if (reason) {
                const r = reason.toLowerCase();
                if (r.includes('econnrefused') || r.includes('timeout') || r.includes('no response')) {
                    userMessage = `🛑 **Minecraft Server Offline**\n(The server appears to be stopped or unreachable)`;
                } else if (r.includes('reset')) {
                    userMessage = `⚠️ **Connection Lost**\n(The server restarted or connection was interrupted)`;
                } else if (r.includes('motd')) {
                    userMessage = `🛑 **Minecraft Server Offline**\n(Detected via server message)`;
                }
            }
            sendLogEmbed(client, userMessage, CONSTANTS.COLOR_ERROR);
        } else if (status === 'auth_failed') {
            sendLogEmbed(client, '⛔ **Aternos Authentication Error**\n⚠️ The python-aternos library is outdated and blocked by Cloudflare.\nPlease start the server manually at aternos.org', CONSTANTS.COLOR_ERROR);
        }
    });
};
