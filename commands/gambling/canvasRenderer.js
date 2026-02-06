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
        encoder.setDelay(100); // ~10 FPS
        encoder.setQuality(10);

        // Assets and Colors
        const SKY_GRADIENT_START = '#87CEEB'; // Sky Blue
        const SKY_GRADIENT_END = '#E0F7FA';   // Light Cyan
        const GRASS_COLOR = '#4CAF50';
        const DIRT_COLOR = '#795548';
        const TRACK_LANE_COLOR = '#8D6E63';
        const FENCE_COLOR = '#FFFFFF';

        // Draw helper functions
        const drawBackground = (ctx, scrollOffset) => {
            // Sky
            const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT / 2);
            gradient.addColorStop(0, SKY_GRADIENT_START);
            gradient.addColorStop(1, SKY_GRADIENT_END);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            // Distant Mountains (Parallax - moves slower)
            ctx.fillStyle = '#9FA8DA'; // Muted purple/blue
            ctx.beginPath();
            ctx.moveTo(0, CANVAS_HEIGHT / 2);
            for (let i = 0; i <= CANVAS_WIDTH; i += 50) {
                const mountainHeight = 100 + Math.sin((i + scrollOffset * 0.5) * 0.01) * 30;
                ctx.lineTo(i, CANVAS_HEIGHT / 2 - mountainHeight);
            }
            ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
            ctx.fill();
        };

        const drawTrack = (ctx, scrollOffset) => {
            // Ground/Grass area
            ctx.fillStyle = GRASS_COLOR;
            ctx.fillRect(0, CANVAS_HEIGHT / 2, CANVAS_WIDTH, CANVAS_HEIGHT / 2);

            // Dirt Track
            const trackY = CANVAS_HEIGHT / 2 + 30;
            const trackHeight = 250;
            ctx.fillStyle = DIRT_COLOR;
            ctx.fillRect(0, trackY, CANVAS_WIDTH, trackHeight);

            // Lanes
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            const laneHeight = trackHeight / 5;

            ctx.beginPath();
            for (let i = 1; i < 5; i++) {
                const y = trackY + (i * laneHeight);
                ctx.moveTo(0, y);
                ctx.lineTo(CANVAS_WIDTH, y);
            }
            ctx.stroke();

            // Finish Line (if in view)
            // We assume 100% progress corresponds to a fixed distance.
            // In side-scrolling, we can say the "camera" follows the leader.
            // But checking the logic, typical arcade racers often have static backgrounds or looping ones.
            // Let's make a looping fence in the foreground.
        };

        const drawFence = (ctx, scrollOffset) => {
            ctx.fillStyle = FENCE_COLOR;
            const fenceY = CANVAS_HEIGHT / 2 + 20;
            const postSpacing = 60;
            const offset = scrollOffset % postSpacing;

            for (let x = -offset; x < CANVAS_WIDTH; x += postSpacing) {
                ctx.fillRect(x, fenceY, 10, 40); // Post
                // Crossbars
                ctx.fillRect(x, fenceY + 10, postSpacing, 5);
                ctx.fillRect(x, fenceY + 30, postSpacing, 5);
            }
        };

        let frameCounter = 0;

        for (const frame of frames) {
            frameCounter++;

            if (frame.showPodium) {
                // --- PODIUM VIEW (Reuse existing logic or simplify) ---
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

                // Title
                ctx.fillStyle = '#ffd700';
                ctx.font = 'bold 36px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('🏆 RACE RESULTS 🏆', CANVAS_WIDTH / 2, 50);

                // Podium logic
                const podiumConfig = [
                    { rank: 1, x: 300, height: 150, color: '#ffd700', label: '🥇 1st' },
                    { rank: 2, x: 150, height: 120, color: '#c0c0c0', label: '🥈 2nd' },
                    { rank: 3, x: 450, height: 90, color: '#cd7f32', label: '🥉 3rd' }
                ];

                podiumConfig.forEach(({ rank, x, height, color, label }) => {
                    const y = 300 - height;
                    const horse = frame.horses[rank - 1];
                    if (!horse) return;

                    ctx.fillStyle = color;
                    ctx.fillRect(x, y, 100, height);
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(x, y, 100, height);

                    ctx.fillStyle = '#000';
                    ctx.font = 'bold 20px sans-serif';
                    ctx.fillText(label, x + 50, y + height - 10);

                    const horseImg = imageCache[horse.emoji];
                    if (horseImg) ctx.drawImage(horseImg, x + 20, y - 70, 60, 60);

                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 14px sans-serif';
                    ctx.fillText(`#${horse.num} ${horse.name}`, x + 50, y - 80);
                });

                // Status message
                ctx.fillStyle = '#ffd700';
                ctx.font = 'bold 24px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(frame.status || '', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 20);

            } else {
                // --- SIDE SCROLLING RACE VIEW ---

                // Determine Camera / Scroll Position
                // We want to keep the leader somewhat centered or towards the right.
                // But a simple approach is: Background scrolls based on constant speed + leader speed.
                // Let's just scroll constantly to simulate movement.
                const scrollSpeed = 15;
                const scrollOffset = frameCounter * scrollSpeed;

                drawBackground(ctx, scrollOffset);
                drawTrack(ctx, scrollOffset);
                drawFence(ctx, scrollOffset);

                // Draw Finish Line Logic
                // If any horse is > 90%, start showing finish line coming from right?
                // Or just draw distinct finish line based on max progress

                // In this simplified view, let's map 0-100% progress to x=50 -> x=700 (screen space)
                // This means horses actually move across the screen, rather than screen moving with them.
                // It's easier to understand visually.

                const startX = 50;
                const endX = CANVAS_WIDTH - 100; // Finish line x
                const raceWidth = endX - startX;

                // Draw Finish Line
                ctx.fillStyle = '#fff';
                ctx.fillRect(endX, CANVAS_HEIGHT / 2 + 30, 10, 250);
                // Checkered banner
                const bannerY = CANVAS_HEIGHT / 2 - 50;
                ctx.fillStyle = '#000';
                ctx.fillRect(endX - 5, bannerY, 20, 350); // Pole

                // Draw Horses
                const trackY = CANVAS_HEIGHT / 2 + 30;
                const laneHeight = 250 / 5;

                frame.horses.forEach((horse, idx) => {
                    const progress = horse.position / 100;
                    const x = startX + (progress * raceWidth);
                    const y = trackY + (idx * laneHeight) + (laneHeight / 2) - 30; // Center in lane

                    // Bobbing animation
                    const bobOffset = Math.sin((frameCounter + idx) * 0.8) * 5;

                    // Shadow
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.beginPath();
                    ctx.ellipse(x + 30, y + 60, 20, 5, 0, 0, 2 * Math.PI);
                    ctx.fill();

                    // Dust particles (updates every few frames)
                    if (frameCounter % 3 === 0 && horse.position < 100) {
                        ctx.fillStyle = 'rgba(121, 85, 72, 0.4)'; // Dust color
                        ctx.beginPath();
                        ctx.arc(x, y + 50, 5 + Math.random() * 5, 0, 2 * Math.PI);
                        ctx.fill();
                    }

                    // Horse Emoji
                    const horseImg = imageCache[horse.emoji];
                    if (horseImg) {
                        ctx.drawImage(horseImg, x, y + bobOffset, 64, 64);
                    }

                    // Number Badge
                    ctx.fillStyle = '#2196F3'; // Blue badge
                    ctx.beginPath();
                    ctx.arc(x + 10, y + bobOffset + 10, 10, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(horse.num, x + 10, y + bobOffset + 14);

                    // Name tag (floating above)
                    ctx.fillStyle = 'rgba(0,0,0,0.6)';
                    ctx.fillRect(x, y + bobOffset - 20, ctx.measureText(horse.name).width + 10, 20);
                    ctx.fillStyle = '#fff';
                    ctx.font = '12px sans-serif';
                    ctx.fillText(horse.name, x + 5 + ctx.measureText(horse.name).width / 2, y + bobOffset - 6);
                });

                // Status Text
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 4;
                ctx.font = 'bold 32px sans-serif';
                ctx.strokeText(frame.status || '', CANVAS_WIDTH / 2, 80);
                ctx.fillText(frame.status || '', CANVAS_WIDTH / 2, 80);
            }

            encoder.addFrame(ctx);
        }

        encoder.finish();
        return encoder.out.getData();
    }
};
