const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query, getCreditScore } = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription("Check yours or another user's balance.")
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check')
                .setRequired(false)),
    async execute(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;

        await query('INSERT INTO users (id, balance) VALUES ($1, 0) ON CONFLICT (id) DO NOTHING', [target.id]);

        const res = await query('SELECT balance FROM users WHERE id = $1', [target.id]);
        const user = res.rows[0] || { balance: 0 };
        const creditScore = await getCreditScore(target.id);

        const embed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setAuthor({ name: `${target.username}'s Wallet`, iconURL: target.displayAvatarURL() })
            .setTitle('Account Balance')
            .setDescription(`**${parseInt(user.balance).toLocaleString()}** coins`)
            .addFields(
                { name: 'Status', value: parseInt(user.balance) > 0 ? 'Active' : 'No Funds', inline: true },
                { name: 'Credit Score', value: `${creditScore}`, inline: true }
            )
            .setFooter({ text: 'Aternos Bridge Economy', iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
