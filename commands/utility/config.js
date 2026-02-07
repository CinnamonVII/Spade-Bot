const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const botManager = require('../../botManager');
const CONSTANTS = require('../../config/constants');
const fs = require('fs');
const path = require('path');
async function updateEnv(key, value) {
    const envPath = path.resolve(__dirname, '../../.env');
    let envContent = '';
    try {
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }
    } catch (e) { }
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
        envContent += `\n${key}=${value}`;
    }
    try {
        fs.writeFileSync(envPath, envContent);
        process.env[key] = value; 
        return true;
    } catch (e) {
        console.error("Failed to write .env", e);
        return false;
    }
}
module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Bot Configuration')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('view').setDescription('View current configuration')
        )
        .addSubcommand(sub =>
            sub.setName('set-credentials')
                .setDescription('Set Aternos credentials')
                .addStringOption(opt => opt.setName('user').setDescription('Aternos Email/User').setRequired(true))
                .addStringOption(opt => opt.setName('pass').setDescription('Aternos Password').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('set-server')
                .setDescription('Set Minecraft Server details')
                .addStringOption(opt => opt.setName('host').setDescription('Server IP/Host').setRequired(true))
                .addIntegerOption(opt => opt.setName('port').setDescription('Server Port').setRequired(true))
        ),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'view') {
            const embed = new EmbedBuilder()
                .setTitle('Current Configuration')
                .setColor(CONSTANTS.COLOR_INFO)
                .addFields(
                    { name: 'MC Host', value: process.env.MC_HOST || 'Not Set', inline: true },
                    { name: 'MC Port', value: process.env.MC_PORT || '25565', inline: true },
                    { name: 'Aternos User', value: process.env.ATERNOS_USER || 'Not Set', inline: true },
                    { name: 'Aternos Pass', value: process.env.ATERNOS_PASS ? '********' : 'Not Set', inline: true },
                    { name: 'Client ID', value: process.env.CLIENT_ID || 'Not Set', inline: true }
                );
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        if (sub === 'set-credentials') {
            const user = interaction.options.getString('user');
            const pass = interaction.options.getString('pass');
            await updateEnv('ATERNOS_USER', user);
            await updateEnv('ATERNOS_PASS', pass);
            botManager.config.aternosUser = user;
            botManager.config.aternosPass = pass;
            return interaction.editReply({ content: '✅ Aternos credentials updated.' });
        }
        if (sub === 'set-server') {
            const host = interaction.options.getString('host');
            const port = interaction.options.getInteger('port');
            await updateEnv('MC_HOST', host);
            await updateEnv('MC_PORT', port);
            botManager.config.host = host;
            botManager.config.port = port;
            botManager.monitor(); 
            return interaction.editReply({ content: `✅ Server details updated to **${host}:${port}**` });
        }
    }
};
