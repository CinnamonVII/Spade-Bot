const { createCanvas, loadImage } = require('@napi-rs/canvas');
const GifEncoder = require('gif-encoder-2');
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 700;
const SYMBOL_SIZE = 80;
const REEL_X_START = 220;
const REEL_Y_START = 120;
const REEL_SPACING = 120;
const COLORS = {
    BACKGROUND: '#1a1a1a',
    CABINET: '#2b2b2b',
    REEL_BG: '#ffffff',
    TEXT_GOLD: '#ffd700',
    TEXT_WHITE: '#ffffff',
    BORDER: '#000000',
    ACCENT: '#ff0055'
};
const EMOJI_URLS = {
    '🍒': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f352.png',
    '🍋': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f34b.png',
    '🍇': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f347.png',
    '🍉': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f349.png',
    '🍊': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f34a.png',
    '🍎': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f34e.png',
    '🥝': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f95d.png',
    '🍍': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f34d.png',
    '⭐': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/2b50.png',
    '7️⃣': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/37-20e3.png',
    '❓': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/2753.png',
    '🐴': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f434.png',
    '🏇': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3c7.png',
    '🎠': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3a0.png',
    '🐎': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f40e.png',
    '🏁': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3c1.png'
};
const imageCache = {};
const loadEmoji = async (symbol) => {
    if (imageCache[symbol]) return imageCache[symbol];
    try {
        const url = EMOJI_URLS[symbol] || EMOJI_URLS['❓'];
        const img = await loadImage(url);
        imageCache[symbol] = img;
        return img;
    } catch (e) {
        console.error(`Failed to load emoji: ${symbol}`, e);
        return null;
    }
};
const preloadSymbols = async (frames) => {
    const symbols = new Set();
    frames.forEach(frame => {
        if (frame.reels) frame.reels.forEach(s => symbols.add(s));
        if (frame.topBottom) {
            frame.topBottom.forEach(row => row && row.forEach(s => symbols.add(s)));
        }
    });
    symbols.add('❓');
    await Promise.all([...symbols].map(s => loadEmoji(s)));
};
const drawFrame = (ctx, reels, status, user, topBottom = [[], []]) => {
    const topRow = topBottom[0] || ['❓', '❓', '❓'];
    const botRow = topBottom[1] || ['❓', '❓', '❓'];
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = COLORS.CABINET;
    ctx.roundRect(100, 50, 600, 300, 20);
    ctx.fill();
    ctx.strokeStyle = COLORS.BORDER;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ACCENT;
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('🎰 SUPER SLOTS 🎰', CANVAS_WIDTH / 2, 90);
    for (let i = 0; i < 3; i++) {
        const x = REEL_X_START + (i * REEL_SPACING);
        const y = REEL_Y_START;
        const centerX = x + 50;
        const centerY = y + 80;
        ctx.fillStyle = COLORS.REEL_BG;
        ctx.fillRect(x, y, 100, 160);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, 100, 160);
        const drawSymbol = (sym, cy, alpha) => {
            const img = imageCache[sym];
            if (img) {
                ctx.globalAlpha = alpha;
                ctx.drawImage(img, centerX - 36, cy - 36, 72, 72);
            } else {
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#000';
                ctx.font = '30px sans-serif';
                ctx.fillText('?', centerX, cy);
            }
        };
        drawSymbol(topRow[i], centerY - 80, 0.3);
        drawSymbol(botRow[i], centerY + 80, 0.3);
        drawSymbol(reels[i], centerY, 1.0);
        ctx.globalAlpha = 1.0;
        const grad = ctx.createLinearGradient(x, y, x, y + 160);
        grad.addColorStop(0, 'rgba(0,0,0,0.3)');
        grad.addColorStop(0.2, 'rgba(0,0,0,0)');
        grad.addColorStop(0.8, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, 100, 160);
    }
    ctx.strokeStyle = COLORS.ACCENT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(REEL_X_START - 20, REEL_Y_START + 80);
    ctx.lineTo(REEL_X_START + (3 * REEL_SPACING) + 20, REEL_Y_START + 80);
    ctx.stroke();
    ctx.fillStyle = COLORS.TEXT_WHITE;
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${user.username}`, 120, 320);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.TEXT_GOLD;
    ctx.fillText(`Bet: ${user.bet} 🪙`, 680, 320);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.TEXT_WHITE;
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(status, CANVAS_WIDTH / 2, 380);
};
module.exports = {
    drawSlots: async (reels, status, user, topBottom = [[], []]) => {
        const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const ctx = canvas.getContext('2d');
        await preloadSymbols([{ reels, topBottom }]);
        drawFrame(ctx, reels, status, user, topBottom);
        return await canvas.encode('png');
    },
    createSlotsGif: async (frames) => {
        const encoder = new GifEncoder(CANVAS_WIDTH, CANVAS_HEIGHT);
        const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const ctx = canvas.getContext('2d');
        await preloadSymbols(frames);
        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(33);
        encoder.setQuality(10);
        for (const frame of frames) {
            drawFrame(ctx, frame.reels, frame.status, frame.user, frame.topBottom);
            encoder.addFrame(ctx);
        }
        encoder.finish();
        return encoder.out.getData();
    },
    createHorseRaceGif: async (frames) => {
        const encoder = new GifEncoder(CANVAS_WIDTH, CANVAS_HEIGHT);
        const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.patternQuality = 'fast';
        ctx.textDrawingMode = 'glyph';
        const horseEmojis = new Set(['🏁']);
        frames.forEach(frame => {
            frame.horses?.forEach(h => horseEmojis.add(h.emoji));
        });
        await Promise.all([...horseEmojis].map(e => loadEmoji(e)));
        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(100);
        encoder.setQuality(10);
        const COLORS = {
            SKY_TOP: '#3b86ff',
            SKY_BOTTOM: '#87cefa',
            GRASS: '#38b764',
            DIRT: '#a05b35',
            DIRT_DARK: '#7a4427',
            FENCE: '#ffffff',
            FENCE_SHADOW: '#a9a9a9',
            TEXT: '#ffffff',
            TEXT_SHADOW: '#000000',
            UI_BG: '#292831'
        };
        const drawPixelatedLine = (x1, y1, x2, y2, color, thickness) => {
            ctx.fillStyle = color;
            if (x1 === x2) {
                ctx.fillRect(x1 - thickness / 2, Math.min(y1, y2), thickness, Math.abs(y2 - y1));
            } else if (y1 === y2) {
                ctx.fillRect(Math.min(x1, x2), y1 - thickness / 2, Math.abs(x2 - x1), thickness);
            } else {
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = color;
                ctx.lineWidth = thickness;
                ctx.stroke();
            }
        };
        const drawFinishLine = (x, trackY, trackHeight) => {
            const postWidth = 8;
            ctx.fillStyle = '#555';
            ctx.fillRect(x - 4, trackY - 60, postWidth, trackHeight + 60);
            const bannerY = trackY - 60;
            const bannerHeight = 40;
            const checkSize = 20;
            ctx.fillStyle = '#222';
            const bannerWidth = 24;
            ctx.fillRect(x - 12, bannerY - 5, bannerWidth, bannerHeight + 10);
            for (let r = 0; r < 2; r++) {
                for (let c = 0; c < 1; c++) {
                    const cy = bannerY + (r * checkSize);
                    ctx.fillStyle = ((r + c) % 2 === 0) ? '#fff' : '#000';
                    ctx.fillRect(x - 10, cy, 20, checkSize);
                }
            }
            const stripWidth = 4;
            const numChecks = Math.floor(trackHeight / 25);
            const checkHeight = trackHeight / numChecks;
            for (let i = 0; i < numChecks; i++) {
                const cy = trackY + (i * checkHeight);
                ctx.fillStyle = (i % 2 === 0) ? '#fff' : '#000';
                ctx.fillRect(x - 2, cy, stripWidth, checkHeight);
            }
        };
        const drawBackground = () => {
            const horizonY = 200;
            const gradient = ctx.createLinearGradient(0, 0, 0, horizonY);
            gradient.addColorStop(0, COLORS.SKY_TOP);
            gradient.addColorStop(1, COLORS.SKY_BOTTOM);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.fillStyle = '#654053';
            const mountainBase = horizonY;
            const mountains = [
                { x: 50, w: 200, h: 100 },
                { x: 300, w: 150, h: 80 },
                { x: 600, w: 250, h: 120 }
            ];
            mountains.forEach(m => {
                ctx.beginPath();
                ctx.moveTo(m.x, mountainBase);
                ctx.lineTo(m.x + m.w / 2, mountainBase - m.h);
                ctx.lineTo(m.x + m.w, mountainBase);
                ctx.fill();
            });
            ctx.fillStyle = COLORS.GRASS;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, CANVAS_HEIGHT - horizonY);
        };
        let frameCounter = 0;
        for (const frame of frames) {
            frameCounter++;
            if (frame.showPodium) {
                const bgGradient = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 500);
                bgGradient.addColorStop(0, '#3d2f5a');
                bgGradient.addColorStop(1, '#1a1428');
                ctx.fillStyle = bgGradient;
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                for (let i = 0; i < 50; i++) {
                    ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.8})`;
                    const x = Math.random() * CANVAS_WIDTH;
                    const y = Math.random() * CANVAS_HEIGHT;
                    const size = Math.random() * 3;
                    ctx.fillRect(x, y, size, size);
                }
                ctx.strokeStyle = '#ffd700';
                ctx.lineWidth = 4;
                ctx.strokeText('🏆 RACE RESULTS 🏆', CANVAS_WIDTH / 2, 60);
                ctx.fillStyle = '#ffd700';
                ctx.font = 'bold 40px "Courier New", monospace';
                ctx.textAlign = 'center';
                ctx.fillText('🏆 RACE RESULTS 🏆', CANVAS_WIDTH / 2, 60);
                const podiumConfig = [
                    { rank: 1, x: 300, height: 180, color: '#ffd700', secondColor: '#ffed4e', label: '1ST', glow: '#ffff00' },
                    { rank: 2, x: 120, height: 140, color: '#c0c0c0', secondColor: '#e8e8e8', label: '2ND', glow: '#ffffff' },
                    { rank: 3, x: 480, height: 100, color: '#cd7f32', secondColor: '#e8a87c', label: '3RD', glow: '#ff9955' }
                ];
                podiumConfig.forEach(({ rank, x, height, color, secondColor, label, glow }) => {
                    const y = 400 - height;
                    const horse = frame.horses[rank - 1];
                    if (!horse) return;
                    ctx.shadowColor = glow;
                    ctx.shadowBlur = rank === 1 ? 20 : 10;
                    const gradient = ctx.createLinearGradient(x, y, x, y + height);
                    gradient.addColorStop(0, secondColor);
                    gradient.addColorStop(1, color);
                    ctx.fillStyle = gradient;
                    ctx.fillRect(x, y, 100, height);
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = 'rgba(0,0,0,0.4)';
                    ctx.fillRect(x + 100, y + 10, 12, height - 10);
                    ctx.fillRect(x + 10, y - 10, 100, 10);
                    ctx.fillStyle = 'rgba(255,255,255,0.2)';
                    ctx.fillRect(x + 5, y + 5, 30, height - 10);
                    ctx.fillStyle = '#000';
                    ctx.font = 'bold 28px "Courier New", monospace';
                    ctx.fillText(label, x + 50, y + height - 15);
                    const horseImg = imageCache[horse.emoji];
                    if (horseImg) {
                        ctx.shadowColor = 'rgba(0,0,0,0.5)';
                        ctx.shadowBlur = 10;
                        ctx.drawImage(horseImg, x + 20, y - 90, 60, 60);
                        ctx.shadowBlur = 0;
                    }
                    if (rank === 1) {
                        for (let i = 0; i < 8; i++) {
                            const angle = (frameCounter * 0.1 + i * Math.PI / 4);
                            const sparkleX = x + 50 + Math.cos(angle) * 70;
                            const sparkleY = y - 50 + Math.sin(angle) * 70;
                            ctx.fillStyle = '#ffff00';
                            ctx.fillRect(sparkleX - 2, sparkleY - 2, 4, 4);
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(sparkleX - 1, sparkleY - 1, 2, 2);
                        }
                    }
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 18px "Courier New", monospace';
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 3;
                    ctx.strokeText(`#${horse.num} ${horse.name}`, x + 50, y - 100);
                    ctx.fillText(`#${horse.num} ${horse.name}`, x + 50, y - 100);
                });
                ctx.fillStyle = '#fff';
                ctx.font = '24px "Courier New", monospace';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.strokeText("Race Complete!", CANVAS_WIDTH / 2, CANVAS_HEIGHT - 30);
                ctx.fillText("Race Complete!", CANVAS_WIDTH / 2, CANVAS_HEIGHT - 30);
            } else {
                drawBackground();
                const trackY = 200;
                const trackHeight = 320;
                ctx.fillStyle = COLORS.DIRT;
                ctx.fillRect(0, trackY, CANVAS_WIDTH, trackHeight);
                ctx.fillStyle = COLORS.DIRT_DARK;
                ctx.fillRect(0, trackY - 5, CANVAS_WIDTH, 5);
                ctx.fillRect(0, trackY + trackHeight, CANVAS_WIDTH, 5);
                const laneHeight = trackHeight / 5;
                for (let i = 1; i < 5; i++) {
                    const y = trackY + (i * laneHeight);
                    drawPixelatedLine(0, y, CANVAS_WIDTH, y, 'rgba(0,0,0,0.2)', 2);
                }
                const scrollSpeed = 20;
                const scrollOffset = frameCounter * scrollSpeed;
                const fenceY = trackY - 20;
                const postSpacing = 100;
                const fenceOffset = scrollOffset % postSpacing;
                ctx.fillStyle = COLORS.FENCE;
                for (let x = -fenceOffset; x < CANVAS_WIDTH; x += postSpacing) {
                    ctx.fillRect(x, fenceY, 8, 30);
                }
                ctx.fillRect(0, fenceY + 5, CANVAS_WIDTH, 4);
                ctx.fillRect(0, fenceY + 20, CANVAS_WIDTH, 4);
                const startX = 50;
                const endX = 750;
                const raceWidth = endX - startX;
                drawFinishLine(endX, trackY, trackHeight);
                frame.horses.forEach((horse, idx) => {
                    const progress = horse.position / 100;
                    const noseX = startX + (progress * raceWidth);
                    const x = noseX - 64;
                    const y = trackY + (idx * laneHeight)
                        + (laneHeight - 64) / 2;
                    const bob = (frameCounter + idx) % 4 < 2 ? 0 : 4;
                    ctx.fillStyle = 'rgba(0,0,0,0.4)';
                    ctx.fillRect(x + 10, y + 54, 44, 6);
                    const horseImg = imageCache[horse.emoji];
                    if (horseImg) {
                        ctx.drawImage(horseImg, x, y + bob, 64, 64);
                    }
                    ctx.fillStyle = '#ff0000';
                    ctx.fillRect(x + 5, y + bob + 5, 20, 20);
                    ctx.strokeStyle = '#fff';
                    ctx.strokeRect(x + 5, y + bob + 5, 20, 20);
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 14px "Courier New", monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(horse.num, x + 15, y + bob + 19);
                });
                ctx.fillStyle = '#000';
                ctx.fillRect(50, 40, CANVAS_WIDTH - 100, 20);
                const leader = frame.horses.reduce((prev, curr) => (prev.position > curr.position) ? prev : curr);
                const leaderPct = Math.min(leader.position, 100) / 100;
                ctx.fillStyle = '#00ff00';
                ctx.fillRect(52, 42, (CANVAS_WIDTH - 104) * leaderPct, 16);
                const leaderNoseX = startX + (leader.position / 100) * raceWidth;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(leaderNoseX - 2, trackY - 2, 4, trackHeight + 4);
                ctx.fillStyle = '#ff0000';
                ctx.fillRect(leaderNoseX - 1, trackY, 2, trackHeight);
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.font = 'bold 24px "Courier New", monospace';
                ctx.strokeText(frame.status || 'RACING...', CANVAS_WIDTH / 2, 30);
                ctx.fillText(frame.status || 'RACING...', CANVAS_WIDTH / 2, 30);
            }
            encoder.addFrame(ctx);
        }
        encoder.finish();
        return encoder.out.getData();
    }
};
