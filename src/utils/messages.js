const { EmbedBuilder } = require('discord.js');
const CONSTANTS = require('../../config/constants');
const channelId = process.env.CHANNEL_ID;
async function sendLogEmbed(client, description, color, retries = CONSTANTS.MAX_RETRY_ATTEMPTS) {
    if (!channelId) return; 
    try {
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
            const embed = new EmbedBuilder()
                .setDescription(description)
                .setColor(color);
            await channel.send({ embeds: [embed] });
        }
    } catch (error) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, CONSTANTS.DISCORD_RETRY_DELAY_MS));
            return sendLogEmbed(client, description, color, retries - 1);
        }
        console.error('[DiscordMessage] Failed to send embed:', error);
    }
}
module.exports = { sendLogEmbed };
