const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const botManager = require('../../botManager');
const CONSTANTS = require('../../config/constants');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        try {
            if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
                const command = interaction.client.commands.get(interaction.commandName);

                if (!command) return;

                try {
                    await command.execute(interaction);
                } catch (error) {
                    console.error('[CommandError]', error);
                    const errorMessage = {
                        content: 'An error occurred while executing this command!',
                        ephemeral: true
                    };

                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(errorMessage);
                    } else {
                        await interaction.reply(errorMessage);
                    }
                }
            } else if (interaction.isAutocomplete()) {
                const command = interaction.client.commands.get(interaction.commandName);
                if (!command || !command.autocomplete) return;

                try {
                    await command.autocomplete(interaction);
                } catch (error) {
                    console.error('[Autocomplete] Error:', error);
                }
            } else if (interaction.isModalSubmit()) {
                if (interaction.customId === 'whitelist_modal') {
                    const username = interaction.fields.getTextInputValue('mc_username');
                    const sent = botManager.sendCommand(`whitelist add ${username}`);

                    await interaction.reply({
                        content: sent
                            ? `Command sent: \`/whitelist add ${username}\``
                            : `The bot is not connected or RCON is not configured.`,
                        ephemeral: true
                    });
                }
            } else if (interaction.isButton()) {
                await handleButtons(interaction);
            }

        } catch (error) {
            console.error('[Interaction] Error:', error);
        }
    },
};

async function handleButtons(interaction) {
    const { customId } = interaction;

    if (customId === 'btn_join') {
        await interaction.reply({
            content: '⚠️ **Auto Start Disabled**\n\n' +
                '🔗 Start manually at: https://aternos.org\n\n' +
                '✅ The bot will automatically detect when the server is online.',
            ephemeral: true
        });
    } else if (customId === 'btn_quit') {
        if (!botManager.isOnline()) {
            return interaction.reply({ content: "Not connected to server.", ephemeral: true });
        }

        botManager.stop();
        await interaction.reply({ content: "Monitoring stopped.", ephemeral: true });
    } else if (customId === 'btn_status') {
        const isConnected = botManager.isOnline();
        const statusDesc = isConnected
            ? "Connected to Minecraft server."
            : "Disconnected from Minecraft server.";
        const color = isConnected ? CONSTANTS.COLOR_SUCCESS : CONSTANTS.COLOR_ERROR;

        const embed = new EmbedBuilder()
            .setDescription(statusDesc)
            .setColor(color);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_join')
                    .setLabel('Join Server')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(isConnected),
                new ButtonBuilder()
                    .setCustomId('btn_quit')
                    .setLabel('Quit Server')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(!isConnected),
                new ButtonBuilder()
                    .setCustomId('btn_status')
                    .setLabel('Refresh Status')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.update({ embeds: [embed], components: [row] });
    }
}
