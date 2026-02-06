const { SlashCommandBuilder } = require('discord.js');
const botManager = require('../botManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Start the Minecraft server.'),
    async execute(interaction) {
        if (botManager.isOnline()) {
            await interaction.reply({ content: "The server is already online!", ephemeral: true });
        } else {
            botManager.launchServer();
            await interaction.reply({ content: "Starting the server on Aternos...", ephemeral: true });
        }
    },
};
