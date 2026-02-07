const { Events } = require('discord.js');
const { ensureGuild, updateGuildSettings } = require('../../database');
module.exports = (client) => {
    client.on(Events.GuildCreate, async (guild) => {
        console.log(`[GUILD] Joined new server: ${guild.name} (${guild.id})`);
        try {
            ensureGuild(guild.id);
            updateGuildSettings(guild.id, { active: 1 });
        } catch (error) {
            console.error(`[GUILD] Error handling guild join for ${guild.id}:`, error);
        }
    });
    client.on(Events.GuildDelete, async (guild) => {
        console.log(`[GUILD] Left server: ${guild.name} (${guild.id})`);
        try {
            updateGuildSettings(guild.id, { active: 0 });
        } catch (error) {
            console.error(`[GUILD] Error handling guild leave for ${guild.id}:`, error);
        }
    });
};
