const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { query } = require('../../database');
const { auditLog } = require('../../src/utils/audit');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription("Admin economy commands.")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcmd =>
            subcmd.setName('set')
                .setDescription("Set a user's balance.")
                .addUserOption(option => option.setName('user').setDescription('User').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('Amount').setMinValue(0).setRequired(true)))
        .addSubcommand(subcmd =>
            subcmd.setName('add')
                .setDescription("Add money to a user.")
                .addUserOption(option => option.setName('user').setDescription('User').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('Amount').setMinValue(1).setRequired(true)))
        .addSubcommand(subcmd =>
            subcmd.setName('remove')
                .setDescription("Remove money from a user.")
                .addUserOption(option => option.setName('user').setDescription('User').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('Amount').setMinValue(1).setRequired(true))),
    async execute(interaction) {
        const adminIds = (process.env.ADMIN_IDS || "").split(',').map(id => id.trim()).filter(Boolean);
        if (adminIds.length === 0) {
            return interaction.reply({
                content: "⚠️ Economic admin commands are disabled. Server administrator must configure ADMIN_IDS environment variable.",
                ephemeral: true
            });
        }
        if (!adminIds.includes(interaction.user.id)) {
            return interaction.reply({
                content: "⛔ You are not authorized to use economic admin commands.",
                ephemeral: true
            });
        }
        const subcommand = interaction.options.getSubcommand();
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        if (target.bot) {
            return interaction.reply({
                content: "Bots don't use economy.",
                ephemeral: true
            });
        }
        await query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [target.id]);
        if (subcommand === 'set') {
            await query('UPDATE users SET balance = $1 WHERE id = $2', [amount, target.id]);
            auditLog('admin_set_balance', { adminId: interaction.user.id, targetId: target.id, amount });
            interaction.reply(`Set **${target.username}**'s balance to **${amount}** coins.`);
        } else if (subcommand === 'add') {
            await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, target.id]);
            auditLog('admin_add_balance', { adminId: interaction.user.id, targetId: target.id, amount });
            interaction.reply(`Added **${amount}** coins to **${target.username}**.`);
        } else if (subcommand === 'remove') {
            try {
                await query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, target.id]);
                auditLog('admin_remove_balance', { adminId: interaction.user.id, targetId: target.id, amount });
                interaction.reply(`Removed **${amount}** coins from **${target.username}**.`);
            } catch (error) {
                if (error.message.includes('check_balance_positive') || error.code === '23514') {
                    interaction.reply(`⚠️ Cannot remove **${amount}** coins - would result in negative balance.`);
                } else {
                    throw error;
                }
            }
        }
    },
};
