const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { query, withTransaction, ensureUser, hasOverdueLoan } = require('../../database');
const CONSTANTS = require('../../config/constants');
const canvasRenderer = require('./canvasRenderer');
const HORSES = [
    { name: 'Thunder Bolt', emoji: '🐴', speed: 0.85, luck: 0.15 },
    { name: 'Midnight Runner', emoji: '🏇', speed: 0.80, luck: 0.20 },
    { name: 'Golden Arrow', emoji: '🎠', speed: 0.90, luck: 0.10 },
    { name: 'Storm Chaser', emoji: '🐎', speed: 0.75, luck: 0.25 },
    { name: 'Lucky Star', emoji: '⭐', speed: 0.70, luck: 0.30 }
];
const activeRaces = new Map();
module.exports = {
    data: new SlashCommandBuilder()
        .setName('race')
        .setDescription('Bet on horse races!')
        .addSubcommand(sub =>
            sub.setName('bet')
                .setDescription('Bet on a horse')
                .addIntegerOption(opt => opt.setName('horse').setDescription('Horse number (1-5)').setRequired(true).setMinValue(1).setMaxValue(5))
                .addIntegerOption(opt => opt.setName('amount').setDescription('Bet amount').setRequired(true).setMinValue(10))
        )
        .addSubcommand(sub =>
            sub.setName('odds').setDescription('View current horses and odds')
        )
        .addSubcommand(sub =>
            sub.setName('start').setDescription('Start the race (admin only)')
        ),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        await ensureUser(userId);
        if (sub === 'odds') {
            const embed = new EmbedBuilder()
                .setTitle('🏇 Horse Racing - Current Odds')
                .setColor(CONSTANTS.COLOR_INFO)
                .setDescription('Place your bets with `/race bet <horse> <amount>`!');
            HORSES.forEach((horse, i) => {
                const odds = (2 / horse.speed).toFixed(1);
                embed.addFields({
                    name: `#${i + 1} ${horse.emoji} ${horse.name}`,
                    value: `Odds: **${odds}x** | Speed: ${Math.round(horse.speed * 100)}%`,
                    inline: true
                });
            });
            return interaction.reply({ embeds: [embed] });
        }
        if (sub === 'bet') {
            const hasOverdue = await hasOverdueLoan(userId);
            if (hasOverdue) {
                return interaction.reply({ content: '❌ You have overdue loans!', ephemeral: true });
            }
            const horseNum = interaction.options.getInteger('horse');
            const amount = interaction.options.getInteger('amount');
            const horse = HORSES[horseNum - 1];
            if (!horse) {
                return interaction.reply({ content: '❌ Invalid horse number!', ephemeral: true });
            }
            const userRes = await query('SELECT balance FROM users WHERE id = $1', [userId]);
            const balance = parseInt(userRes.rows[0]?.balance || 0);
            if (balance < amount) {
                return interaction.reply({ content: `❌ Insufficient funds.`, ephemeral: true });
            }
            let race = activeRaces.get(channelId);
            if (!race) {
                race = { bets: new Map(), started: false };
                activeRaces.set(channelId, race);
            }
            if (race.started) {
                return interaction.reply({ content: '❌ Race already started! Wait for the next one.', ephemeral: true });
            }
            try {
                await withTransaction(async (client) => {
                    const result = await client.query(
                        'UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING balance',
                        [amount, userId]
                    );
                    if (result.rowCount === 0) {
                        throw new Error('INSUFFICIENT_FUNDS');
                    }
                });
                if (!race.bets.has(userId)) {
                    race.bets.set(userId, []);
                }
                race.bets.get(userId).push({ horseNum, amount, username: interaction.user.username });
                return interaction.reply({
                    content: `✅ Bet **$${amount.toLocaleString()}** on **#${horseNum} ${horse.emoji} ${horse.name}**!`,
                    ephemeral: true
                });
            } catch (error) {
                if (error.message === 'INSUFFICIENT_FUNDS') {
                    const actualBalance = await query('SELECT balance FROM users WHERE id = $1', [userId]);
                    const currentBalance = parseInt(actualBalance.rows[0]?.balance || 0);
                    return interaction.reply({ content: `❌ Insufficient funds. You have **$${currentBalance.toLocaleString()}**.`, ephemeral: true });
                }
                throw error;
            }
        }
        if (sub === 'start') {
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({ content: '❌ Only administrators can start races.', ephemeral: true });
            }
            let race = activeRaces.get(channelId);
            if (!race || race.bets.size === 0) {
                return interaction.reply({ content: '❌ No bets placed yet!', ephemeral: true });
            }
            if (race.started) {
                return interaction.reply({ content: '❌ Race already in progress!', ephemeral: true });
            }
            race.started = true;
            await interaction.deferReply();
            setTimeout(async () => {
                try {
                    const positions = HORSES.map((horse, i) => ({
                        ...horse,
                        num: i + 1,
                        progress: 0
                    }));
                    const frames = [];
                    const raceTicks = []; 
                    for (let tick = 0; tick < CONSTANTS.HORSE_RACE_TICKS; tick++) {
                        positions.forEach(p => {
                            const speedVariance = 0.5 + Math.random() * 0.5;
                            const luckBoost = Math.random() < p.luck ? (0.2 + Math.random() * 0.4) : 0;
                            const randomEvent = Math.random();
                            let eventModifier = 0;
                            if (randomEvent < CONSTANTS.HORSE_STUMBLE_CHANCE) eventModifier = CONSTANTS.HORSE_STUMBLE_PENALTY; 
                            else if (randomEvent < CONSTANTS.HORSE_SURGE_CHANCE) eventModifier = CONSTANTS.HORSE_SURGE_BONUS; 
                            p.progress += p.speed * speedVariance + luckBoost + eventModifier;
                            if (p.progress < 0) p.progress = 0;
                        });
                        raceTicks.push(positions.map(p => ({ ...p })));
                    }
                    const finalStandings = [...positions].sort((a, b) => b.progress - a.progress);
                    const winner = finalStandings[0];
                    const winningDistance = winner.progress; 
                    for (let i = 0; i < 10; i++) {
                        frames.push({
                            horses: HORSES.map((h, idx) => ({ ...h, num: idx + 1, position: 0 })),
                            status: 'On your marks...',
                            showPodium: false
                        });
                    }
                    raceTicks.forEach((tickPositions, index) => {
                        frames.push({
                            horses: tickPositions.map(p => ({
                                ...p,
                                position: Math.min(100, (p.progress / winningDistance) * 100)
                            })),
                            status: index < 70 ? 'Racing...' : 'Final stretch!',
                            showPodium: false
                        });
                    });
                    const podiumHorses = finalStandings.map(p => ({
                        ...p,
                        position: Math.min(100, (p.progress / winningDistance) * 100)
                    }));
                    for (let i = 0; i < 50; i++) {
                        frames.push({
                            horses: podiumHorses,
                            status: `${winner.emoji} ${winner.name} WINS!`,
                            showPodium: true
                        });
                    }
                    const gifBuffer = await canvasRenderer.createHorseRaceGif(frames);
                    const attachment = new AttachmentBuilder(gifBuffer, { name: 'race.gif' });
                    const odds = 2 / winner.speed;
                    let results = '**Payouts:**\n';
                    for (const [uid, userBets] of race.bets) {
                        for (const bet of userBets) {
                            if (bet.horseNum === winner.num) {
                                const payout = Math.floor(bet.amount * odds);
                                await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [payout, uid]);
                                results += `✅ ${bet.username}: Won **$${payout.toLocaleString()}**!\n`;
                            } else {
                                results += `❌ ${bet.username}: Lost $${bet.amount.toLocaleString()}\n`;
                            }
                        }
                    }
                    const embed = new EmbedBuilder()
                        .setTitle(`🏆 Winner: ${winner.emoji} ${winner.name}!`)
                        .setDescription(results)
                        .setColor(CONSTANTS.COLOR_SUCCESS);
                    await interaction.editReply({ embeds: [embed], files: [attachment] });
                    activeRaces.delete(channelId);
                } catch (error) {
                    console.error('[HorseRace] Error:', error);
                    await interaction.editReply({ content: '❌ An error occurred during the race.' });
                    activeRaces.delete(channelId);
                }
            }, 3000);
        }
    }
};
