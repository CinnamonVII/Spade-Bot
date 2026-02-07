const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { query, withTransaction, logTransaction, hasOverdueLoan } = require('../../database');
const CONSTANTS = require('../../config/constants');
const canvasRenderer = require('./canvasRenderer');
const { checkRateLimit } = require('../../src/utils/rateLimiter');
const symbols = ['🍒', '🍋', '🍇', '🍉', '🍊', '🍎', '🥝', '🍍', '⭐', '7️⃣'];
module.exports = {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Slots commands.')
        .addSubcommand(subcommand =>
            subcommand.setName('play')
                .setDescription('Spin the slots!')
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Your bet')
                        .setMinValue(CONSTANTS.MIN_BET_AMOUNT)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('rules')
                .setDescription('Show slots rules in EN/FR.')),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'rules') {
            const rulesEmbed = new EmbedBuilder()
                .setTitle('🎰 Slots Rules / Règles des Machines à Sous')
                .setColor(CONSTANTS.COLOR_INFO)
                .addFields(
                    {
                        name: '🇬🇧 English',
                        value: '1. **Objective**: Spin the reels and match symbols on the middle row (payline).\n' +
                            '2. **Triple**: 3 matching symbols pay **15x** your bet.\n' +
                            '3. **Jackpot**: 3 7️⃣ symbols pay **75x** your bet.\n' +
                            '4. **Pair**: 2 matching symbols pay **1.5x** your bet.\n' +
                            '5. **Animation**: The reels reveal in Left -> Right -> Center order with a suspense phase if the first and third matches!'
                    },
                    {
                        name: '🇫🇷 Français',
                        value: '1. **Objectif** : Faites tourner les rouleaux et alignez des symboles sur la ligne du milieu.\n' +
                            '2. **Triple** : 3 symboles identiques paient **15x** votre mise.\n' +
                            '3. **Jackpot** : 3 symboles 7️⃣ paient **75x** votre mise.\n' +
                            '4. **Paire** : 2 symboles identiques paient **1.5x** votre mise.\n' +
                            '5. **Animation** : Les rouleaux se révèlent dans l\'ordre Gauche -> Droite -> Centre avec une phase de suspense si le premier et le troisième correspondent !'
                    }
                );
            return interaction.reply({ embeds: [rulesEmbed] });
        }
        if (subcommand === 'play') {
            const rate = checkRateLimit(`slots:${interaction.user.id}`, 30000, 1);
            if (!rate.ok) {
                const waitSec = Math.ceil(rate.retryAfterMs / 1000);
                return interaction.reply({ content: `Slow down. Try again in ${waitSec}s.`, ephemeral: true });
            }
            const amount = interaction.options.getInteger('amount');
            const userId = interaction.user.id;
            if (interaction.user.bot) {
                return interaction.reply({
                    content: "Bots aren't allowed in the casino.",
                    ephemeral: true
                });
            }
            if (await hasOverdueLoan(userId)) {
                return interaction.reply({ content: "**Access Denied**: You have an overdue bank loan. Repay it via `/bank repay` to gamble again.", ephemeral: true });
            }
            const res = await query('SELECT balance FROM users WHERE id = $1', [userId]);
            const userCheck = res.rows[0];
            if (!userCheck || parseInt(userCheck.balance) < amount) {
                return interaction.reply({
                    content: `You can't afford that! (Balance: ${userCheck ? userCheck.balance : 0})`,
                    ephemeral: true
                });
            }
            await interaction.deferReply();
            const getRandomSymbol = () => symbols[Math.floor(Math.random() * symbols.length)];
            try {
                let finalReels, topReels, botReels, multiplier, payout, resultMessage;
                finalReels = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
                topReels = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
                botReels = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
                const [r1, r2, r3] = finalReels;
                multiplier = 0;
                if (r1 === r2 && r2 === r3) {
                    multiplier = CONSTANTS.SLOTS_TRIPLE_MULTIPLIER; 
                    if (r1 === '7️⃣') multiplier = CONSTANTS.SLOTS_JACKPOT_MULTIPLIER; 
                } else if (r1 === r2 || r2 === r3 || r1 === r3) {
                    multiplier = CONSTANTS.SLOTS_PAIR_MULTIPLIER; 
                }
                const transactionResult = await withTransaction(async (client) => {
                    await client.query('INSERT INTO users (id, balance) VALUES ($1, 0) ON CONFLICT (id) DO NOTHING', [userId]);
                    const res = await client.query('SELECT balance FROM users WHERE id = $1', [userId]);
                    const user = res.rows[0];
                    if (!user || parseInt(user.balance) < amount) {
                        throw new Error(`INSUFFICIENT_FUNDS:${user ? parseInt(user.balance) : 0}`);
                    }
                    await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, userId]);
                    let payout = 0;
                    if (multiplier > 0) {
                        payout = Math.floor(amount * multiplier);
                        await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [payout, userId]);
                        await logTransaction(null, userId, payout - amount, 'slots_win');
                    } else {
                        payout = 0;
                        await logTransaction(userId, null, amount, 'slots_loss');
                    }
                    return { multiplier, payout };
                });
                multiplier = transactionResult.multiplier;
                payout = transactionResult.payout;
                resultMessage = multiplier > 0 ? (multiplier >= 20 ? `WON ${payout}! 🎉 JACKPOT! 🎉` : `WON ${payout}! Nice pair!`) : `Lost... Better luck next time.`;
                if (multiplier === 100) resultMessage = `WON ${payout}! 🚨 MEGA JACKPOT! 🚨`;
                const frames = [];
                const userObj = { username: interaction.user.username, bet: amount };
                let currentRows = {
                    mid: [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()],
                    top: [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()],
                    bot: [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]
                };
                const addFrames = (count, status) => {
                    for (let i = 0; i < count; i++) {
                        frames.push({
                            reels: [...currentRows.mid],
                            topBottom: [[...currentRows.top], [...currentRows.bot]],
                            status: status,
                            user: userObj
                        });
                    }
                };
                for (let i = 0; i < 15; i++) {
                    currentRows.mid = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
                    currentRows.top = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
                    currentRows.bot = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
                    frames.push({ reels: [...currentRows.mid], topBottom: [[...currentRows.top], [...currentRows.bot]], status: 'Spinning...', user: userObj });
                }
                currentRows.mid[0] = finalReels[0];
                currentRows.top[0] = topReels[0];
                currentRows.bot[0] = botReels[0];
                for (let i = 0; i < 15; i++) {
                    currentRows.mid[1] = getRandomSymbol(); currentRows.mid[2] = getRandomSymbol();
                    currentRows.top[1] = getRandomSymbol(); currentRows.top[2] = getRandomSymbol();
                    currentRows.bot[1] = getRandomSymbol(); currentRows.bot[2] = getRandomSymbol();
                    frames.push({ reels: [...currentRows.mid], topBottom: [[...currentRows.top], [...currentRows.bot]], status: 'Spinning...', user: userObj });
                }
                currentRows.mid[2] = finalReels[2];
                currentRows.top[2] = topReels[2];
                currentRows.bot[2] = botReels[2];
                const suspense = finalReels[0] === finalReels[2];
                const centerSpinDuration = suspense ? 45 : 15;
                const statusText = suspense ? 'Suspense... 🤞' : 'Spinning...';
                for (let i = 0; i < centerSpinDuration; i++) {
                    currentRows.mid[1] = getRandomSymbol();
                    currentRows.top[1] = getRandomSymbol();
                    currentRows.bot[1] = getRandomSymbol();
                    frames.push({ reels: [...currentRows.mid], topBottom: [[...currentRows.top], [...currentRows.bot]], status: statusText, user: userObj });
                }
                currentRows.mid[1] = finalReels[1];
                currentRows.top[1] = topReels[1];
                currentRows.bot[1] = botReels[1];
                for (let i = 0; i < 60; i++) {
                    frames.push({ reels: [...currentRows.mid], topBottom: [[...currentRows.top], [...currentRows.bot]], status: resultMessage, user: userObj });
                }
                const gifBuffer = await canvasRenderer.createSlotsGif(frames);
                const attachment = new AttachmentBuilder(gifBuffer, { name: 'slots.gif' });
                await interaction.editReply({ content: '', embeds: [], files: [attachment] });
            } catch (error) {
                if (error.message && error.message.startsWith('INSUFFICIENT_FUNDS:')) {
                    const balance = error.message.split(':')[1];
                    await interaction.editReply({ content: `You can't afford that! (Balance: ${balance})`, files: [], embeds: [] });
                } else {
                    console.error(error);
                    await interaction.editReply({ content: '❌ An error occurred while processing the transaction.', files: [], embeds: [] });
                }
            }
        }
    },
};
