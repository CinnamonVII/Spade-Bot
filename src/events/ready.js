const { Events } = require('discord.js');
const botManager = require('../../botManager');
const CONSTANTS = require('../../config/constants');
const { sendLogEmbed } = require('../utils/messages');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);
        sendLogEmbed(client, '🤖 **Discord Bot Connected**\nThe bot is ready. Economy system online.', CONSTANTS.COLOR_INFO);
        botManager.start();
    },
};
