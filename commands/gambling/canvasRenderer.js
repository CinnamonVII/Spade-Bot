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

        // PIXEL ART MODE: Disable smoothing
        ctx.imageSmoothingEnabled = false;
        ctx.patternQuality = 'fast';
        ctx.textDrawingMode = 'glyph'; // Sharper text if supported, otherwise standard

        // Preload horse emojis
        const horseEmojis = new Set(['🏁']);
        frames.forEach(frame => {
            frame.horses?.forEach(h => horseEmojis.add(h.emoji));
        });
        await Promise.all([...horseEmojis].map(e => loadEmoji(e)));

        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(100);
        encoder.setQuality(10);

        // Retro/Pixel Palette
        const COLORS = {
            SKY_TOP: '#3b86ff',     // Bright arcade blue
            SKY_BOTTOM: '#87cefa',
            GRASS: '#38b764',       // Retro green
            DIRT: '#a05b35',        // Reddish brown
            DIRT_DARK: '#7a4427',
            FENCE: '#ffffff',
            FENCE_SHADOW: '#a9a9a9',
            TEXT: '#ffffff',
            TEXT_SHADOW: '#000000',
            UI_BG: '#292831'
        };

        const drawPixelatedLine = (x1, y1, x2, y2, color, thickness) => {
            ctx.fillStyle = color;
            // Draw a rectangle for the line to ensure sharpness
            if (x1 === x2) { // Vertical
                ctx.fillRect(x1 - thickness / 2, Math.min(y1, y2), thickness, Math.abs(y2 - y1));
            } else if (y1 === y2) { // Horizontal
                ctx.fillRect(Math.min(x1, x2), y1 - thickness / 2, Math.abs(x2 - x1), thickness);
            } else {
                // Fallback for diagonal (rarely used here)
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = color;
                ctx.lineWidth = thickness;
                ctx.stroke();
            }
        };

        const drawFinishLine = (x) => {
            const trackTop = CANVAS_HEIGHT / 2 + 30;
            const trackHeight = 250;
            const trackBottom = trackTop + trackHeight;

            const postWidth = 10;
            // Far post (centered on x)
            ctx.fillStyle = '#555';
            ctx.fillRect(x - 5, trackTop - 60, postWidth, trackHeight + 60);

            // Checkered Banner
            const bannerY = trackTop - 60;
            const bannerHeight = 40;
            const checkSize = 20;

            ctx.fillStyle = '#000'; // Banner border (centered on x)
            const bannerWidth = 30;
            ctx.fillRect(x - 15, bannerY - 5, bannerWidth, bannerHeight + 10);

            for (let r = 0; r < 2; r++) { // 2 rows
                for (let c = 0; c < 1; c++) { // 1 column vertical strip
                    const cy = bannerY + (r * checkSize);
                    ctx.fillStyle = ((r + c) % 2 === 0) ? '#fff' : '#000';
                    ctx.fillRect(x - 10, cy, 20, checkSize);
                }
            }

            // Finish Line on Ground (Checkered Strip)
            const stripWidth = 20;
            const numChecks = 10;
            const checkHeight = trackHeight / numChecks;
            const startX = x - 10; // Start drawing from x - half width

            for (let i = 0; i < numChecks; i++) {
                const cy = trackTop + (i * checkHeight);
                // Row 1
                ctx.fillStyle = (i % 2 === 0) ? '#fff' : '#000';
                ctx.fillRect(startX, cy, stripWidth / 2, checkHeight);
                // Row 2
                ctx.fillStyle = (i % 2 !== 0) ? '#fff' : '#000';
                ctx.fillRect(startX + stripWidth / 2, cy, stripWidth / 2, checkHeight);
            }
        };

        const drawBackground = () => {
            // Horizon line where track starts
            const horizonY = 200;

            // Sky
            const gradient = ctx.createLinearGradient(0, 0, 0, horizonY);
            gradient.addColorStop(0, COLORS.SKY_TOP);
            gradient.addColorStop(1, COLORS.SKY_BOTTOM);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            // Pixelated Mountains
            ctx.fillStyle = '#654053'; // Dark retro purple
            const mountainBase = horizonY;

            // Draw simple blocky mountains
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

            // Ground (behind track)
            ctx.fillStyle = COLORS.GRASS;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, CANVAS_HEIGHT - horizonY);
        };

        let frameCounter = 0;

        for (const frame of frames) {
            frameCounter++;

            if (frame.showPodium) {
                // --- PODIUM VIEW ---
                ctx.fillStyle = COLORS.UI_BG;
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

                // Title
                ctx.fillStyle = '#ffd700';
                ctx.font = 'bold 36px "Courier New", monospace'; // Monospace for retro feel
                ctx.textAlign = 'center';
                ctx.fillText('🏆 RACE RESULTS 🏆', CANVAS_WIDTH / 2, 60);

                const podiumConfig = [
                    { rank: 1, x: 300, height: 160, color: '#ffd700', label: '1ST' },
                    { rank: 2, x: 140, height: 120, color: '#c0c0c0', label: '2ND' },
                    { rank: 3, x: 460, height: 90, color: '#cd7f32', label: '3RD' }
                ];

                podiumConfig.forEach(({ rank, x, height, color, label }) => {
                    const y = 350 - height;
                    const horse = frame.horses[rank - 1];
                    if (!horse) return;

                    // Block
                    ctx.fillStyle = color;
                    ctx.fillRect(x, y, 100, height);

                    // 3D side effect
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.fillRect(x + 100, y + 10, 10, height - 10);
                    ctx.fillRect(x + 10, y - 10, 100, 10);

                    // Rank
                    ctx.fillStyle = '#000';
                    ctx.font = 'bold 24px "Courier New", monospace';
                    ctx.fillText(label, x + 50, y + height - 20);

                    // Horse
                    const horseImg = imageCache[horse.emoji];
                    if (horseImg) ctx.drawImage(horseImg, x + 20, y - 80, 60, 60);

                    // Name
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 16px "Courier New", monospace';
                    ctx.fillText(`#${horse.num}`, x + 50, y - 90);
                });

                // Status
                ctx.fillStyle = '#fff';
                ctx.font = '20px "Courier New", monospace';
                ctx.fillText("Race Complete!", CANVAS_WIDTH / 2, CANVAS_HEIGHT - 30);

            } else {
                // --- RACE VIEW ---
                drawBackground();

                const trackY = 200; // Fixed start point for track
                const trackHeight = 320;

                // Draw Dirt Track
                ctx.fillStyle = COLORS.DIRT;
                ctx.fillRect(0, trackY, CANVAS_WIDTH, trackHeight);

                // Track borders
                ctx.fillStyle = COLORS.DIRT_DARK;
                ctx.fillRect(0, trackY - 5, CANVAS_WIDTH, 5); // Top border
                ctx.fillRect(0, trackY + trackHeight, CANVAS_WIDTH, 5); // Bottom border

                // Lanes (Horizontal lines)
                const laneHeight = trackHeight / 5;
                for (let i = 1; i < 5; i++) {
                    const y = trackY + (i * laneHeight);
                    drawPixelatedLine(0, y, CANVAS_WIDTH, y, 'rgba(0,0,0,0.2)', 2);
                }

                // Foreground Fence (Scrolling)
                const scrollSpeed = 20;
                const scrollOffset = frameCounter * scrollSpeed;
                const fenceY = trackY - 20;

                // Draw Fence Posts
                const postSpacing = 100;
                const fenceOffset = scrollOffset % postSpacing;

                ctx.fillStyle = COLORS.FENCE;
                for (let x = -fenceOffset; x < CANVAS_WIDTH; x += postSpacing) {
                    ctx.fillRect(x, fenceY, 8, 30);
                }
                // Fence Rays
                ctx.fillRect(0, fenceY + 5, CANVAS_WIDTH, 4);
                ctx.fillRect(0, fenceY + 20, CANVAS_WIDTH, 4);


                // --- HORSES & FINISH LINE ---
                // Mapping: 0% -> 50px, 100% -> 750px (Finish line at the nose)
                const startX = 50;
                const endX = 750;
                const raceWidth = endX - startX;

                // Draw Finish Line if applicable
                // It should be at x = 750
                drawFinishLine(endX);

                frame.horses.forEach((horse, idx) => {
                    const progress = horse.position / 100;

                    // The 'x' position calculated is where the NOSE of the horse should be
                    const noseX = startX + (progress * raceWidth);

                    // Sprite drawing position is noseX minus width (64)
                    // This ensures at 100%, the nose touches the line, not the tail.
                    const x = noseX - 64;

                    const y = trackY + (idx * laneHeight) // Top of lane
                        + (laneHeight - 64) / 2;      // Center vertically in lane (64 is sprite size)

                    // Bobbing
                    const bob = (frameCounter + idx) % 4 < 2 ? 0 : 4; // Simple 2-frame bob

                    // Shadow (Pixelated ellipse)
                    ctx.fillStyle = 'rgba(0,0,0,0.4)';
                    ctx.fillRect(x + 10, y + 54, 44, 6);

                    // Horse
                    const horseImg = imageCache[horse.emoji];
                    if (horseImg) {
                        ctx.drawImage(horseImg, x, y + bob, 64, 64);
                    }

                    // Number Indicator (Pixel Badge)
                    // Draw square badge instead of circle for pixel look
                    ctx.fillStyle = '#ff0000'; // Red badge for visibility
                    ctx.fillRect(x + 5, y + bob + 5, 20, 20);
                    ctx.strokeStyle = '#fff';
                    ctx.strokeRect(x + 5, y + bob + 5, 20, 20);

                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 14px "Courier New", monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(horse.num, x + 15, y + bob + 19);
                });

                // UI Overlay
                // Progress Bar Background
                ctx.fillStyle = '#000';
                ctx.fillRect(50, 40, CANVAS_WIDTH - 100, 20);

                // Leader Progress
                const leader = frame.horses.reduce((prev, curr) => (prev.position > curr.position) ? prev : curr);
                const leaderPct = Math.min(leader.position, 100) / 100;

                ctx.fillStyle = '#00ff00';
                ctx.fillRect(52, 42, (CANVAS_WIDTH - 104) * leaderPct, 16);

                // Red line indicator for the leading horse (Pixel art style)
                // Used nose X position
                const leaderNoseX = startX + (leader.position / 100) * raceWidth;

                // White border for visibility (thinner and centered)
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(leaderNoseX - 2, trackY - 2, 4, trackHeight + 4);

                // Red center (thinner and centered)
                ctx.fillStyle = '#ff0000';
                ctx.fillRect(leaderNoseX - 1, trackY, 2, trackHeight);

                // Text status
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
