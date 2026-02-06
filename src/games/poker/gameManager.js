const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Deck } = require('./deck');
const CONSTANTS = require('../../../config/constants');
const { query, withTransaction, logTransaction } = require('../../../database');

class PokerGame {
    constructor(interaction, hostId, buyIn, smallBlind, bigBlind, players, onEndCallback) {
        this.originalInteraction = interaction;
        this.guild = interaction.guild;
        this.hostId = hostId;
        this.buyIn = buyIn;
        this.smallBlind = smallBlind;
        this.bigBlind = bigBlind;
        this.players = new Map(players);
        this.deck = new Deck();
        this.communityCards = [];
        this.pot = 0;
        this.currentBet = 0;
        this.dealerIndex = 0;
        this.activePlayerIndex = 0;
        this.gameChannel = null;
        this.state = 'PRE_GAME';
        this.onEndCallback = onEndCallback;


        this.lastAggressorIndex = -1;
        this.playersActedCount = 0;
    }

    async start() {
        try {

            const channelName = `poker-table-${Math.floor(Math.random() * 10000)}`;


            const overwrites = [
                {
                    id: this.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: this.originalInteraction.client.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
                }
            ];


            for (const [playerId, player] of this.players) {
                if (player.isBot) {
                    console.log(`[Poker] Skipping bot permission overwrite for ${playerId} (${player.username})`);
                    continue;
                }

                overwrites.push({
                    id: playerId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                });
            }

            console.log(`[Poker] Creating channel with ${overwrites.length} overwrites. IDs: ${overwrites.map(o => o.id).join(', ')}`);

            this.gameChannel = await this.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: this.originalInteraction.channel.parentId,
                permissionOverwrites: overwrites,
            });


            const peekCollector = this.gameChannel.createMessageComponentCollector({
                componentType: 2,
                filter: i => i.customId === 'poker_check_cards'
            });

            peekCollector.on('collect', async i => {
                const player = this.players.get(i.user.id);
                if (!player || player.cards.length === 0) {
                    return i.reply({ content: "You don't have any cards!", ephemeral: true });
                }

                const cardsStr = player.cards.map(c => c.toEmoji()).join(' ');
                await i.reply({
                    content: `Your Hand: ${cardsStr}`,
                    ephemeral: true
                });
            });


            try {
                await this.originalInteraction.followUp({
                    content: `🚀 **Poker Game Started!**\n\nJoin the private table here: ${this.gameChannel.toString()}`,
                    ephemeral: false
                });
            } catch (err) {

                const channel = this.originalInteraction.channel;
                if (channel) {
                    await channel.send(`🚀 **Poker Game Started!**\n\nJoin the private table here: ${this.gameChannel.toString()}`);
                }
            }


            const welcomeEmbed = new EmbedBuilder()
                .setTitle('🎰 Texas Hold\'em Poker')
                .setDescription(`**Game Started!**\n\n**Blinds:** ${this.smallBlind}/${this.bigBlind}\n**Buy-in:** ${this.buyIn}\n\nGame will begin shortly...`)
                .setColor(CONSTANTS.COLOR_INFO);

            await this.gameChannel.send({ embeds: [welcomeEmbed] });


            this.processBuyIns();


