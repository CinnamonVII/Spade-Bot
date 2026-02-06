const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('View the server shop.'),
    async execute(interaction) {
        const res = await query('SELECT * FROM shop_items');
        const items = res.rows;

        const embed = new EmbedBuilder()
            .setTitle('Server Shop')
            .setColor(0x9B59B6)
            .setDescription('Use `/buy [name]` or `/buy [id]` to purchase.\n\u200b');

        if (items.length === 0) {
            embed.setDescription("The shop is empty right now.");
        } else {
            items.forEach(item => {
                let typeEmoji = '🔹';
                switch (item.type) {
                    case 'background': typeEmoji = '🖼️'; break;
                    case 'boost': typeEmoji = '⚡'; break;
                    case 'role': typeEmoji = '👑'; break;
                }

                embed.addFields({
                    name: `${typeEmoji} ${item.name}`,
                    value: `> 🆔 **ID:** \`${item.id}\`\n> 💰 **Price:** \`${item.price}\` coins\n> 📝 **Info:** ${item.description || "No description."}\n\u200b`,
                    inline: false
                });
            });
        }

        await interaction.reply({ embeds: [embed] });
    },
};
