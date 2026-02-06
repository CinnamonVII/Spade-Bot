const { SlashCommandBuilder } = require('discord.js');
const botManager = require('../botManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('users')
        .setDescription("See who's online."),
    async execute(interaction) {
        if (!botManager.isOnline()) {
            await interaction.reply({ content: "The server is offline.", ephemeral: true });
            return;
        }

        const players = botManager.getPlayers();
        if (players.length > 0) {
            await interaction.reply({ content: `**Online Players (${players.length}):** ${players.join(', ')}` });
        } else {
            await interaction.reply({ content: '**No one is online right now.**' });
        }
    },
};
