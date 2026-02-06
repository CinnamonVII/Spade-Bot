const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { updateXP, setLevel } = require('../../database');
const XP_CONFIG = require('../../config/xp_config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xp')
        .setDescription('Manage XP and Levels (Admin Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add XP to a user')
                .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
                .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of XP').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Set a user\'s Level')
                .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
                .addIntegerOption(opt => opt.setName('level').setDescription('New Level').setRequired(true))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const target = interaction.options.getUser('user');

        if (subcommand === 'add') {
            const amount = interaction.options.getInteger('amount');
            const { xp, level, leveledUp } = updateXP(target.id, amount);

            let msg = `✅ Added **${amount} XP** to ${target}. Total XP: ${xp}, Level: ${level}`;
            if (leveledUp) {
                msg += `\n🎉 **LEVEL UP!** User reached Level ${level}!`;
            }

            await interaction.reply({ content: msg, ephemeral: true });
        }
        else if (subcommand === 'set') {
            const newLevel = interaction.options.getInteger('level');
            setLevel(target.id, newLevel);
            
            
            
            
            
            
            
            
            
            
            

            
            await interaction.reply({ content: `✅ Set ${target}'s level to **${newLevel}**.`, ephemeral: true });
        }
    }
};
