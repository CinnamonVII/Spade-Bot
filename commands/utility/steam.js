const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query, ensureUser } = require('../../database');
const CONSTANTS = require('../../config/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('steam')
        .setDescription('Steam integration commands')
        .addSubcommand(sub =>
            sub.setName('link')
                .setDescription('Link your Steam ID')
                .addStringOption(opt => opt.setName('id').setDescription('Your Steam ID (64-bit)').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('profile')
                .setDescription('View a user\'s Steam profile')
                .addUserOption(opt => opt.setName('user').setDescription('User to view'))
        ),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        await ensureUser(userId);

        if (sub === 'link') {
            const steamId = interaction.options.getString('id');
            // Basic validation for 17 digit SteamID64
            if (!/^\d{17}$/.test(steamId)) {
                return interaction.reply({ content: '❌ Invalid Steam ID. Please provide your 64-bit Steam ID (17 digits).', ephemeral: true });
            }

            await query('UPDATE users SET steam_id = $1 WHERE id = $2', [steamId, userId]);
            return interaction.reply({ content: `✅ Successfully linked Steam ID: **${steamId}**`, ephemeral: true });
        }

        if (sub === 'profile') {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            await ensureUser(targetUser.id);

            const res = await query('SELECT steam_id FROM users WHERE id = $1', [targetUser.id]);
            const steamId = res.rows[0]?.steam_id;

            if (!steamId) {
                return interaction.reply({ content: `❌ ${targetUser.username} has not linked their Steam account.`, ephemeral: true });
            }

            try {
                // Fetch profile data from Steam XML API
                const response = await fetch(`https://steamcommunity.com/profiles/${steamId}?xml=1`);
                if (!response.ok) throw new Error('Failed to fetch profile');
                const xml = await response.text();

                // Simple regex extraction
                const steamNameMatch = xml.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/) || xml.match(/<steamID>(.*?)<\/steamID>/);
                const avatarMatch = xml.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/) || xml.match(/<avatarFull>(.*?)<\/avatarFull>/);
                const summaryMatch = xml.match(/<summary><!\[CDATA\[(.*?)\]\]><\/summary>/) || xml.match(/<summary>(.*?)<\/summary>/); // Often empty or complex
                const stateMatch = xml.match(/<stateMessage><!\[CDATA\[(.*?)\]\]><\/stateMessage>/) || xml.match(/<stateMessage>(.*?)<\/stateMessage>/);

                const steamName = steamNameMatch ? steamNameMatch[1] : 'Unknown';
                const avatarUrl = avatarMatch ? avatarMatch[1] : null;
                const state = stateMatch ? stateMatch[1] : 'Offline';

                const embed = new EmbedBuilder()
                    .setTitle(`🎮 ${steamName}'s Steam Profile`)
                    .setURL(`https://steamcommunity.com/profiles/${steamId}`)
                    .setColor('#1b2838') // Steam dark blue
                    .setThumbnail(avatarUrl)
                    .addFields(
                        { name: 'Status', value: state, inline: true },
                        { name: 'Steam ID', value: steamId, inline: true }
                    )
                    .setFooter({ text: 'Data provided by Steam Community' });

                return interaction.reply({ embeds: [embed] });

            } catch (error) {
                console.error(error);
                return interaction.reply({ content: `❌ Failed to load Steam profile for ID: ${steamId}. It might be private or invalid.`, ephemeral: true });
            }
        }
    }
};
