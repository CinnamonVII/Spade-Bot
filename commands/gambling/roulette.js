const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query, withTransaction, ensureUser, hasOverdueLoan } = require('../../database');
const CONSTANTS = require('../../config/constants');
const WHEEL = [
    { num: 0, color: 'green' },
    { num: 32, color: 'red' }, { num: 15, color: 'black' }, { num: 19, color: 'red' },
    { num: 4, color: 'black' }, { num: 21, color: 'red' }, { num: 2, color: 'black' },
    { num: 25, color: 'red' }, { num: 17, color: 'black' }, { num: 34, color: 'red' },
    { num: 6, color: 'black' }, { num: 27, color: 'red' }, { num: 13, color: 'black' },
    { num: 36, color: 'red' }, { num: 11, color: 'black' }, { num: 30, color: 'red' },
    { num: 8, color: 'black' }, { num: 23, color: 'red' }, { num: 10, color: 'black' },
    { num: 5, color: 'red' }, { num: 24, color: 'black' }, { num: 16, color: 'red' },
    { num: 33, color: 'black' }, { num: 1, color: 'red' }, { num: 20, color: 'black' },
    { num: 14, color: 'red' }, { num: 31, color: 'black' }, { num: 9, color: 'red' },
    { num: 22, color: 'black' }, { num: 18, color: 'red' }, { num: 29, color: 'black' },
    { num: 7, color: 'red' }, { num: 28, color: 'black' }, { num: 12, color: 'red' },
    { num: 35, color: 'black' }, { num: 3, color: 'red' }, { num: 26, color: 'black' }
];
const BET_TYPES = {
    'red': { check: (r) => r.color === 'red', payout: 2 },
    'black': { check: (r) => r.color === 'black', payout: 2 },
    'green': { check: (r) => r.color === 'green', payout: 35 },
    'odd': { check: (r) => r.num !== 0 && r.num % 2 === 1, payout: 2 },
    'even': { check: (r) => r.num !== 0 && r.num % 2 === 0, payout: 2 },
    '1-18': { check: (r) => r.num >= 1 && r.num <= 18, payout: 2 },
    '19-36': { check: (r) => r.num >= 19 && r.num <= 36, payout: 2 },
    '1st12': { check: (r) => r.num >= 1 && r.num <= 12, payout: 3 },
    '2nd12': { check: (r) => r.num >= 13 && r.num <= 24, payout: 3 },
    '3rd12': { check: (r) => r.num >= 25 && r.num <= 36, payout: 3 }
};
module.exports = {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Play roulette!')
        .addIntegerOption(opt =>
            opt.setName('amount').setDescription('Bet amount').setRequired(true).setMinValue(10)
        )
        .addStringOption(opt =>
            opt.setName('bet').setDescription('Bet type or number (0-36)')
                .setRequired(true)
                .addChoices(
                    { name: '🔴 Red', value: 'red' },
                    { name: '⚫ Black', value: 'black' },
                    { name: '🟢 Green (0)', value: 'green' },
                    { name: 'Odd', value: 'odd' },
                    { name: 'Even', value: 'even' },
                    { name: '1-18', value: '1-18' },
                    { name: '19-36', value: '19-36' },
                    { name: '1st Dozen (1-12)', value: '1st12' },
                    { name: '2nd Dozen (13-24)', value: '2nd12' },
                    { name: '3rd Dozen (25-36)', value: '3rd12' }
                )
        ),
    async execute(interaction) {
        const userId = interaction.user.id;
        await ensureUser(userId);
        const hasOverdue = await hasOverdueLoan(userId);
        if (hasOverdue) {
            return interaction.reply({ content: '❌ You have overdue loans! Pay them back with `/bank repay` before gambling.', ephemeral: true });
        }
        const amount = interaction.options.getInteger('amount');
        const betType = interaction.options.getString('bet');
        const userRes = await query('SELECT balance FROM users WHERE id = $1', [userId]);
        const balance = parseInt(userRes.rows[0]?.balance || 0);
        if (balance < amount) {
            return interaction.reply({ content: `❌ Insufficient funds. You have **$${balance.toLocaleString()}**.`, ephemeral: true });
        }
        const result = WHEEL[Math.floor(Math.random() * WHEEL.length)];
        const betInfo = BET_TYPES[betType];
        const won = betInfo.check(result);
        const payout = won ? amount * betInfo.payout : 0;
        const netGain = payout - amount;
        await withTransaction(async (client) => {
            if (won) {
                await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [netGain, userId]);
            } else {
                await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, userId]);
            }
        });
        const colorEmoji = result.color === 'red' ? '🔴' : result.color === 'black' ? '⚫' : '🟢';
        const embed = new EmbedBuilder()
            .setTitle('🎰 Roulette')
            .setColor(won ? CONSTANTS.COLOR_SUCCESS : CONSTANTS.COLOR_ERROR)
            .setDescription(`The ball lands on... **${colorEmoji} ${result.num}**!`)
            .addFields(
                { name: 'Your Bet', value: `${betType} - $${amount.toLocaleString()}`, inline: true },
                { name: 'Result', value: won ? `🎉 Won **$${payout.toLocaleString()}**!` : '💸 Lost!', inline: true }
            )
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
};
