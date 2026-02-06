const { Events } = require('discord.js');
const { ensureGuild, updateGuildSettings } = require('../../database');

module.exports = (client) => {

    // When bot joins a server
    client.on(Events.GuildCreate, async (guild) => {
        console.log(`[GUILD] Joined new server: ${guild.name} (${guild.id})`);

        try {
            // Initialize guild in DB
            ensureGuild(guild.id);
            updateGuildSettings(guild.id, { active: 1 });

            // Optional: Send a welcome message to the system channel or owner
            // const systemChannel = guild.systemChannel;
            // if (systemChannel && systemChannel.viewable && systemChannel.permissionsFor(guild.members.me).has('SendMessages')) {
            //     await systemChannel.send(`Hello! Thanks for inviting me. Use \`/\` to see my commands!`);
            // }
        } catch (error) {
            console.error(`[GUILD] Error handling guild join for ${guild.id}:`, error);
        }
    });

    // When bot leaves a server (or is kicked)
    client.on(Events.GuildDelete, async (guild) => {
        console.log(`[GUILD] Left server: ${guild.name} (${guild.id})`);

        try {
            // Soft delete: Mark as inactive instead of removing data strictly
            updateGuildSettings(guild.id, { active: 0 });
        } catch (error) {
            console.error(`[GUILD] Error handling guild leave for ${guild.id}:`, error);
        }
    });
};
