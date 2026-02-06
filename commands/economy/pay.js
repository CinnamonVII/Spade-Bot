const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query, withTransaction } = require('../../database');
const { auditLog } = require('../../src/utils/audit');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Transfer money to another user.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to pay')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to send')
                .setMinValue(1)
                .setRequired(true)),
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const sender = interaction.user;

        if (target.id === sender.id) {
            return interaction.reply({ content: "You cannot pay yourself.", ephemeral: true });
        }

        if (target.bot) {
            return interaction.reply({ content: "Bots cannot receive money.", ephemeral: true });
        }


        try {
            const successful = await withTransaction(async (client) => {

                await client.query('INSERT INTO users (id, balance) VALUES ($1, 0) ON CONFLICT (id) DO NOTHING', [sender.id]);


                const deductResult = await client.query(`
                    UPDATE users 
                    SET balance = balance - $1 
                    WHERE id = $2 AND balance >= $1
                `, [amount, sender.id]);


                if (deductResult.rowCount === 0) {
                    throw new Error('INSUFFICIENT_FUNDS');
                }


                await client.query('INSERT INTO users (id, balance) VALUES ($1, 0) ON CONFLICT (id) DO NOTHING', [target.id]);
                await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, target.id]);


                await client.query('INSERT INTO transactions (from_id, to_id, amount, type) VALUES ($1, $2, $3, $4)', [sender.id, target.id, amount, 'transfer']);

                return true;
            });

            if (successful) {
                auditLog('pay_transfer', { fromId: sender.id, toId: target.id, amount });

                const embed = new EmbedBuilder()
                    .setColor(0x2ECC71)
                    .setDescription(`**${sender.username}** sent **${amount}** coins to **${target.username}**.`);

                await interaction.reply({ embeds: [embed] });
            }

        } catch (error) {
            if (error.message === 'INSUFFICIENT_FUNDS') {
                const res = await query('SELECT balance FROM users WHERE id = $1', [sender.id]);
                const senderData = res.rows[0];
                return interaction.reply({
                    content: `Insufficient funds. You have ${senderData ? parseInt(senderData.balance) : 0} coins.`,
                    ephemeral: true
                });
            }
            throw error;
        }
    },
};
