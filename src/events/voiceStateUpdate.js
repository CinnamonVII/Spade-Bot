const { Events, EmbedBuilder } = require('discord.js');
const XP_CONFIG = require('../../config/xp_config');
const CONSTANTS = require('../../config/constants');
const { updateXP } = require('../../database');

const voiceTracker = new Map();

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        if (!newState.member) return;

        const userId = newState.member.id;
        const now = Date.now();

        const isNewActive = newState.channelId && !newState.mute && !newState.deaf;
        const wasOldActive = oldState.channelId && !oldState.mute && !oldState.deaf;


        if (isNewActive && !wasOldActive) {
            const memberCount = newState.channel?.members?.size || 0;
            if (memberCount >= XP_CONFIG.VOICE_MIN_MEMBERS) {
                voiceTracker.set(userId, now);
            }
        }


        if (!isNewActive && wasOldActive) {
            if (voiceTracker.has(userId)) {
                const startTime = voiceTracker.get(userId);
                const durationMs = now - startTime;
                const durationMinutes = Math.floor(durationMs / 60000);

                voiceTracker.delete(userId);

                const count = oldState.channel?.members?.size || 0;

                if (durationMinutes > 0 && count >= XP_CONFIG.VOICE_MIN_MEMBERS) {
                    const xpEarned = durationMinutes * XP_CONFIG.XP_VOICE_PER_MINUTE;

                    try {
                        const { level, leveledUp } = await updateXP(userId, xpEarned);

                        if (leveledUp) {
                            const sysChannel = newState.guild.systemChannel;
                            if (sysChannel) {
                                const embed = new EmbedBuilder()
                                    .setTitle('🎉 Level Up!')
                                    .setDescription(`Congratulations <@${userId}>! You reached **Level ${level}** by talking in voice!`)
                                    .setColor(CONSTANTS.COLOR_SUCCESS);
                                sysChannel.send({ embeds: [embed] }).catch(() => { });
                            }
                        }
                    } catch (e) {
                        console.error('[VoiceXP] Error:', e);
                    }
                }
            }
        }
    },
};
