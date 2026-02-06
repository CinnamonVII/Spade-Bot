const { SlashCommandBuilder } = require('discord.js');
const botManager = require('../botManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check server status.'),
    async execute(interaction) {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

        let statusDesc = "❌ **Offline**";
        let color = 0xFF0000;
        let isConnected = false;

        if (botManager.isOnline()) {
            statusDesc = "✅ **Online**";
            color = 0x00FF00;
            isConnected = true;
        }

        const embed = new EmbedBuilder()
            .setDescription(statusDesc)
            .setColor(color);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_join')
                    .setLabel('How To Start')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(isConnected),
                new ButtonBuilder()
                    .setCustomId('btn_quit')
                    .setLabel('Stop Monitor')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(!isConnected),
                new ButtonBuilder()
                    .setCustomId('btn_status')
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.reply({ embeds: [embed], components: [row] });
    },
};