            await this.startRound();

        } catch (error) {
            console.error("Error starting poker game:", error);
            const channel = this.originalInteraction.channel;
            if (channel) {
                await channel.send(`❌ **Error Starting Game:** ${error.message}`).catch(() => { });
            }

            if (this.gameChannel) await this.gameChannel.delete().catch(() => { });
            if (this.onEndCallback) this.onEndCallback();
        }
    }

    async processBuyIns() {
        for (const [playerId, player] of this.players) {
            try {
                await withTransaction(async (client) => {
                    await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [this.buyIn, playerId]);
                });
                player.chips = this.buyIn;
                logTransaction(null, playerId, this.buyIn, 'poker_buyin');
            } catch (e) {
                this.gameChannel.send(`⚠️ Failed to process buy-in for <@${playerId}>. Removing from game.`);
                this.players.delete(playerId);
            }
        }
    }

    async startRound() {
        const playersWithChips = Array.from(this.players.values()).filter(p => p.chips > 0);
        if (playersWithChips.length < 2) {
            return this.endGame(playersWithChips[0]);
        }

        this.state = 'PRE_FLOP';
        this.deck.reset();
        this.communityCards = [];
        this.pot = 0;
        this.currentBet = this.bigBlind;

        for (const [playerId, player] of this.players) {
            if (player.chips > 0) {
                player.cards = this.deck.draw(2);
                player.folded = false;
                player.allIn = false;
                player.currentBet = 0;
                player.roundBet = 0;
            } else {
                player.folded = true;
            }
        }

        const playerIds = Array.from(this.players.keys());
        const smallBlindIndex = (this.dealerIndex + 1) % playerIds.length;
        const bigBlindIndex = (this.dealerIndex + 2) % playerIds.length;

        await this.postBlind(playerIds[smallBlindIndex], this.smallBlind, "Small Blind");
        await this.postBlind(playerIds[bigBlindIndex], this.bigBlind, "Big Blind");

        this.activePlayerIndex = (this.dealerIndex + 3) % playerIds.length;
        this.lastAggressorIndex = bigBlindIndex;
        this.playersActedCount = 0;

        await this.promptPlayerAction();
    }

    async postBlind(playerId, amount, name) {
        const player = this.players.get(playerId);
        const actualAmount = Math.min(player.chips, amount);

        player.chips -= actualAmount;
        player.currentBet = actualAmount;
        this.pot += actualAmount;

        if (player.chips === 0) player.allIn = true;

        await this.gameChannel.send(`🔹 **${name}**: <@${playerId}> posts ${actualAmount} 🪙${player.allIn ? ' (All-in)' : ''}`);
        return actualAmount;
    }

    async nextStage() {
        this.currentBet = 0;
        this.lastAggressorIndex = -1;
        this.playersActedCount = 0;

        for (const p of this.players.values()) {
            p.currentBet = 0;
        }

        if (this.state === 'PRE_FLOP') {
            this.state = 'FLOP';
            this.communityCards.push(...this.deck.draw(3));
        } else if (this.state === 'FLOP') {
            this.state = 'TURN';
            this.communityCards.push(this.deck.draw());
        } else if (this.state === 'TURN') {
            this.state = 'RIVER';
            this.communityCards.push(this.deck.draw());
        } else if (this.state === 'RIVER') {
            this.state = 'SHOWDOWN';
            return this.determineWinner();
        }

        const playerIds = Array.from(this.players.keys());
        this.activePlayerIndex = (this.dealerIndex + 1) % playerIds.length;
        this.ensureActivePlayer();

        await this.promptPlayerAction();
    }

    ensureActivePlayer() {
        const playerIds = Array.from(this.players.keys());
        const startIndex = this.activePlayerIndex;
        let p = this.players.get(playerIds[this.activePlayerIndex]);

        while (p.folded || p.allIn) {
            this.activePlayerIndex = (this.activePlayerIndex + 1) % playerIds.length;
            p = this.players.get(playerIds[this.activePlayerIndex]);
            if (this.activePlayerIndex === startIndex) break;
        }
    }

    async promptPlayerAction() {
        const activePlayers = Array.from(this.players.values()).filter(p => !p.folded);
        const playersCanAct = activePlayers.filter(p => !p.allIn);

        if (activePlayers.length === 1) {
            return this.endRound(activePlayers[0]);
        }

        if (playersCanAct.length === 0 || (playersCanAct.length === 1 && playersCanAct[0].currentBet === this.currentBet && this.playersActedCount >= activePlayers.length)) {
            await this.gameChannel.send(`⚡ Everyone is All-in (or matched). Dealing remaining cards...`);
            await new Promise(r => setTimeout(r, 2000));
            return this.runToShowdown();
        }

        await this.updateTable();

        const playerIds = Array.from(this.players.keys());
        const currentPlayerId = playerIds[this.activePlayerIndex];
        const player = this.players.get(currentPlayerId);

        const callAmount = this.currentBet - player.currentBet;

        const row = new ActionRowBuilder();

        row.addComponents(
            new ButtonBuilder()
                .setCustomId('poker_fold')
                .setLabel('Fold')
                .setStyle(ButtonStyle.Danger),
        );

        if (callAmount === 0) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('poker_check')
                    .setLabel('Check')
                    .setStyle(ButtonStyle.Secondary)
            );
        } else {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('poker_call')
                    .setLabel(callAmount >= player.chips ? 'All-in' : `Call (${callAmount})`)
                    .setStyle(ButtonStyle.Success)
            );
        }

        const minRaise = (this.state === 'PRE_FLOP' && this.currentBet === this.bigBlind) ? this.bigBlind * 2 : this.currentBet * 2;

        if (player.chips > callAmount) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('poker_raise')
                    .setLabel('Raise')
                    .setStyle(ButtonStyle.Primary)
            );
        }


        if (player.isBot && player.ai) {
            const processingMsg = await this.gameChannel.send(`🤖 <@${currentPlayerId}> is thinking...`);
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

            try {
                const decision = player.ai.decideMove({
                    pot: this.pot,
                    currentBet: this.currentBet,
                    communityCards: this.communityCards,
                    bigBlind: this.bigBlind,
                    players: Array.from(this.players.values())
                }, player);

                await processingMsg.delete().catch(() => { });

                if (decision.action === 'fold') {
                    await this.handleFold(player);
                } else if (decision.action === 'check') {
                    await this.handleCheck(player);
                } else if (decision.action === 'call') {
                    await this.handleCall(player, callAmount);
                } else if (decision.action === 'raise') {
                    const minRaiseAdd = Math.max(this.bigBlind, this.currentBet);
                    const totalBet = this.currentBet + minRaiseAdd + (decision.amount || 0);
                    const cost = totalBet - player.currentBet;

                    if (player.chips < cost) {
                        await this.handleCall(player, player.chips);
                    } else {
                        player.chips -= cost;
                        player.currentBet = totalBet;
                        this.pot += cost;
                        this.currentBet = totalBet;
                        if (player.chips === 0) player.allIn = true;
                        this.lastAggressorIndex = this.activePlayerIndex;

                        await this.gameChannel.send(`📈 <@${player.id}> raises to ${totalBet}!`);
                        this.advanceTurn();
                    }
                }
            } catch (e) {
                console.error("AI Error:", e);
                await processingMsg.delete().catch(() => { });
                await this.gameChannel.send(`⚠️ AI Error`);
                await this.handleFold(player);
            }
            return;
        }

        const msg = await this.gameChannel.send({
            content: `👉 <@${currentPlayerId}>, it's your turn!`,
            components: [row]
        });

        let confirmation;
        try {
            confirmation = await msg.awaitMessageComponent({
                filter: i => i.user.id === currentPlayerId,
                time: 60000
            });
        } catch (e) {

            await msg.delete().catch(() => { });
            await this.gameChannel.send(`⏰ <@${currentPlayerId}> ran out of time and folds.`);
            await this.handleFold(player);
            return;
        }

        try {



            if (confirmation.customId === 'poker_fold') {
                await msg.delete().catch(() => { });
                await this.handleFold(player);
            } else if (confirmation.customId === 'poker_check') {
                await confirmation.deferUpdate();
                await msg.delete().catch(() => { });
                await this.handleCheck(player);
            } else if (confirmation.customId === 'poker_call') {
                await confirmation.deferUpdate();
                await msg.delete().catch(() => { });
                await this.handleCall(player, callAmount);
            } else if (confirmation.customId === 'poker_raise') {

                const minRaiseAdd = Math.max(this.bigBlind, this.currentBet);
                const minTotalBet = this.currentBet + minRaiseAdd;
                const maxBet = player.chips + player.currentBet;

                const modal = new ModalBuilder()
                    .setCustomId('raise_modal')
                    .setTitle('Raise Bet');

                const amountInput = new TextInputBuilder()
                    .setCustomId('raise_amount')
                    .setLabel(`Amount (Min: ${minTotalBet})`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(`Max: ${maxBet}`)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(amountInput));

                await confirmation.showModal(modal);

                try {
                    const submission = await confirmation.awaitModalSubmit({
                        filter: i => i.customId === 'raise_modal' && i.user.id === currentPlayerId,
                        time: 30000
                    });

                    const inputVal = parseInt(submission.fields.getTextInputValue('raise_amount'));

                    if (isNaN(inputVal)) {
                        await submission.reply({ content: 'Invalid number.', ephemeral: true });






                        await this.gameChannel.send(`⚠️ <@${currentPlayerId}> entered invalid raise amount.`);
                        await this.handleFold(player);
                        return;
                    }

                    if (inputVal < minTotalBet) {
                        await submission.reply({ content: `Raise must be at least ${minTotalBet}.`, ephemeral: true });



                        await this.gameChannel.send(`⚠️ <@${currentPlayerId}> failed to meet min raise.`);
                        await this.handleFold(player);
                        return;
                    }

                    if (inputVal > maxBet) {
                        await submission.reply({ content: `You don't have enough chips.`, ephemeral: true });
                        await this.handleFold(player);
                        return;
                    }

                    await this.handleRaiseRequest(submission, player, callAmount, inputVal);

                } catch (e) {




                    await this.gameChannel.send(`⏰ <@${currentPlayerId}> failed to complete raise.`);
                    await this.handleFold(player);
                }
            }
        } catch (e) {
            console.error("Poker Game Logic Error:", e);
            await this.gameChannel.send(`⚠️ **Game Error:** ${e.message}`);
        }
    }

    async handleFold(player) {
        player.folded = true;
        await this.gameChannel.send(`❌ <@${player.id}> folds.`);
        this.advanceTurn();
    }

    async handleCheck(player) {
        await this.gameChannel.send(`👋 <@${player.id}> checks.`);
        this.advanceTurn();
    }

    async handleCall(player, amount) {
        const actualAmount = Math.min(amount, player.chips);

        player.chips -= actualAmount;
        player.currentBet += actualAmount;
        this.pot += actualAmount;

        if (player.chips === 0) player.allIn = true;

        await this.gameChannel.send(`💸 <@${player.id}> calls ${actualAmount}.`);
        this.advanceTurn();
    }

    async handleRaiseRequest(interaction, player, callAmount, customTotalBet = null) {
        const minRaiseAdd = Math.max(this.bigBlind, this.currentBet);
        let totalBet = this.currentBet + minRaiseAdd;

        if (customTotalBet) {
            totalBet = customTotalBet;
        }

        const cost = totalBet - player.currentBet;

        if (player.chips < cost) {
            return this.handleCall(player, player.chips);
        }

        player.chips -= cost;
        player.currentBet = totalBet;
        this.pot += cost;
        this.currentBet = totalBet;

        if (player.chips === 0) player.allIn = true;

        this.lastAggressorIndex = this.activePlayerIndex;







        try {
            await interaction.update({ content: `📈 <@${player.id}> raises to ${totalBet}!`, components: [] });
        } catch (e) {

            if (!interaction.replied) await interaction.reply({ content: `📈 <@${player.id}> raises to ${totalBet}!` });
            else await interaction.followUp({ content: `📈 <@${player.id}> raises to ${totalBet}!` });
        }

        this.advanceTurn();
    }

    advanceTurn() {
        const playerIds = Array.from(this.players.keys());

        this.activePlayerIndex = (this.activePlayerIndex + 1) % playerIds.length;
        this.ensureActivePlayer();

        const activePlayers = Array.from(this.players.values()).filter(p => !p.folded);
        const unMatched = activePlayers.filter(p => !p.allIn && p.currentBet < this.currentBet);

        if (unMatched.length === 0) {
            if (this.activePlayerIndex === this.lastAggressorIndex) {
                return this.nextStage();
            }
            if (this.state === 'PRE_FLOP' && this.playersActedCount >= activePlayers.length && this.currentBet === this.bigBlind) {
                return this.nextStage();
            }
        }

        this.playersActedCount++;

        if (this.currentBet === 0 && this.playersActedCount >= activePlayers.length) {
            return this.nextStage();
        }

        if (unMatched.length === 0 && this.currentBet > 0 && this.activePlayerIndex === this.lastAggressorIndex) {
            return this.nextStage();
        }

        this.promptPlayerAction();
    }

    async runToShowdown() {
        while (this.state !== 'SHOWDOWN') {
            await this.nextStage();
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    async determineWinner() {
        const { findBestHand, compareHands } = require('./evaluator');

        const activePlayers = Array.from(this.players.values()).filter(p => !p.folded);
        let results = [];

        let msg = `🏆 **Showdown!**\n\n**Community Board:** ` +
            this.communityCards.map(c => c.toEmoji()).join(' ') + `\n\n`;

        for (const p of activePlayers) {
            const pool = [...p.cards, ...this.communityCards];
            const hand = findBestHand(pool);
            results.push({ player: p, hand: hand });
            msg += `<@${p.id}>: ${p.cards.map(c => c.toEmoji()).join(' ')} -> **${hand.name}**\n`;
        }

        results.sort((a, b) => compareHands(b.hand, a.hand));

        const winners = [results[0]];
        for (let i = 1; i < results.length; i++) {
            if (compareHands(results[0].hand, results[i].hand) === 0) {
                winners.push(results[i]);
            } else {
                break;
            }
        }

        await this.gameChannel.send(msg);
        await new Promise(r => setTimeout(r, 2000));

        const splitPot = Math.floor(this.pot / winners.length);
        const winnerNames = winners.map(w => `<@${w.player.id}>`).join(', ');

        await this.gameChannel.send(`🎉 **Winner(s):** ${winnerNames} wins ${splitPot} 🪙!`);

        for (const w of winners) {
            w.player.chips += splitPot;
        }

        await this.handlePostGame();
    }

    async endRound(winner) {
        winner.chips += this.pot;
        await this.gameChannel.send(`🏆 <@${winner.id}> wins ${this.pot} 🪙 (Opponents folded)`);
        await this.handlePostGame();
    }

    async handlePostGame() {
        for (const [playerId, player] of this.players) {
            if (player.chips > 0) {
                try {
                    await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [player.chips, playerId]);
                    logTransaction(null, playerId, player.chips, 'poker_cashout');
                } catch (e) {
                    console.error(`Failed to payout ${playerId}:`, e);
                }
            }
        }

        await this.gameChannel.send(`🛑 Game Over. Chips have been cashed out. Table closing in 1 minute.`);
        setTimeout(() => {
            this.gameChannel.delete().catch(() => { });
            if (this.onEndCallback) this.onEndCallback();
        }, 60000);
    }

    async updateTable() {
        const tableEmbed = new EmbedBuilder()
            .setTitle('♠️ Poker Table')
            .setDescription(`**Pot:** ${this.pot} 🪙\n**Community Cards:** ${this.communityCards.length > 0 ? this.communityCards.map(c => c.toEmoji()).join(' ') : '[Hidden]'}\n\n**Current Phase:** ${this.state}\n**To Call:** ${this.currentBet}`)
            .setColor(CONSTANTS.COLOR_INFO);

        let playerList = '';
        const playerIds = Array.from(this.players.keys());

        playerIds.forEach((id, index) => {
            const p = this.players.get(id);
            const isDealer = index === this.dealerIndex;
            const isActive = index === this.activePlayerIndex;

            let status = '';
            if (p.folded) status = '❌ Folded';
            else if (p.allIn) status = '⚠️ All-in';
            else if (isActive) status = '👉 **Thinking...**';
            else status = 'Waiting';

            playerList += `${isDealer ? '🔘' : '👤'} <@${id}>: ${p.chips} 🪙 | Bet: ${p.currentBet} | ${status}\n`;
        });

        tableEmbed.addFields({ name: 'Players', value: playerList });

        const controls = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('poker_check_cards').setLabel('Peek Cards').setStyle(ButtonStyle.Secondary).setEmoji('👀')
        );

        await this.gameChannel.send({ embeds: [tableEmbed], components: [controls] });
    }
}

module.exports = PokerGame;
