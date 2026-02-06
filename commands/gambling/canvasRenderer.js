const { createCanvas, loadImage } = require('@napi-rs/canvas');
const GifEncoder = require('gif-encoder-2');

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;

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
    // Horse racing emojis
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

        // Preload all symbols
        await preloadSymbols(frames);

        encoder.start();
        encoder.setRepeat(0); // Loop forever
        encoder.setDelay(33); // ~30 FPS
        encoder.setQuality(10); // Lower = better

        for (const frame of frames) {
            drawFrame(ctx, frame.reels, frame.status, frame.user, frame.topBottom);
            encoder.addFrame(ctx);
        }

        encoder.finish();
        return encoder.out.getData();
    },

    // Horse race GIF animation
    createHorseRaceGif: async (frames) => {
        const encoder = new GifEncoder(CANVAS_WIDTH, CANVAS_HEIGHT);
        const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const ctx = canvas.getContext('2d');

        // Preload horse emojis
        const horseEmojis = new Set(['🏁']);
        frames.forEach(frame => {
            frame.horses?.forEach(h => horseEmojis.add(h.emoji));
        });
        await Promise.all([...horseEmojis].map(e => loadEmoji(e)));

        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(100); // Slower: ~10 FPS for better visibility
        encoder.setQuality(10);

        for (const frame of frames) {
            // Check if we should show podium or race track
            if (frame.showPodium) {
                // PODIUM VIEW
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

                // Title
                ctx.fillStyle = '#ffd700';
                ctx.font = 'bold 36px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('🏆 RACE RESULTS 🏆', CANVAS_WIDTH / 2, 50);

                // Podium blocks
                const podiumConfig = [
                    { rank: 1, x: 300, height: 150, color: '#ffd700', label: '🥇 1st' }, // Gold - center, tallest
                    { rank: 2, x: 150, height: 120, color: '#c0c0c0', label: '🥈 2nd' }, // Silver - left
                    { rank: 3, x: 450, height: 90, color: '#cd7f32', label: '🥉 3rd' }   // Bronze - right
                ];

                podiumConfig.forEach(({ rank, x, height, color, label }) => {
                    const y = 300 - height;
                    const horse = frame.horses[rank - 1];

                    // Safety check for undefined horse
                    if (!horse) return;

                    // Podium block
                    ctx.fillStyle = color;
                    ctx.fillRect(x, y, 100, height);
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(x, y, 100, height);

                    // Rank label on podium
                    ctx.fillStyle = '#000';
                    ctx.font = 'bold 20px sans-serif';
                    ctx.fillText(label, x + 50, y + height - 10);

                    // Horse emoji above podium
                    const horseImg = imageCache[horse.emoji];
                    if (horseImg) {
                        ctx.drawImage(horseImg, x + 20, y - 70, 60, 60);
                    }

                    // Horse name above emoji
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 14px sans-serif';
                    ctx.fillText(`#${horse.num} ${horse.name}`, x + 50, y - 80);
                });

                // 4th and 5th place below
                ctx.fillStyle = '#888';
                ctx.font = '16px sans-serif';
                for (let i = 3; i < Math.min(5, frame.horses.length); i++) {
                    const horse = frame.horses[i];
                    const y = 320 + (i - 3) * 30;
                    ctx.fillText(`${i + 1}th: ${horse.emoji} #${horse.num} ${horse.name}`, CANVAS_WIDTH / 2, y);
                }

                // Status message
                ctx.fillStyle = '#ffd700';
                ctx.font = 'bold 24px sans-serif';
                ctx.fillText(frame.status || '', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 20);
            } else {
                // HIPPODROME TRACK VIEW
                // Background
                ctx.fillStyle = '#1a4d1a';
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

                // Track configuration
                const cx = CANVAS_WIDTH / 2;
                const cy = CANVAS_HEIGHT / 2;
                const startAngle = -Math.PI / 2; // Top (12 o'clock)

                const innerRadiusX = 140;
                const innerRadiusY = 80;
                const outerRadiusX = 280;
                const outerRadiusY = 160;

                // Draw outer grass border
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.3)';
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.ellipse(cx, cy, outerRadiusX + 10, outerRadiusY + 10, 0, 0, 2 * Math.PI);
                ctx.fillStyle = '#134d13';
                ctx.fill();
                ctx.restore();

                // Draw track surface (beige/sand)
                ctx.beginPath();
                ctx.ellipse(cx, cy, outerRadiusX, outerRadiusY, 0, 0, 2 * Math.PI);
                ctx.fillStyle = '#d4b896';
                ctx.fill();

                // Track outer border
                ctx.strokeStyle = '#8b6f47';
                ctx.lineWidth = 3;
                ctx.stroke();

                // Draw lane dividers (5 lanes)
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
                for (let i = 1; i < 5; i++) {
                    const laneRadiusX = innerRadiusX + ((outerRadiusX - innerRadiusX) / 5) * i;
                    const laneRadiusY = innerRadiusY + ((outerRadiusY - innerRadiusY) / 5) * i;
                    ctx.beginPath();
                    ctx.ellipse(cx, cy, laneRadiusX, laneRadiusY, 0, 0, 2 * Math.PI);
                    ctx.stroke();
                }
                ctx.setLineDash([]);

                // Cut out inner grass infield
                ctx.beginPath();
                ctx.ellipse(cx, cy, innerRadiusX, innerRadiusY, 0, 0, 2 * Math.PI);
                ctx.fillStyle = '#1a4d1a';
                ctx.fill();

                // Inner border
                ctx.strokeStyle = '#8b6f47';
                ctx.lineWidth = 3;
                ctx.stroke();

                // Draw START/FINISH line at top
                const finishLineX = cx;
                const finishLineY1 = cy - innerRadiusY;
                const finishLineY2 = cy - outerRadiusY;

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.moveTo(finishLineX, finishLineY1);
                ctx.lineTo(finishLineX, finishLineY2);
                ctx.stroke();

                // Checkered pattern on finish line
                ctx.fillStyle = '#000000';
                const checkerSize = 8;
                for (let i = 0; i < Math.abs(finishLineY2 - finishLineY1) / checkerSize; i++) {
                    if (i % 2 === 0) {
                        ctx.fillRect(finishLineX - 3, finishLineY1 + i * checkerSize, 6, checkerSize);
                    }
                }

                // Draw Horses
                if (frame.horses) {
                    // Draw from outer to inner so inner horses appear on top
                    const sortedHorses = [...frame.horses].reverse();

                    sortedHorses.forEach((horse, reverseIdx) => {
                        const i = frame.horses.length - 1 - reverseIdx;

                        // Lane positioning (middle of each lane)
                        const laneWidth = (outerRadiusX - innerRadiusX) / 5;
                        const laneRadiusX = innerRadiusX + (i * laneWidth) + (laneWidth / 2);
                        const laneRadiusY = innerRadiusY + (i * ((outerRadiusY - innerRadiusY) / 5)) + ((outerRadiusY - innerRadiusY) / 10);

                        // Calculate angle (0-100% → 0-360°, starting from top)
                        const progressFraction = horse.position / 100;
                        const angle = startAngle + (progressFraction * 2 * Math.PI);

                        // Position on track
                        const x = cx + laneRadiusX * Math.cos(angle);
                        const y = cy + laneRadiusY * Math.sin(angle);

                        // Rotation (tangent to path)
                        const rotation = angle + (Math.PI / 2);

                        ctx.save();
                        ctx.translate(x, y);

                        // Leader highlight
                        const maxPos = Math.max(...frame.horses.map(h => h.position));
                        const isLeader = Math.abs(horse.position - maxPos) < 0.1 && horse.position > 0;

                        if (isLeader) {
                            ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
                            ctx.beginPath();
                            ctx.arc(0, 0, 28, 0, 2 * Math.PI);
                            ctx.fill();
                        }

                        // Rotate for horse sprite
                        ctx.rotate(rotation);

                        const horseImg = imageCache[horse.emoji];
                        if (horseImg) {
                            ctx.drawImage(horseImg, -22, -22, 44, 44);
                        }
                        ctx.restore();

                        // Horse number label (unrotated, with background)
                        ctx.save();
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                        ctx.beginPath();
                        ctx.arc(x, y - 30, 12, 0, 2 * Math.PI);
                        ctx.fill();

                        ctx.fillStyle = '#ffffff';
                        ctx.font = 'bold 14px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(horse.num, x, y - 30);
                        ctx.restore();
                    });
                }

                // Center infield decoration
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.beginPath();
                ctx.ellipse(cx, cy, 120, 65, 0, 0, 2 * Math.PI);
                ctx.fill();

                // Status text in center
                ctx.fillStyle = '#ffd700';
                ctx.font = 'bold 28px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(frame.status || '', cx, cy);
            } // Close else block for race track view

            encoder.addFrame(ctx);
        }

        encoder.finish();
        return encoder.out.getData();
    }
};
