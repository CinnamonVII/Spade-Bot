const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('equip')
        .setDescription('Equip an item from your inventory.')
        .addIntegerOption(option =>
            option.setName('item_id')
                .setDescription('The ID of the item to equip')
                .setRequired(true)),
    async execute(interaction) {
        const userId = interaction.user.id;
        const itemId = interaction.options.getInteger('item_id');


        const invRes = await query('SELECT amount FROM user_items WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
        const inventoryItem = invRes.rows[0];

        if (!inventoryItem || inventoryItem.amount < 1) {
            return interaction.reply({ content: '❌ You do not own this item!', ephemeral: true });
        }


        const itemRes = await query('SELECT * FROM shop_items WHERE id = $1', [itemId]);
        const item = itemRes.rows[0];

        if (!item) {
            return interaction.reply({ content: '❌ Item not found.', ephemeral: true });
        }


        if (item.type === 'background') {
            await query('UPDATE users SET equipped_bg = $1 WHERE id = $2', [item.data, userId]);

            const embed = new EmbedBuilder()
                .setTitle('Item Equipped!')
                .setDescription(`✅ You have equipped **${item.name}** as your profile background!`)
                .setColor(0x2ECC71);

            return interaction.reply({ embeds: [embed] });
        } else {
            return interaction.reply({ content: '❌ This item cannot be equipped.', ephemeral: true });
        }
    },
};
