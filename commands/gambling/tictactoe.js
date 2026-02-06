const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } = require('discord.js');
const { query, withTransaction, logTransaction } = require('../../database');
const CONSTANTS = require('../../config/constants');
const { checkRateLimit } = require('../../src/utils/rateLimiter');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tictactoe')
        .setDescription('Challenge another user to a Tic-Tac-Toe duel for coins.')
        .addUserOption(option =>
            option.setName('opponent')
                .setDescription('The user to challenge')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount of coins to bet')
                .setRequired(true)
                .setMinValue(CONSTANTS.MIN_BET_AMOUNT)),

    async execute(interaction) {
        const rate = checkRateLimit(`tictactoe:${interaction.user.id}`, 5000, 1);
        if (!rate.ok) {
            const waitSec = Math.ceil(rate.retryAfterMs / 1000);
            return interaction.reply({ content: `Slow down. Try again in ${waitSec}s.`, ephemeral: true });
        }

        const opponent = interaction.options.getUser('opponent');
        const bet = interaction.options.getInteger('bet');
        const challenger = interaction.user;


        if (opponent.id === challenger.id) {
            return interaction.reply({ content: "You cannot play against yourself.", ephemeral: true });
        }
        if (opponent.bot) {
            return interaction.reply({ content: "You cannot play against a bot.", ephemeral: true });
        }


        const challengerData = db.prepare('SELECT balance FROM users WHERE id = ?').get(challenger.id);
        const opponentData = db.prepare('SELECT balance FROM users WHERE id = ?').get(opponent.id);

        if (!challengerData || challengerData.balance < bet) {
            return interaction.reply({ content: `You don't have enough coins! (Required: ${bet})`, ephemeral: true });
        }
        if (!opponentData || opponentData.balance < bet) {
            return interaction.reply({ content: `**${opponent.username}** doesn't have enough coins.`, ephemeral: true });
        }


        const challengeEmbed = new EmbedBuilder()
            .setTitle('⚔️ Tic-Tac-Toe Duel Challenge')
            .setDescription(`**${challenger.username}** has challenged **${opponent.username}** to a duel!\n\n💰 **Bet:** ${bet} coins\n🏆 **Pot:** ${bet * 2} coins`)
            .setColor(CONSTANTS.COLOR_INFO);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('accept_duel')
                    .setLabel('Accept Duel')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('decline_duel')
                    .setLabel('Decline')
                    .setStyle(ButtonStyle.Danger)
            );

        const response = await interaction.reply({
            content: `<@${opponent.id}>`,
            embeds: [challengeEmbed],
            components: [row],
            fetchReply: true
        });


        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000
        });

        collector.on('collect', async i => {
            if (i.user.id !== opponent.id && i.user.id !== challenger.id) {
                return i.reply({ content: "This is not your duel!", ephemeral: true });
            }

            if (i.customId === 'decline_duel') {
                if (i.user.id === challenger.id) {
                    await i.update({ content: "Duel cancelled by challenger.", components: [], embeds: [] });
                } else {
                    await i.update({ content: `**${opponent.username}** declined the duel.`, components: [], embeds: [] });
                }
                collector.stop('cancelled');
                return;
            }

            if (i.customId === 'accept_duel') {
                if (i.user.id !== opponent.id) {
                    return i.reply({ content: "Only the challenged user can accept.", ephemeral: true });
                }


                try {
                    await withTransaction(async (client) => {
                        const deductChallenger = await client.query(
                            'UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING id',
                            [bet, challenger.id]
                        );
                        if (deductChallenger.rowCount === 0) throw new Error('CHALLENGER_BROKE');

                        const deductOpponent = await client.query(
                            'UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING id',
                            [bet, opponent.id]
                        );
                        if (deductOpponent.rowCount === 0) throw new Error('OPPONENT_BROKE');
                    });


                    collector.stop('accepted');
                    await startGame(i, challenger, opponent, bet);

                } catch (error) {
                    if (error.message === 'CHALLENGER_BROKE') {
                        await i.update({ content: `Duel failed: **${challenger.username}** no longer has enough coins.`, components: [], embeds: [] });
                    } else if (error.message === 'OPPONENT_BROKE') {
                        await i.update({ content: `Duel failed: **${opponent.username}** no longer has enough coins.`, components: [], embeds: [] });
                    } else {
                        console.error("Duel transaction error:", error);
                        await i.update({ content: "An error occurred starting the duel.", components: [], embeds: [] });
                    }
                    collector.stop('error');
                }
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                interaction.editReply({ content: "Duel challenge timed out.", components: [], embeds: [] }).catch(() => { });
            }
        });
    }
};



