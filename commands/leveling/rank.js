const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const { getUserStats, getRank } = require('../../database');
const XP_CONFIG = require('../../config/xp_config');
const { checkRateLimit } = require('../../src/utils/rateLimiter');
function roundedImage(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}
module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('View your rank card or another user\'s')
        .addUserOption(opt => opt.setName('user').setDescription('Target user')),
    async execute(interaction) {
        const rate = checkRateLimit(`rank:${interaction.user.id}`, 10000, 1);
        if (!rate.ok) {
            const waitSec = Math.ceil(rate.retryAfterMs / 1000);
            return interaction.reply({ content: `Slow down. Try again in ${waitSec}s.`, ephemeral: true });
        }
        await interaction.deferReply();
        GlobalFonts.registerFromPath(path.join(__dirname, '../../src/assets/fonts/Inter-Bold.ttf'), 'InterBold');
        GlobalFonts.registerFromPath(path.join(__dirname, '../../src/assets/fonts/Inter-Regular.ttf'), 'InterRegular');
        const target = interaction.options.getUser('user') || interaction.user;
        const stats = await getUserStats(target.id) || { xp: 0, level: 0 };
        const rank = await getRank(target.id);
        const currentXp = stats.xp;
        const currentLevel = stats.level;
        const nextLevelStart = XP_CONFIG.xpForLevel(currentLevel + 1);
        const thisLevelStart = XP_CONFIG.xpForLevel(currentLevel);
        let neededForLevel = nextLevelStart - thisLevelStart;
        let currentInLevel = currentXp - thisLevelStart;
        if (currentInLevel < 0) currentInLevel = 0;
        if (neededForLevel <= 0) neededForLevel = 1;
        let pct = currentInLevel / neededForLevel;
        if (pct > 1) pct = 1;
        const canvas = createCanvas(800, 250);
        const ctx = canvas.getContext('2d');
        const equippedBg = stats.equipped_bg;
        let bgDrawn = false;
        if (equippedBg) {
            const bgPath = path.join(__dirname, '../../', equippedBg);
            if (fs.existsSync(bgPath)) {
                try {
                    const bgImage = await loadImage(bgPath);
                    ctx.drawImage(bgImage, 0, 0, 800, 250);
                    bgDrawn = true;
                } catch (e) {
                    console.error('[Rank] Failed to load custom background:', e.message);
                }
            }
        }
        if (!bgDrawn) {
            drawDefaultGradient(ctx);
        }
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 10;
        roundedImage(ctx, 40, 40, 720, 170, 20);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
        const avatarSize = 130;
        const avatarX = 70;
        const avatarY = 60;
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try {
            const avatarURL = target.displayAvatarURL({ extension: 'png', size: 256 });
            const avatar = await loadImage(avatarURL);
            ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
        } catch (e) {
            ctx.fillStyle = '#5865F2';
            ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
        }
        ctx.restore();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '36px InterBold';
        ctx.textAlign = 'left';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(target.username, 230, 95);
        ctx.shadowBlur = 0;
        ctx.font = '24px InterRegular';
        ctx.fillStyle = '#DDDDDD';
        ctx.fillText(`RANK #${rank}`, 230, 130);
        ctx.textAlign = 'right';
        ctx.font = '40px InterBold';
        ctx.fillStyle = '#5865F2';
        ctx.fillText(`LEVEL ${currentLevel}`, 730, 95);
        ctx.font = '20px InterRegular';
        ctx.fillStyle = '#CCCCCC';
        ctx.fillText(`${currentInLevel.toLocaleString()} / ${neededForLevel.toLocaleString()} XP`, 730, 130);
        const barX = 230;
        const barY = 155;
        const barW = 500;
        const barH = 12;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        roundedImage(ctx, barX, barY, barW, barH, 6);
        ctx.fill();
        const fillW = Math.max(0, barW * pct);
        if (fillW > 0) {
            const barGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
            barGrad.addColorStop(0, '#5865F2');
            barGrad.addColorStop(1, '#00C9FF');
            ctx.fillStyle = barGrad;
            ctx.shadowColor = '#5865F2';
            ctx.shadowBlur = 10;
            ctx.save();
            roundedImage(ctx, barX, barY, fillW, barH, 6);
            ctx.fill();
            ctx.restore();
            ctx.shadowBlur = 0;
        }
        const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'rank.png' });
        await interaction.editReply({ files: [attachment] });
    }
};
function drawDefaultGradient(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 800, 250);
    gradient.addColorStop(0, '#0f0c29');
    gradient.addColorStop(0.5, '#302b63');
    gradient.addColorStop(1, '#24243e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 250);
}
