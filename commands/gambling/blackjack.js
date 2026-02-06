const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { query, withTransaction, logTransaction, hasOverdueLoan } = require('../../database');
const CONSTANTS = require('../../config/constants');
const { checkRateLimit } = require('../../src/utils/rateLimiter');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Blackjack commands.')
        .addSubcommand(subcommand =>
            subcommand.setName('play')
                .setDescription('Play a game of Blackjack.')
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to bet')
                        .setMinValue(CONSTANTS.MIN_BET_AMOUNT)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('rules')
                .setDescription('Show blackjack rules in EN/FR.')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'rules') {
            const rulesEmbed = new EmbedBuilder()
                .setTitle('🃏 Blackjack Rules / Règles du Blackjack')
                .setColor(CONSTANTS.COLOR_INFO)
                .addFields(
                    {
                        name: '🇬🇧 English',
                        value: '1. **Objective**: Get a hand value closer to 21 than the dealer without going over.\n' +
                            '2. **Values**: Number cards are face value, J/Q/K are 10, Ace is 1 or 11.\n' +
                            '3. **Actions**: **Hit** to take a card, **Stand** to keep your hand, **Double Down** to double your bet for exactly one more card.\n' +
                            '4. **Dealer**: Must hit until at least 17.\n' +
                            '5. **Payouts**: Win pays 1:1, Natural Blackjack (21 on first 2 cards) pays 3:2.'
                    },
                    {
                        name: '🇫🇷 Français',
                        value: '1. **Objectif** : Avoir une main plus proche de 21 que le croupier sans dépasser.\n' +
                            '2. **Valeurs** : Les chiffres valent leur valeur, J/Q/K valent 10, l\'As vaut 1 ou 11.\n' +
                            '3. **Actions** : **Hit** (Tirer), **Stand** (Rester), **Double Down** (Doubler la mise pour une seule carte de plus).\n' +
                            '4. **Croupier** : Doit tirer jusqu\'à avoir au moins 17.\n' +
                            '5. **Paiements** : Victoire standard 1:1, Blackjack naturel (21 dès le début) 3:2.'
                    }
                );

            return interaction.reply({ embeds: [rulesEmbed] });
        }

        if (subcommand === 'play') {
            const rate = checkRateLimit(`blackjack:${interaction.user.id}`, 5000, 1);
            if (!rate.ok) {
                const waitSec = Math.ceil(rate.retryAfterMs / 1000);
                return interaction.reply({ content: `Slow down. Try again in ${waitSec}s.`, ephemeral: true });
            }

            const amount = interaction.options.getInteger('amount');
            const userId = interaction.user.id;


            if (interaction.user.bot) {
                return interaction.reply({
                    content: "Bots don't play cards.",
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


            try {
                await withTransaction(async (client) => {
                    await client.query('INSERT INTO users (id, balance) VALUES ($1, 0) ON CONFLICT (id) DO NOTHING', [userId]);
                    await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, userId]);
                });
            } catch (error) {
                return interaction.editReply({ content: 'An error occurred while placing your bet.' });
            }

            const suits = ['♠', '♥', '♦', '♣'];
            const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

            let deck = [];
            for (const suit of suits) {
                for (const value of values) {
                    let weight = parseInt(value);
                    if (['J', 'Q', 'K'].includes(value)) weight = 10;
                    if (value === 'A') weight = 11;
                    deck.push({ suit, value, weight });
                }
            }

            for (let i = deck.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [deck[i], deck[j]] = [deck[j], deck[i]];
            }

            let playerHand = [deck.pop(), deck.pop()];
            let dealerHand = [deck.pop(), deck.pop()];

            function calculateScore(hand) {
                let score = 0;
                let aces = 0;
                for (const card of hand) {
                    score += card.weight;
                    if (card.value === 'A') aces++;
                }
                while (score > 21 && aces > 0) {
                    score -= 10;
                    aces--;
                }
                return score;
            }

            function formatHand(hand, hideSecond = false) {
                if (hideSecond) {
                    return `**[ ${hand[0].suit} ${hand[0].value} ]**  **[ ? ]**`;
                }
                return hand.map(c => `**[ ${c.suit} ${c.value} ]**`).join('  ');
            }

            let playerScore = calculateScore(playerHand);
            let dealerScore = calculateScore(dealerHand);
            let currentBet = amount;
            let isGameOver = false;
            let isProcessing = false;

            if (playerScore === 21) {
                isGameOver = true;

                if (dealerScore === 21) {
                    await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, userId]);
                    await logTransaction(null, userId, 0, 'blackjack_push');

                    const embed = new EmbedBuilder()
                        .setTitle('Blackjack - PUSH')
                        .setDescription(`Both had Blackjack!\n\n**Your Hand:** ${formatHand(playerHand)} (${playerScore})\n**Dealer Hand:** ${formatHand(dealerHand)} (${dealerScore})`)
                        .setColor(CONSTANTS.COLOR_WARNING);

                    return interaction.editReply({ embeds: [embed] });
                } else {
                    const winAmount = Math.floor(amount * 2.5);
                    await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [winAmount, userId]);
                    await logTransaction(null, userId, winAmount - amount, 'blackjack_win_natural');

                    const embed = new EmbedBuilder()
                        .setTitle('Blackjack - WIN!')
                        .setDescription(`**Blackjack!**\n\n**Your Hand:** ${formatHand(playerHand)} (${playerScore})\n**Dealer Hand:** ${formatHand(dealerHand)} (${dealerScore})`)
                        .setColor(CONSTANTS.COLOR_GOLD);

                    return interaction.editReply({ embeds: [embed] });
                }
            }


            const getRow = (disableDouble = false) => {
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('hit')
                            .setLabel('Hit')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('stand')
                            .setLabel('Stand')
                            .setStyle(ButtonStyle.Secondary)
                    );


                if (!disableDouble) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId('doubledown')
                            .setLabel('Double Down')
                            .setStyle(ButtonStyle.Primary)
                    );
                }
                return row;
            };

            const embed = new EmbedBuilder()
                .setTitle('Blackjack')
                .setDescription(`**Your Hand:** ${formatHand(playerHand)} (${playerScore})\n**Dealer Hand:** ${formatHand(dealerHand, true)}`)
                .setColor(CONSTANTS.COLOR_INFO)
                .setFooter({ text: `Bet: ${currentBet}` });

            const response = await interaction.editReply({
                embeds: [embed],
                components: [getRow(false)],
                fetchReply: true
            });

            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: CONSTANTS.GAME_TIMEOUT_MS
            });


            const endRound = async (reason, i = null) => {
                isGameOver = true;


                if (reason === 'bust') {

                    return;
                }


                while (dealerScore < 17) {
                    dealerHand.push(deck.pop());
                    dealerScore = calculateScore(dealerHand);
                }

                let win = false;
                let push = false;

                if (dealerScore > 21) {
                    win = true;
                } else if (playerScore > dealerScore) {
                    win = true;
                } else if (playerScore === dealerScore) {
                    push = true;
                }

                const endEmbed = new EmbedBuilder()
                    .setTitle(win ? 'Blackjack - WIN' : (push ? 'Blackjack - PUSH' : 'Blackjack - LOSE'))
                    .setColor(win ? CONSTANTS.COLOR_SUCCESS : (push ? CONSTANTS.COLOR_WARNING : CONSTANTS.COLOR_ERROR))
                    .setDescription(`Result: **${win ? 'You Won!' : (push ? 'Push' : 'Dealer Wins')}**\n\n` +
                        `**Your Hand:** ${formatHand(playerHand)} (${playerScore})\n` +
                        `**Dealer Hand:** ${formatHand(dealerHand)} (${dealerScore})`)
                    .setFooter({ text: `Final Bet: ${currentBet}` });

                if (win) {
                    await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [currentBet * 2, userId]);
                    await logTransaction(null, userId, currentBet, 'blackjack_win');
                } else if (push) {
                    await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [currentBet, userId]);
                    await logTransaction(null, userId, 0, 'blackjack_push');
                } else {
                    await logTransaction(userId, null, currentBet, 'blackjack_loss');
                }

                if (i) {
                    await i.update({ embeds: [endEmbed], components: [] });
                } else {

                    await interaction.editReply({ embeds: [endEmbed], components: [] });
                }
                collector.stop();
            };

            collector.on('collect', async i => {
                if (i.user.id !== userId) {
                    return i.reply({ content: "This isn't your game!", ephemeral: true });
                }


                if (isProcessing) {
                    return i.reply({ content: "Please wait for the current action to complete.", ephemeral: true });
                }
                isProcessing = true;

                if (i.customId === 'hit') {
                    playerHand.push(deck.pop());
                    playerScore = calculateScore(playerHand);

                    if (playerScore > 21) {
                        isGameOver = true;
                        await i.update({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('Blackjack - BUST')
                                    .setDescription(`**You Busted!**\n\n**Your Hand:** ${formatHand(playerHand)} (${playerScore})\n**Dealer Hand:** ${formatHand(dealerHand)} (${dealerScore})`)
                                    .setColor(CONSTANTS.COLOR_ERROR)
                                    .setFooter({ text: `Bet: ${currentBet}` })
                            ],
                            components: []
                        });
                        await logTransaction(userId, null, currentBet, 'blackjack_loss_bust');
                        collector.stop();
                        isProcessing = false;
                    } else {

                        await i.update({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('Blackjack')
                                    .setDescription(`**Your Hand:** ${formatHand(playerHand)} (${playerScore})\n**Dealer Hand:** ${formatHand(dealerHand, true)}`)
                                    .setColor(CONSTANTS.COLOR_INFO)
                                    .setFooter({ text: `Bet: ${currentBet}` })
                            ],
                            components: [getRow(true)]
                        });
                        isProcessing = false;
                    }
                } else if (i.customId === 'stand') {
                    await endRound('stand', i);
                    isProcessing = false;
                } else if (i.customId === 'doubledown') {

                    try {
                        await withTransaction(async (client) => {
                            const res = await client.query('SELECT balance FROM users WHERE id = $1', [userId]);
                            const user = res.rows[0];
                            if (!user || parseInt(user.balance) < amount) {
                                throw new Error(`INSUFFICIENT_FUNDS:${user ? parseInt(user.balance) : 0}`);
                            }

                            await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, userId]);
                            currentBet += amount;
                        });
                    } catch (e) {
                        isProcessing = false;
                        if (e.message && e.message.startsWith('INSUFFICIENT_FUNDS:')) {
                            return i.reply({ content: `You need ${amount} more coins to Double Down!`, ephemeral: true });
                        }
                        return i.reply({ content: "Error processing Double Down transaction.", ephemeral: true });
                    }


                    playerHand.push(deck.pop());
                    playerScore = calculateScore(playerHand);

                    if (playerScore > 21) {
                        isGameOver = true;
                        await i.update({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('Blackjack - BUST (Double Down)')
                                    .setDescription(`**You Busted!**\n\n**Your Hand:** ${formatHand(playerHand)} (${playerScore})\n**Dealer Hand:** ${formatHand(dealerHand)} (${dealerScore})`)
                                    .setColor(CONSTANTS.COLOR_ERROR)
                                    .setFooter({ text: `Final Bet: ${currentBet}` })
                            ],
                            components: []
                        });
                        await logTransaction(userId, null, currentBet, 'blackjack_loss_bust_double');
                        collector.stop();
                        isProcessing = false;
                    } else {

                        await endRound('stand', i);
                        isProcessing = false;
                    }
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time' && !isGameOver) {

                    try {



                        await endRound('timeout', null);
                    } catch (e) {
                        console.error("Error handling blackjack timeout:", e);
                    }
                }
            });
        }
    }
};
