const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Check your inventory.'),
    async execute(interaction) {
        const userId = interaction.user.id;

        const res = await query(`
            SELECT i.amount, s.name, s.description 
            FROM user_items i 
            JOIN shop_items s ON i.item_id = s.id 
            WHERE i.user_id = $1
        `, [userId]);
        const items = res.rows;

        const embed = new EmbedBuilder()
            .setTitle(`🎒 ${interaction.user.username}'s Inventory`)
            .setColor(0x3498DB);

        if (items.length === 0) {
            embed.setDescription("Your inventory is empty.");
        } else {
            items.forEach(item => {
                embed.addFields({
                    name: `${item.name} (x${item.amount})`,
                    value: item.description,
                    inline: true
                });
            });
        }

        await interaction.reply({ embeds: [embed] });
    },
};
