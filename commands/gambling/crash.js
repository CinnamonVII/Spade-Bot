const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { query, withTransaction, ensureUser, hasOverdueLoan } = require('../../database');
const CONSTANTS = require('../../config/constants');

// Active crash games per channel
const activeGames = new Map();

// Generate crash point using provably fair algorithm
function generateCrashPoint() {
    // Using exponential distribution with house edge
    // E = 0.99 means 1% house edge
    const e = Math.max(1, 0.99 / (1 - Math.random()));
    // Cap at 100x
    return Math.min(100, Math.floor(e * 100) / 100);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crash')
        .setDescription('Play the crash game!')
        .addSubcommand(sub =>
            sub.setName('bet')
                .setDescription('Place a bet on the current crash round')
                .addIntegerOption(opt => opt.setName('amount').setDescription('Bet amount').setRequired(true).setMinValue(10))
        )
        .addSubcommand(sub =>
            sub.setName('cashout').setDescription('Cash out your bet')
        )
        .addSubcommand(sub =>
            sub.setName('start').setDescription('Start a new crash round (auto-starts if none active)')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        await ensureUser(userId);

        if (sub === 'bet') {
            // Check for overdue loans
            const hasOverdue = await hasOverdueLoan(userId);
            if (hasOverdue) {
                return interaction.reply({ content: '❌ You have overdue loans! Pay them back first.', ephemeral: true });
            }

            const amount = interaction.options.getInteger('amount');

            // Check balance
            const userRes = await query('SELECT balance FROM users WHERE id = $1', [userId]);
            const balance = parseInt(userRes.rows[0]?.balance || 0);

            if (balance < amount) {
                return interaction.reply({ content: `❌ Insufficient funds. You have **$${balance.toLocaleString()}**.`, ephemeral: true });
            }

            // Get or create game
            let game = activeGames.get(channelId);
            if (!game || game.crashed) {
                // Start new game
                game = {
                    crashPoint: generateCrashPoint(),
                    multiplier: 1.00,
                    bets: new Map(),
                    crashed: false,
                    startTime: Date.now()
                };
                activeGames.set(channelId, game);

                // Start the game loop
                runGameLoop(interaction.channel, channelId);
            }

            // Check if already bet
            if (game.bets.has(userId)) {
                return interaction.reply({ content: '❌ You already have a bet in this round!', ephemeral: true });
            }

            // Deduct balance and add bet atomically
            // SECURITY FIX: Use database lock to prevent double-betting (VULN-005)
            try {
                await withTransaction(async (client) => {
                    // Lock user row and deduct balance atomically
                    const result = await client.query(
                        'UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING balance',
                        [amount, userId]
                    );

                    if (result.rowCount === 0) {
                        throw new Error('INSUFFICIENT_FUNDS');
                    }
                });

                game.bets.set(userId, { amount, cashedOut: false, username: interaction.user.username });
                return interaction.reply({ content: `✅ Bet placed: **$${amount.toLocaleString()}**. Use \`/crash cashout\` to cash out!`, ephemeral: true });
            } catch (error) {
                if (error.message === 'INSUFFICIENT_FUNDS') {
                    return interaction.reply({ content: `❌ Insufficient funds. You have **$${balance.toLocaleString()}**.`, ephemeral: true });
                }
                throw error;
            }
        }

        if (sub === 'cashout') {
            const game = activeGames.get(channelId);
            if (!game || game.crashed) {
                return interaction.reply({ content: '❌ No active crash game. Start one with `/crash bet`!', ephemeral: true });
            }

            const bet = game.bets.get(userId);
            if (!bet) {
                return interaction.reply({ content: '❌ You don\'t have a bet in this round.', ephemeral: true });
            }

            if (bet.cashedOut) {
                return interaction.reply({ content: '❌ You already cashed out!', ephemeral: true });
            }

            // Cash out with database lock to prevent double cashout
            // SECURITY FIX: Atomic cashout operation (VULN-005)
            try {
                const payout = await withTransaction(async (client) => {
                    // Re-check bet status inside transaction
                    if (bet.cashedOut) {
                        throw new Error('ALREADY_CASHED_OUT');
                    }

                    // Set flag FIRST before any DB operations
                    bet.cashedOut = true;
                    bet.cashoutMultiplier = game.multiplier;

                    const payoutAmount = Math.floor(bet.amount * game.multiplier);

                    // Update balance atomically
                    await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [payoutAmount, userId]);

                    return payoutAmount;
                });

                return interaction.reply({ content: `💰 Cashed out at **${game.multiplier.toFixed(2)}x**! Won **$${payout.toLocaleString()}**!` });
            } catch (error) {
                if (error.message === 'ALREADY_CASHED_OUT') {
                    return interaction.reply({ content: '❌ You already cashed out!', ephemeral: true });
                }
                throw error;
            }
        }

        if (sub === 'start') {
            const game = activeGames.get(channelId);
            if (game && !game.crashed) {
                return interaction.reply({ content: '⏳ A game is already in progress!', ephemeral: true });
            }

            // Start new game
            const newGame = {
                crashPoint: generateCrashPoint(),
                multiplier: 1.00,
                bets: new Map(),
                crashed: false,
                startTime: Date.now()
            };
            activeGames.set(channelId, newGame);

            const embed = new EmbedBuilder()
                .setTitle('🚀 Crash Game Starting!')
                .setDescription('Place your bets with `/crash bet <amount>`\nGame starts in 10 seconds...')
                .setColor(CONSTANTS.COLOR_INFO);

            await interaction.reply({ embeds: [embed] });

            // Wait for bets then start
            setTimeout(() => runGameLoop(interaction.channel, channelId), 10000);
        }
    }
};

async function runGameLoop(channel, channelId) {
    const game = activeGames.get(channelId);
    if (!game || game.crashed) return;

    const interval = setInterval(async () => {
        if (!game || game.crashed) {
            clearInterval(interval);
            return;
        }

        // Increase multiplier
        game.multiplier += 0.01 * (1 + game.multiplier * 0.1);
        game.multiplier = Math.round(game.multiplier * 100) / 100;

        // Check if crashed
        if (game.multiplier >= game.crashPoint) {
            game.crashed = true;
            clearInterval(interval);

            // Build results
            const results = [];
            for (const [uid, bet] of game.bets) {
                if (bet.cashedOut) {
                    results.push(`✅ ${bet.username}: Cashed out at ${bet.cashoutMultiplier.toFixed(2)}x - Won $${Math.floor(bet.amount * bet.cashoutMultiplier).toLocaleString()}`);
                } else {
                    results.push(`❌ ${bet.username}: Lost $${bet.amount.toLocaleString()}`);
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('💥 CRASHED!')
                .setDescription(`The rocket crashed at **${game.crashPoint.toFixed(2)}x**!`)
                .setColor(CONSTANTS.COLOR_ERROR)
                .setTimestamp();

            if (results.length > 0) {
                embed.addFields({ name: 'Results', value: results.slice(0, 10).join('\n') || 'No bets' });
            }

            try {
                await channel.send({ embeds: [embed] });
            } catch (e) {
                console.error('[Crash] Failed to send crash message:', e);
            }

            // Clean up after 5 seconds
            setTimeout(() => activeGames.delete(channelId), 5000);
        }
    }, 100); // Update every 100ms
}
