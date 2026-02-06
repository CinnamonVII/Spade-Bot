const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query, withTransaction, logTransaction, hasOverdueLoan } = require('../../database');
const CONSTANTS = require('../../config/constants');
const { checkRateLimit } = require('../../src/utils/rateLimiter');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('flip')
        .setDescription('Heads or Tails? Double or nothing.')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to bet')
                .setMinValue(CONSTANTS.MIN_BET_AMOUNT)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('side')
                .setDescription('Heads or Tails?')
                .setRequired(true)
                .addChoices(
                    { name: 'Pile (Heads)', value: 'heads' },
                    { name: 'Face (Tails)', value: 'tails' }
                )),
    async execute(interaction) {
        const rate = checkRateLimit(`flip:${interaction.user.id}`, 3000, 1);
        if (!rate.ok) {
            const waitSec = Math.ceil(rate.retryAfterMs / 1000);
            return interaction.reply({ content: `Slow down. Try again in ${waitSec}s.`, ephemeral: true });
        }

        const amount = interaction.options.getInteger('amount');
        const choice = interaction.options.getString('side');
        const userId = interaction.user.id;


        if (interaction.user.bot) {
            return interaction.reply({
                content: "Bots don't gamble.",
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
                content: `Broke much? You only have ${userCheck ? parseInt(userCheck.balance) : 0} coins.`,
                ephemeral: true
            });
        }

        try {

            const result = await withTransaction(async (client) => {

                await client.query('INSERT INTO users (id, balance) VALUES ($1, 0) ON CONFLICT (id) DO NOTHING', [userId]);


                await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, userId]);


                const coinResult = Math.random() < CONSTANTS.COINFLIP_WIN_CHANCE ? 'heads' : 'tails';
                const won = (choice === coinResult);


                if (won) {

                    await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount * 2, userId]);
                    await logTransaction(null, userId, amount, 'coinflip_win');
                } else {

                    await logTransaction(userId, null, amount, 'coinflip_loss');
                }

                return { won, coinResult };
            });


            if (result.error) {
                return interaction.reply({ content: result.error, ephemeral: true });
            }


            const embed = new EmbedBuilder()
                .setTitle(result.won ? 'VICTORY!' : 'DEFEAT')
                .setColor(result.won ? CONSTANTS.COLOR_SUCCESS : CONSTANTS.COLOR_ERROR)
                .setDescription(`It landed on **${result.coinResult === 'heads' ? 'HEADS' : 'TAILS'}**.\n\n` +
                    (result.won ? `Nice! You won **${amount}** coins!` : `Oof. You lost **${amount}** coins.`));

            await interaction.reply({ embeds: [embed] });

        } catch (error) {


            if (error.message.includes('check_balance_positive') || error.code === '23514') {
                return interaction.reply({
                    content: "Hey, you can't bet what you don't have.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                content: 'An error occurred while placing your bet.',
                ephemeral: true
            });
        }
    },
};
