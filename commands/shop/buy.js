const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query: dbQuery, withTransaction } = require('../../database');
const { auditLog } = require('../../src/utils/audit');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Buy an item.')
        .addStringOption(option =>
            option.setName('item')
                .setDescription("Item name or ID")
                .setRequired(true)),
    async execute(interaction) {
        const query = interaction.options.getString('item');
        const userId = interaction.user.id;

        let res;
        if (!isNaN(query)) {
            res = await dbQuery('SELECT * FROM shop_items WHERE id = $1', [parseInt(query)]);
        } else {
            res = await dbQuery('SELECT * FROM shop_items WHERE lower(name) = $1', [query.toLowerCase()]);
        }
        const item = res.rows[0];

        if (!item) {
            return interaction.reply({ content: "Item not found.", ephemeral: true });
        }

        try {
            const purchase = await withTransaction(async (client) => {
                await client.query('INSERT INTO users (id, balance) VALUES ($1, 0) ON CONFLICT (id) DO NOTHING', [userId]);

                const deductResult = await client.query(`
                    UPDATE users 
                    SET balance = balance - $1 
                    WHERE id = $2 AND balance >= $1
                `, [item.price, userId]);

                if (deductResult.rowCount === 0) {
                    const params = [userId];
                    // To get balance for error message we need another query, but inside transaction is fine
                    const userRes = await client.query('SELECT balance FROM users WHERE id = $1', [userId]);
                    const user = userRes.rows[0];
                    throw new Error(`INSUFFICIENT_FUNDS:${user ? parseInt(user.balance) : 0}`);
                }

                if (item.name === 'Revenue Boost') {
                    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
                    await client.query(`
                        INSERT INTO active_boosts (user_id, type, multiplier, expires_at)
                        VALUES ($1, 'work_boost', 0.5, $2)
                    `, [userId, expiresAt]);
                } else {
                    await client.query(`
                        INSERT INTO user_items (user_id, item_id, amount) VALUES ($1, $2, 1)
                        ON CONFLICT(user_id, item_id) DO UPDATE SET amount = user_items.amount + 1
                    `, [userId, item.id]);
                }

                await client.query('INSERT INTO transactions (from_id, to_id, amount, type) VALUES ($1, $2, $3, $4)', [userId, 'SHOP', item.price, `buy_${item.id}`]);
                return true;
            });

            if (purchase) {
                auditLog('shop_buy', { userId, itemId: item.id, amount: item.price });
            }

        } catch (error) {
            if (error.message && error.message.startsWith('INSUFFICIENT_FUNDS:')) {
                const balance = error.message.split(':')[1];
                return interaction.reply({
                    content: `You don't have enough money. You need **${item.price}** coins. (Balance: ${balance})`,
                    ephemeral: true
                });
            }
            throw error;
        }

        let roleMsg = "";
        if (item.role_id) {
            try {
                const role = interaction.guild.roles.cache.get(item.role_id);
                if (role) {
                    await interaction.member.roles.add(role);
                    roleMsg = `\n\n🎉 **Role Unlocked:** ${role.name}`;
                }
            } catch (error) {
                console.error("Failed to add role:", error);
                roleMsg = `\n\n⚠️ **Role Error:** Could not assign role (Check bot permissions).`;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setDescription(`You bought **${item.name}** for **${item.price}** coins!${roleMsg}`);

        await interaction.reply({ embeds: [embed] });
    },
};
