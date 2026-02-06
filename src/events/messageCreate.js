const { Events, EmbedBuilder } = require('discord.js');
const XP_CONFIG = require('../../config/xp_config');
const CONSTANTS = require('../../config/constants');
const { updateXP } = require('../../database');

const xpCooldowns = new Map();

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        const userId = message.author.id;
        const now = Date.now();

        if (xpCooldowns.has(userId)) {
            const expirationTime = xpCooldowns.get(userId) + XP_CONFIG.XP_COOLDOWN;
            if (now < expirationTime) {
                return;
            }
        }

        xpCooldowns.set(userId, now);

         
        const xpAmount = Math.floor(Math.random() * (XP_CONFIG.XP_PER_MESSAGE_MAX - XP_CONFIG.XP_PER_MESSAGE_MIN + 1)) + XP_CONFIG.XP_PER_MESSAGE_MIN;

        try {
            const { level, leveledUp } = updateXP(userId, xpAmount);

            if (leveledUp) {
                const channel = message.channel;
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle('🎉 Level Up!')
                        .setDescription(`Congratulations <@${userId}>! You reached **Level ${level}**!`)
                        .setColor(CONSTANTS.COLOR_SUCCESS);
                    channel.send({ embeds: [embed] }).catch(() => { });
                }
            }
        } catch (error) {
            console.error('XP Error:', error);
        }
    },
};