async function startGame(interaction, player1, player2, bet) {

    const p1Starts = Math.random() < 0.5;
    let turn = p1Starts ? player1.id : player2.id;
    let turnUser = p1Starts ? player1 : player2;

    const board = [0, 0, 0, 0, 0, 0, 0, 0, 0];


    const getComponents = (disabled = false) => {
        const rows = [];
        for (let i = 0; i < 3; i++) {
            const row = new ActionRowBuilder();
            for (let j = 0; j < 3; j++) {
                const index = i * 3 + j;
                const cell = board[index];
                let label = '-';
                let style = ButtonStyle.Secondary;

                if (cell === 1) { label = 'X'; style = ButtonStyle.Primary; }
                if (cell === 2) { label = 'O'; style = ButtonStyle.Danger; }

                const btn = new ButtonBuilder()
                    .setCustomId(`ttt_${index}`)
                    .setLabel(label)
                    .setStyle(style)
                    .setDisabled(disabled || cell !== 0);

                row.addComponents(btn);
            }
            rows.push(row);
        }
        return rows;
    };

    const getEmbed = (status = 'playing', winner = null) => {
        const embed = new EmbedBuilder()
            .setTitle('❌ Tic-Tac-Toe Duel ⭕')
            .setDescription(`💰 **Pot:** ${bet * 2}\n\n**${player1.username}** (X) vs **${player2.username}** (O)`)
            .setColor(CONSTANTS.COLOR_INFO);

        if (status === 'playing') {
            embed.addFields({ name: 'Turn', value: `<@${turn}>'s Turn (${turn === player1.id ? 'X' : 'O'})` });
        } else if (status === 'winner') {
            embed.setColor(CONSTANTS.COLOR_SUCCESS);
            embed.addFields({ name: 'Result', value: `🏆 **${winner.username}** WINS **${bet * 2}** coins!` });
        } else if (status === 'draw') {
            embed.setColor(CONSTANTS.COLOR_WARNING);
            embed.addFields({ name: 'Result', value: `🤝 It's a draw! Money refunded.` });
        }
        return embed;
    };


    const message = await interaction.update({
        content: `Duel started!`,
        embeds: [getEmbed()],
        components: getComponents(),
        fetchReply: true
    });

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000
    });

    collector.on('collect', async i => {

        if (i.user.id !== turn) {
            return i.reply({ content: "It's not your turn!", ephemeral: true });
        }

        const index = parseInt(i.customId.split('_')[1]);
        if (board[index] !== 0) return;


        board[index] = (turn === player1.id) ? 1 : 2;


        const winner = checkWin(board);
        if (winner !== 0) {
            collector.stop('game_over');
            const winnerUser = (winner === 1) ? player1 : player2;


            try {
                await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [bet * 2, winnerUser.id]);
                await logTransaction(null, winnerUser.id, bet, 'tictactoe_win');
            } catch (e) {
                console.error("Payout error:", e);
                return i.reply({ content: "Error processing payout. Contact admin.", ephemeral: true });
            }

            return i.update({
                embeds: [getEmbed('winner', winnerUser)],
                components: getComponents(true)
            });
        }


        if (!board.includes(0)) {
            collector.stop('game_over');


            try {
                await withTransaction(async (client) => {
                    await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [bet, player1.id]);
                    await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [bet, player2.id]);
                });
            } catch (e) {
                console.error("Refund error:", e);
            }

            return i.update({
                embeds: [getEmbed('draw')],
                components: getComponents(true)
            });
        }


        turn = (turn === player1.id) ? player2.id : player1.id;
        turnUser = (turn === player1.id) ? player1 : player2;

        await i.update({
            embeds: [getEmbed()],
            components: getComponents()
        });


        collector.resetTimer();
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {

            const winner = (turn === player1.id) ? player2 : player1;
            const loser = (turn === player1.id) ? player1 : player2;


            try {
                await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [bet * 2, winner.id]);
                await logTransaction(null, winner.id, bet, 'tictactoe_timeout_win');
            } catch (e) { console.error("Timeout payout error:", e); }

            message.edit({
                content: `⏳ **${loser.username}** ran out of time!`,
                embeds: [getEmbed('winner', winner)],
                components: getComponents(true)
            }).catch(() => { });
        }
    });
}

function checkWin(board) {
    const wins = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    for (const combo of wins) {
        if (board[combo[0]] !== 0 &&
            board[combo[0]] === board[combo[1]] &&
            board[combo[1]] === board[combo[2]]) {
            return board[combo[0]];
        }
    }
    return 0;
}
