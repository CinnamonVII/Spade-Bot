const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query, withTransaction, logTransaction } = require('../../database');
const CONSTANTS = require('../../config/constants');
const { auditLog } = require('../../src/utils/audit');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work to earn some money.'),
    async execute(interaction) {
        const userId = interaction.user.id;
        const now = new Date();
        if (interaction.user.bot) {
            return interaction.reply({
                content: "Bots can't work.",
                ephemeral: true
            });
        }
        try {
            const result = await withTransaction(async (client) => {
                await client.query('INSERT INTO users (id, balance) VALUES ($1, 0) ON CONFLICT (id) DO NOTHING', [userId]);
                const userRes = await client.query('SELECT last_work FROM users WHERE id = $1', [userId]);
                const user = userRes.rows[0];
                if (user && user.last_work) {
                    const lastDate = new Date(user.last_work);
                    const diff = now - lastDate;
                    const cooldown = CONSTANTS.WORK_COOLDOWN_MINUTES * 60 * 1000;
                    if (diff < cooldown) {
                        const remaining = cooldown - diff;
                        const minutes = Math.floor(remaining / (1000 * 60));
                        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
                        return { error: `You are tired. You can work again in **${minutes}m ${seconds}s**.` };
                    }
                }
                const activeBoostsRes = await client.query(`
                    SELECT SUM(multiplier) as total_boost 
                    FROM active_boosts 
                    WHERE user_id = $1 AND type = 'work_boost' AND expires_at > NOW()
                `, [userId]);
                const activeBoosts = activeBoostsRes.rows[0];
                let multiplier = 1;
                let boostMsg = "";
                if (activeBoosts && activeBoosts.total_boost > 0) {
                    multiplier = 1 + parseFloat(activeBoosts.total_boost);
                    boostMsg = ` (Boost x${multiplier} active!)`;
                }
                let earned = 0;
                let job = "";
                if (Math.random() < 0.01) {
                    earned = Math.floor(10000 * multiplier);
                    job = "Jackpot, you found a bitcoin on the street";
                } else {
                    earned = Math.floor(Math.random() * (CONSTANTS.WORK_MAX_REWARD - CONSTANTS.WORK_BASE_REWARD + 1)) + CONSTANTS.WORK_BASE_REWARD;
                    earned = Math.floor(earned * multiplier);
                    const jobs = [
                        "You washed some cars",
                        "You mowed the neighbor's lawn",
                        "You coded a Discord bot",
                        "You sold some lemonade",
                        "You helped an old lady cross the street",
                        "You made cookies",
                        "You gooned so hard you got paid for it",
                        "You achieved Grand BaitMaster on JerkMate, they rewarded you"
                    ];
                    job = jobs[Math.floor(Math.random() * jobs.length)];
                }
                await client.query('UPDATE users SET balance = balance + $1, last_work = $2 WHERE id = $3', [earned, now.toISOString(), userId]);
                await logTransaction(null, userId, earned, 'work');
                auditLog('work_claim', { userId, amount: earned });
                return { earned, job, boostMsg };
            });
            if (result.error) {
                return interaction.reply({ content: result.error, ephemeral: true });
            }
            const embed = new EmbedBuilder()
                .setColor(CONSTANTS.COLOR_SUCCESS)
                .setTitle('Work Shift Complete')
                .setDescription(`${result.job}`)
                .addFields(
                    { name: 'Earnings', value: `**+${result.earned}** coins`, inline: true },
                    { name: 'Multiplier', value: result.boostMsg || '1x', inline: true }
                )
                .setFooter({ text: 'Come back later for more work!', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            return interaction.reply({
                content: 'An error occurred while working.',
                ephemeral: true
            });
        }
    },
};
