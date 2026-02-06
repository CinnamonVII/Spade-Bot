const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query, getCreditScore, getBankLoanLimit, getBankInterestRate, getActiveLoans } = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('credit')
        .setDescription('View your financial profile and credit history'),

    async execute(interaction) {
        const userId = interaction.user.id;

        const res = await query('SELECT balance, savings, credit_score FROM users WHERE id = $1', [userId]);
        const user = res.rows[0];

        if (!user) {
            return interaction.reply({ content: 'No account found.', ephemeral: true });
        }

        const loans = await getActiveLoans(userId);
        const totalDebt = loans.reduce((sum, l) => sum + parseInt(l.amount_due), 0);
        const limit = await getBankLoanLimit(userId);
        const rate = await getBankInterestRate(userId);

        const histRes = await query('SELECT change, reason, timestamp FROM credit_history WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 5', [userId]);
        const history = histRes.rows;

        let historyStr = 'None';
        if (history.length > 0) {
            historyStr = history.map(h => {
                const date = new Date(h.timestamp);
                const sign = h.change >= 0 ? '+' : '';
                return `${sign}${h.change} - ${h.reason} (<t:${Math.floor(date.getTime() / 1000)}:R>)`;
            }).join('\n');
        }

        const score = user.credit_score ? parseInt(user.credit_score) : 500;
        let grade = 'D';
        if (score >= 800) grade = 'A';
        else if (score >= 700) grade = 'B';
        else if (score >= 600) grade = 'C';
        else if (score >= 400) grade = 'D';
        else grade = 'F';

        const balance = parseInt(user.balance);
        const savings = parseInt(user.savings);

        const embed = new EmbedBuilder()
            .setTitle(`Credit Report: ${interaction.user.username}`)
            .setColor(score >= 600 ? 0x4caf50 : 0xf44336)
            .addFields(
                { name: 'Credit Score', value: `**${score}** (Grade: ${grade})`, inline: true },
                { name: 'Total Assets', value: `${(balance + savings).toLocaleString()} coins`, inline: true },
                { name: 'Total Debt', value: `${totalDebt.toLocaleString()} coins`, inline: true },
                { name: 'Borrowing Power', value: `Limit: ${limit.toLocaleString()}\nRate: ${(rate * 100).toFixed(1)}%`, inline: false },
                { name: 'Recent Credit History', value: historyStr, inline: false }
            )
            .setFooter({ text: 'Repay loans on time to improve your score!' });

        return interaction.reply({ embeds: [embed] });
    }
};
