const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query, withTransaction, logTransaction } = require('../../database');
const CONSTANTS = require('../../config/constants');
const { auditLog } = require('../../src/utils/audit');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily reward.'),
    async execute(interaction) {
        const userId = interaction.user.id;
        const now = new Date();
        const reward = CONSTANTS.DAILY_REWARD_AMOUNT;

        if (interaction.user.bot) {
            return interaction.reply({
                content: "Bots can't use the economy system.",
                ephemeral: true
            });
        }

        try {
            const result = await withTransaction(async (client) => {
                await client.query('INSERT INTO users (id, balance) VALUES ($1, 0) ON CONFLICT (id) DO NOTHING', [userId]);

                const userRes = await client.query('SELECT last_daily FROM users WHERE id = $1', [userId]);
                const user = userRes.rows[0];

                if (user && user.last_daily) {
                    const lastDate = new Date(user.last_daily);
                    const diff = now - lastDate;
                    const cooldown = CONSTANTS.DAILY_COOLDOWN_HOURS * 60 * 60 * 1000;

                    if (diff < cooldown) {
                        const remaining = cooldown - diff;
                        const hours = Math.floor(remaining / (1000 * 60 * 60));
                        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                        return { error: `Come back in **${hours}h ${minutes}m**.` };
                    }
                }

                const boostItemRes = await client.query(`
                    SELECT count(*) as c FROM user_items i 
                    JOIN shop_items s ON i.item_id = s.id 
                    WHERE i.user_id = $1 AND s.name = 'Revenue Boost' AND i.amount > 0
                `, [userId]);
                const boostItem = boostItemRes.rows[0];

                let multiplier = 1;
                let boostMsg = "";
                if (boostItem && parseInt(boostItem.c) > 0) {
                    multiplier = 1.5;
                    boostMsg = " (Boost x1.5 active!)";
                }

                const finalReward = Math.floor(reward * multiplier);

                await client.query('UPDATE users SET balance = balance + $1, last_daily = $2 WHERE id = $3', [finalReward, now.toISOString(), userId]);

                // We can't await logTransaction inside transaction easily unless we pass client or move it out.
                // But logTransaction uses global pool. SAFE enough for logging. 
                await logTransaction(null, userId, finalReward, 'daily');
                auditLog('daily_claim', { userId, amount: finalReward });

                return { success: true, reward: finalReward, boostMsg };
            });

            if (result.error) {
                return interaction.reply({ content: result.error, ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor(CONSTANTS.COLOR_GOLD)
                .setTitle('Daily Reward')
                .setDescription(`You received **${result.reward}** coins!${result.boostMsg}`);

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            return interaction.reply({
                content: "An error occurred while claiming your reward.",
                ephemeral: true
            });
        }
    },
};
