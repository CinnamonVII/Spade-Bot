const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { getGuildConfig, setGuildAternosConfig, clearGuildAternosConfig } = require('../../database');
const CONSTANTS = require('../../config/constants');

// Store guild-specific Aternos clients
const guildClients = new Map();

/**
 * Get or create an Aternos client for a specific guild
 */
async function getGuildAternosClient(guildId) {
    const config = await getGuildConfig(guildId);

    if (!config || !config.aternos_user || !config.aternos_pass) {
        return null;
    }

    // We need to create a client with guild-specific credentials
    // For now, we'll use dynamic import to create fresh instances
    const { getClient } = require('../../src/aternos/client');

    // Set temp env vars for this request (not ideal but works)
    const originalUser = process.env.ATERNOS_USER;
    const originalPass = process.env.ATERNOS_PASS;

    process.env.ATERNOS_USER = config.aternos_user;
    process.env.ATERNOS_PASS = config.aternos_pass;

    const client = await getClient();
    await client.cleanup(); // Reset any existing session

    // Restore env vars
    process.env.ATERNOS_USER = originalUser;
    process.env.ATERNOS_PASS = originalPass;

    return { client, config };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('aternos')
        .setDescription('Manage the Aternos Minecraft server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('setup')
                .setDescription('Configure Aternos credentials for this server')
                .addStringOption(opt => opt.setName('username').setDescription('Aternos username').setRequired(true))
                .addStringOption(opt => opt.setName('password').setDescription('Aternos password').setRequired(true))
                .addStringOption(opt => opt.setName('host').setDescription('MC server address (e.g., myserver.aternos.me)').setRequired(true))
                .addIntegerOption(opt => opt.setName('port').setDescription('MC server port (default: 25565)').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('config').setDescription('View current Aternos configuration')
        )
        .addSubcommand(sub =>
            sub.setName('clear').setDescription('Clear Aternos configuration')
        )
        .addSubcommand(sub =>
            sub.setName('status').setDescription('Check server status')
        )
        .addSubcommand(sub =>
            sub.setName('start').setDescription('Start the server')
        )
        .addSubcommand(sub =>
            sub.setName('stop').setDescription('Stop the server')
        )
        .addSubcommand(sub =>
            sub.setName('restart').setDescription('Restart the server')
        )
        .addSubcommand(sub =>
            sub.setName('logs').setDescription('Get server logs')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        // --- Config Commands (no deferral needed for some) ---

        if (sub === 'setup') {
            const username = interaction.options.getString('username');
            const password = interaction.options.getString('password');
            const host = interaction.options.getString('host');
            const port = interaction.options.getInteger('port') || 25565;

            await setGuildAternosConfig(guildId, username, password, host, port);

            const embed = new EmbedBuilder()
                .setTitle('✅ Aternos Configuration Saved')
                .setDescription('Your Aternos credentials have been securely stored for this server.')
                .addFields(
                    { name: 'Server Address', value: `\`${host}:${port}\``, inline: true },
                    { name: 'Username', value: `\`${username}\``, inline: true }
                )
                .setColor(CONSTANTS.COLOR_SUCCESS)
                .setFooter({ text: 'Use /aternos start to start your server!' });

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'config') {
            const config = await getGuildConfig(guildId);

            if (!config || !config.aternos_user) {
                return interaction.reply({
                    content: '❌ No Aternos configuration found. Use `/aternos setup` to configure.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Aternos Configuration')
                .addFields(
                    { name: 'Username', value: `\`${config.aternos_user}\``, inline: true },
                    { name: 'Password', value: `\`${'*'.repeat(config.aternos_pass?.length || 0)}\``, inline: true },
                    { name: 'Server', value: `\`${config.mc_host || 'Not set'}:${config.mc_port || 25565}\``, inline: false }
                )
                .setColor(CONSTANTS.COLOR_INFO);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'clear') {
            await clearGuildAternosConfig(guildId);
            return interaction.reply({
                content: '✅ Aternos configuration cleared.',
                ephemeral: true
            });
        }

        // --- Action Commands (require Aternos client) ---

        await interaction.deferReply();

        const config = await getGuildConfig(guildId);

        if (!config || !config.aternos_user || !config.aternos_pass) {
            return interaction.editReply({
                content: '❌ Aternos not configured for this server. Use `/aternos setup` first.'
            });
        }

        // For action commands, we use the guild-specific config
        // Set temp env vars for this request
        const originalUser = process.env.ATERNOS_USER;
        const originalPass = process.env.ATERNOS_PASS;
        const originalHost = process.env.MC_HOST;
        const originalPort = process.env.MC_PORT;

        process.env.ATERNOS_USER = config.aternos_user;
        process.env.ATERNOS_PASS = config.aternos_pass;
        process.env.MC_HOST = config.mc_host;
        process.env.MC_PORT = config.mc_port;

        try {
            const botManager = require('../../botManager');

            if (sub === 'status') {
                // Use minecraft-protocol ping for status
                const mc = require('minecraft-protocol');

                const statusResult = await new Promise((resolve) => {
                    mc.ping({
                        host: config.mc_host,
                        port: config.mc_port || 25565
                    }, (err, result) => {
                        if (err) {
                            resolve({ online: false, error: err.message });
                        } else {
                            const players = result.players?.sample || [];
                            resolve({
                                online: true,
                                players: players.map(p => p.name),
                                maxPlayers: result.players?.max,
                                onlinePlayers: result.players?.online,
                                version: result.version?.name
                            });
                        }
                    });
                });

                const embed = new EmbedBuilder()
                    .setTitle('🎮 Minecraft Server Status')
                    .setColor(statusResult.online ? CONSTANTS.COLOR_SUCCESS : CONSTANTS.COLOR_ERROR)
                    .addFields(
                        { name: 'Status', value: statusResult.online ? '🟢 Online' : '🔴 Offline', inline: true },
                        { name: 'Address', value: `\`${config.mc_host}:${config.mc_port || 25565}\``, inline: true }
                    )
                    .setTimestamp();

                if (statusResult.online) {
                    embed.addFields(
                        { name: 'Players', value: `${statusResult.onlinePlayers}/${statusResult.maxPlayers}`, inline: true },
                        { name: 'Version', value: statusResult.version || 'Unknown', inline: true }
                    );
                    if (statusResult.players.length > 0) {
                        embed.addFields({ name: 'Online Players', value: statusResult.players.join(', '), inline: false });
                    }
                } else {
                    embed.addFields({ name: 'Info', value: 'Server is offline or unreachable', inline: false });
                }

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'logs') {
                const result = await botManager.getLogs();
                if (!result.success) {
                    return interaction.editReply({ content: `❌ ${result.message}` });
                }

                const logsText = result.logs?.slice(-20).join('\n') || 'No logs available';
                const embed = new EmbedBuilder()
                    .setTitle('📋 Server Console')
                    .setDescription(`\`\`\`\n${logsText.slice(0, 4000)}\n\`\`\``)
                    .setColor(CONSTANTS.COLOR_INFO)
                    .setFooter({ text: 'Last 20 lines' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Action commands: Start/Stop/Restart
            let result;
            switch (sub) {
                case 'start': result = await botManager.start(); break;
                case 'stop': result = await botManager.stop(); break;
                case 'restart': result = await botManager.restart(); break;
            }

            const embed = new EmbedBuilder()
                .setTitle(`Server ${sub.charAt(0).toUpperCase() + sub.slice(1)}`)
                .setDescription(result.success ? `✅ ${result.message}` : `❌ ${result.message}`)
                .setColor(result.success ? CONSTANTS.COLOR_SUCCESS : CONSTANTS.COLOR_ERROR);

            return interaction.editReply({ embeds: [embed] });

        } finally {
            // Restore original env vars
            process.env.ATERNOS_USER = originalUser;
            process.env.ATERNOS_PASS = originalPass;
            process.env.MC_HOST = originalHost;
            process.env.MC_PORT = originalPort;
        }
    }
};
