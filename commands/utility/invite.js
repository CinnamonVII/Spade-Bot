const { SlashCommandBuilder, OAuth2Scopes, PermissionFlagsBits } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Get the invite link to add this bot to other servers!'),
    async execute(interaction) {
        const client = interaction.client;
        const inviteLink = client.generateInvite({
            scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
            permissions: [
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ManageMessages 
            ]
        });
        await interaction.reply({
            content: `🔗 **Invite Spade Bot to your server:**\n${inviteLink}\n\nMake sure to enable "Public Bot" in the Discord Developer Portal so others can invite it!`,
            ephemeral: true
        });
    },
};
