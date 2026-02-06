const { SlashCommandBuilder } = require('discord.js');
const botManager = require('../botManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quit')
        .setDescription('Stop the Minecraft server.'),
    async execute(interaction) {
        if (!botManager.isOnline() && !botManager.bot) { 
            await interaction.reply({ content: "The bot is already offline.", ephemeral: true });
        } else {
            botManager.stop();
            await interaction.reply({ content: "Stopping the Minecraft server...", ephemeral: true });
        }
    },
};
