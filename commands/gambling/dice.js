const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query, withTransaction, logTransaction, hasOverdueLoan } = require('../../database');
const CONSTANTS = require('../../config/constants');
const { checkRateLimit } = require('../../src/utils/rateLimiter');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dice')
        .setDescription('Roll the dice.')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Your bet - 4, 5, 6 you win, else you lose.')
                .setMinValue(CONSTANTS.MIN_BET_AMOUNT)
                .setRequired(true)),
    async execute(interaction) {
        const rate = checkRateLimit(`dice:${interaction.user.id}`, 3000, 1);
        if (!rate.ok) {
            const waitSec = Math.ceil(rate.retryAfterMs / 1000);
            return interaction.reply({ content: `Slow down. Try again in ${waitSec}s.`, ephemeral: true });
        }

        const amount = interaction.options.getInteger('amount');
        const userId = interaction.user.id;


        if (interaction.user.bot) {
            return interaction.reply({
                content: "Bots don't play dice.",
                ephemeral: true
            });
        }

        if (await hasOverdueLoan(userId)) {
            return interaction.reply({ content: "**Access Denied**: You have an overdue bank loan. Repay it via `/bank repay` to gamble again.", ephemeral: true });
        }

        const res = await query('SELECT balance FROM users WHERE id = $1', [userId]);
        const userCheck = res.rows[0];
        if (!userCheck || parseInt(userCheck.balance) < amount) {
            return interaction.reply({
                content: `Not enough cash! (Balance: ${userCheck ? parseInt(userCheck.balance) : 0})`,
                ephemeral: true
            });
        }

        try {
            const result = await withTransaction(async (client) => {
                await client.query('INSERT INTO users (id, balance) VALUES ($1, 0) ON CONFLICT (id) DO NOTHING', [userId]);
                await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, userId]);

                const roll = Math.floor(Math.random() * 6) + 1;
                const won = roll >= CONSTANTS.DICE_WIN_THRESHOLD; // 5-6 wins (33%)

                if (won) {
                    const payout = Math.floor(amount * CONSTANTS.DICE_MULTIPLIER);
                    await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [payout, userId]);
                    await logTransaction(null, userId, amount, 'dice_win');
                } else {
                    await logTransaction(userId, null, amount, 'dice_loss');
                }

                return { roll, won };
            });

            if (result.error) {
                return interaction.reply({ content: result.error, ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('Dice Roll')
                .setDescription(`You rolled a **${result.roll}**.\n` +
                    (result.won ? `You won! (+${amount})` : `Ouch, lost... (-${amount})`))
                .setColor(result.won ? CONSTANTS.COLOR_SUCCESS : CONSTANTS.COLOR_ERROR);

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            return interaction.reply({ content: 'An error occurred while processing your bet.', ephemeral: true });
        }
    },
};
