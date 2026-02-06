const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const CONSTANTS = require('../../config/constants');
const PokerGame = require('../../src/games/poker/gameManager');
const PokerAI = require('../../src/games/poker/ai');
const { query, hasOverdueLoan } = require('../../database');
const { checkRateLimit } = require('../../src/utils/rateLimiter');


const activeGames = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poker')
        .setDescription('Play Texas Hold\'em Poker')
        .addSubcommand(sub =>
            sub.setName('play')
                .setDescription('Start a new poker lobby')
                .addIntegerOption(opt => opt.setName('buyin').setDescription('Buy-in amount').setRequired(true))
                .addIntegerOption(opt => opt.setName('blind').setDescription('Small Blind amount').setRequired(true))
        ),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === 'play') {
            const rate = checkRateLimit(`poker:${interaction.user.id}`, 10000, 1);
            if (!rate.ok) {
                const waitSec = Math.ceil(rate.retryAfterMs / 1000);
                return interaction.reply({ content: `Slow down. Try again in ${waitSec}s.`, ephemeral: true });
            }

            const channelId = interaction.channel.id;
            const userId = interaction.user.id;

            if (await hasOverdueLoan(userId)) {
                return interaction.reply({ content: "**Access Denied**: You have an overdue bank loan. Repay it via `/bank repay` to gamble again.", ephemeral: true });
            }

            if (activeGames.has(channelId)) {
                return interaction.reply({ content: 'There is already a poker game in this channel!', ephemeral: true });
            }

            const buyIn = interaction.options.getInteger('buyin');
            const smallBlind = interaction.options.getInteger('blind');
            const bigBlind = smallBlind * 2;

            if (buyIn <= 0 || smallBlind <= 0) {
                return interaction.reply({ content: 'Buy-in and Blind must be greater than 0.', ephemeral: true });
            }

            if (buyIn < bigBlind * 10) {
                return interaction.reply({ content: `Buy-in must be at least 10x Big Blind (${bigBlind * 10})`, ephemeral: true });
            }

            const hostId = interaction.user.id;
            const res = await query('SELECT balance FROM users WHERE id = $1', [hostId]);
            const host = res.rows[0];
            if (!host || parseInt(host.balance) < buyIn) {
                return interaction.reply({ content: `You need ${buyIn} 🪙 to start this game.`, ephemeral: true });
            }

            const game = {
                hostId: hostId,
                buyIn,
                smallBlind,
                bigBlind,
                players: new Map(),
                state: 'LOBBY'
            };

            game.players.set(hostId, {
                id: hostId,
                username: interaction.user.username,
                balance: host.balance,
                cards: [],
                chips: 0
            });

            const embed = new EmbedBuilder()
                .setTitle('🎰 Texas Hold\'em Poker Lobby')
                .setDescription(`**Host:** <@${hostId}>\n**Buy-in:** ${buyIn} 🪙\n**Blinds:** ${smallBlind}/${bigBlind}\n\n**Players:**\n1. <@${hostId}>`)
                .setColor(CONSTANTS.COLOR_INFO)
                .setFooter({ text: 'Click "Join" to enter!' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('poker_join').setLabel('Join').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('poker_leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('poker_add_bot').setLabel('Add Bot').setStyle(ButtonStyle.Primary).setEmoji('🤖'),
                new ButtonBuilder().setCustomId('poker_start').setLabel('Start Game').setStyle(ButtonStyle.Success)
            );

            const msg = await interaction.reply({
                embeds: [embed],
                components: [row],
                fetchReply: true
            });

            activeGames.set(channelId, game);

            const collector = msg.createMessageComponentCollector({
                filter: i => ['poker_join', 'poker_leave', 'poker_start', 'poker_add_bot'].includes(i.customId),
                time: 600000
            });

            collector.on('collect', async i => {
                if (!activeGames.has(channelId)) return;
                const g = activeGames.get(channelId);

                if (i.customId === 'poker_join') {
                    if (g.players.has(i.user.id)) return i.reply({ content: 'You already joined!', ephemeral: true });

                    const res = await query('SELECT balance FROM users WHERE id = $1', [i.user.id]);
                    const user = res.rows[0];
                    if (!user || parseInt(user.balance) < buyIn) {
                        return i.reply({ content: `You need ${buyIn} 🪙 to join.`, ephemeral: true });
                    }

                    g.players.set(i.user.id, {
                        id: i.user.id,
                        username: i.user.username,
                        balance: user.balance,
                        cards: [],
                        chips: 0
                    });

                    await i.deferUpdate();
                }
                else if (i.customId === 'poker_leave') {
                    if (!g.players.has(i.user.id)) return i.reply({ content: 'You are not in the lobby.', ephemeral: true });
                    if (i.user.id === g.hostId) {
                        activeGames.delete(channelId);
                        collector.stop();
                        return i.update({ content: '🚫 Host cancelled the lobby.', embeds: [], components: [] });
                    }
                    g.players.delete(i.user.id);
                    await i.deferUpdate();
                }
                else if (i.customId === 'poker_add_bot') {
                    if (i.user.id !== g.hostId) return i.reply({ content: 'Only the host can add bots.', ephemeral: true });

                    const select = new StringSelectMenuBuilder()
                        .setCustomId('bot_difficulty')
                        .setPlaceholder('Select Difficulty')
                        .addOptions(
                            new StringSelectMenuOptionBuilder().setLabel('Easy').setValue('easy').setDescription('Random play styles'),
                            new StringSelectMenuOptionBuilder().setLabel('Medium').setValue('medium').setDescription('Basic poker strategy'),
                            new StringSelectMenuOptionBuilder().setLabel('Hard').setValue('hard').setDescription('Aggressive & Calculating')
                        );

                    const r = await i.reply({
                        content: 'Select Bot Difficulty:',
                        components: [new ActionRowBuilder().addComponents(select)],
                        ephemeral: true,
                        fetchReply: true
                    });

                    try {
                        const sel = await r.awaitMessageComponent({
                            componentType: ComponentType.StringSelect,
                            time: 30000
                        });

                        const difficulty = sel.values[0];
                        const botId = `bot-${Date.now()}`;
                        const botName = `PokerBot (${difficulty})`;

                        g.players.set(botId, {
                            id: botId,
                            username: botName,
                            balance: buyIn * 10,
                            cards: [],
                            chips: 0,
                            isBot: true,
                            ai: new PokerAI(difficulty)
                        });

                        await sel.update({ content: `✅ Added **${botName}**!`, components: [] });
                    } catch (e) {
                        await i.deleteReply().catch(() => { });
                    }

                }
                else if (i.customId === 'poker_start') {
                    if (i.user.id !== g.hostId) return i.reply({ content: 'Only the host can start.', ephemeral: true });
                    if (g.players.size < 2) return i.reply({ content: 'Need at least 2 players!', ephemeral: true });


                    activeGames.delete(channelId);

                    await i.update({
                        content: '🎲 **Setting up the table...**',
                        components: [],
                        embeds: []
                    });

                    const pokerGame = new PokerGame(interaction, hostId, buyIn, smallBlind, bigBlind, g.players, () => {
                        if (activeGames.has(channelId)) activeGames.delete(channelId);
                    });

                    pokerGame.start();
                    collector.stop();
                    return;
                }


                if (activeGames.has(channelId)) {
                    let pList = '';
                    let count = 1;
                    for (const pid of g.players.keys()) {
                        const p = g.players.get(pid);
                        pList += `${count++}. ${p.isBot ? '🤖 ' : ''}${p.id.startsWith('bot-') ? p.username : `<@${p.id}>`}\n`;
                    }
                    embed.setDescription(`**Host:** <@${g.hostId}>\n**Buy-in:** ${buyIn} 🪙\n**Blinds:** ${smallBlind}/${bigBlind}\n\n**Players:**\n${pList}`);
                    await msg.edit({ embeds: [embed] });
                }
            });

            collector.on('end', () => {
                if (activeGames.has(channelId) && activeGames.get(channelId).state === 'LOBBY') {
                    activeGames.delete(channelId);
                    msg.edit({ content: '⏰ Lobby timed out.', components: [] }).catch(() => { });
                }
            });
        }
    }
};
