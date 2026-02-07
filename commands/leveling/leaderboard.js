const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getXpLeaderboard, query } = require('../../database');
const CONSTANTS = require('../../config/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the server leaderboards')
        .addSubcommand(sub =>
            sub.setName('xp')
                .setDescription('View XP Leaderboard')
        )
        .addSubcommand(sub =>
            sub.setName('balance')
                .setDescription('View Richest Players')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const embed = new EmbedBuilder()
            .setColor(CONSTANTS.COLOR_INFO)
            .setTimestamp();

        if (subcommand === 'xp') {
            const topUsers = await getXpLeaderboard(10);
            embed.setTitle('🏆 XP Leaderboard');

            let desc = '';
            for (let i = 0; i < topUsers.length; i++) {
                const u = topUsers[i];
                desc += `**${i + 1}.** <@${u.id}> • **Lvl ${u.level}** • (*${u.xp} XP*)\n`;
            }
            if (topUsers.length === 0) desc = 'No data yet.';
            embed.setDescription(desc);

        } else if (subcommand === 'balance') {
            const res = await query('SELECT id, balance FROM users ORDER BY balance DESC LIMIT 10');
            const users = res.rows;
            embed.setTitle('💰 Richest Players (Top 10)').setColor(0xF1C40F);

            let desc = '';
            for (let i = 0; i < users.length; i++) {
                const u = users[i];
                let medal = '';
                if (i === 0) medal = '🥇';
                else if (i === 1) medal = '🥈';
                else if (i === 2) medal = '🥉';
                else medal = `**#${i + 1}**`;

                desc += `${medal} <@${u.id}> : **${u.balance}** 💰\n`;
            }
            if (users.length === 0) desc = 'Everyone is broke.';
            embed.setDescription(desc);
        }

        await interaction.reply({ embeds: [embed] });
    }
};
