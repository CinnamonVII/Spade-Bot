const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { query, withTransaction, ensureUser } = require('../../database');
const CONSTANTS = require('../../config/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('highlow')
        .setDescription('Bet if the next number will be higher or lower!')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to bet')
                .setRequired(true)
                .setMinValue(10)
        ),
    async execute(interaction) {
        const userId = interaction.user.id;
        const amount = interaction.options.getInteger('amount');

        await ensureUser(userId);
        const userRes = await query('SELECT balance FROM users WHERE id = $1', [userId]);
        const balance = parseInt(userRes.rows[0].balance);

        if (balance < amount) {
            return interaction.reply({ content: `❌ You don't have enough money! Your balance: **$${balance}**`, ephemeral: true });
        }

        const currentNumber = Math.floor(Math.random() * 100) + 1; // 1-100

        // Calculate odds
        // Higher: (100 - current) / 100
        // Lower: (current - 1) / 100 (excluding ties)
        // Tie: 1/100? No, let's say "Draws push" or just simple logic.
        // Actually, let's include ties in "Higher" or just reroll?
        // Standard: strictly higher or lower. Tie = Loss usually, or push.
        // Let's say Tie = Push (money back).

        // Multipliers (House edge 5%)
        const houseEdge = 0.95;

        // Probability of winning Higher (strictly higher)
        const higherCount = 100 - currentNumber;
        const probHigh = higherCount / 100; // Simplified (0 if 100)
        const multiHigh = probHigh > 0 ? (1 / probHigh) * houseEdge : 0;

        // Probability of winning Lower (strictly lower)
        const lowerCount = currentNumber - 1;
        const probLow = lowerCount / 100;
        const multiLow = probLow > 0 ? (1 / probLow) * houseEdge : 0;

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('lower')
                    .setLabel(`Lower (x${multiLow.toFixed(2)})`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(lowerCount === 0),
                new ButtonBuilder()
                    .setCustomId('higher')
                    .setLabel(`Higher (x${multiHigh.toFixed(2)})`)
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(higherCount === 0),
                new ButtonBuilder()
                    .setCustomId('cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        const embed = new EmbedBuilder()
            .setTitle('🎰 High-Low')
            .setColor(CONSTANTS.COLOR_INFO)
            .setDescription(`Current Number: **${currentNumber}**\n\nBet: **$${amount}**\nGuess if the next number (1-100) will be higher or lower!`)
            .setFooter({ text: 'Ties return your bet.' });

        const response = await interaction.reply({ embeds: [embed], components: [row] });

        const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'This is not your game!', ephemeral: true });
            }

            collector.stop(); // Stop collecting after choice

            if (i.customId === 'cancel') {
                await i.update({ content: 'Game cancelled.', embeds: [], components: [] });
                return;
            }

            const choice = i.customId;
            const nextNumber = Math.floor(Math.random() * 100) + 1;

            let result = 'loss';
            let winnings = 0;
            let multiplier = 0;

            if (nextNumber === currentNumber) {
                result = 'tie';
            } else if (choice === 'higher' && nextNumber > currentNumber) {
                result = 'win';
                multiplier = multiHigh;
            } else if (choice === 'lower' && nextNumber < currentNumber) {
                result = 'win';
                multiplier = multiLow;
            }

            try {
                await withTransaction(async (client) => {
                    // Re-check balance
                    const balCheck = await client.query('SELECT balance FROM users WHERE id = $1', [userId]);
                    if (parseInt(balCheck.rows[0].balance) < amount) {
                        throw new Error('Insufficient funds (balance changed)');
                    }

                    if (result === 'loss') {
                        await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, userId]);
                    } else if (result === 'win') {
                        winnings = Math.floor(amount * multiplier) - amount; // Net profit
                        // Update: Add profit (original amount stays, so we add profit)
                        // Wait, usually we deduct amount then add payout.
                        // Let's deduct amount first.
                        await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, userId]);
                        const payout = Math.floor(amount * multiplier);
                        await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [payout, userId]);
                        winnings = payout - amount;
                    }
                    // Tie: do nothing (keep money)
                });

                const resultEmbed = new EmbedBuilder()
                    .setTitle('🎰 High-Low Result')
                    .setDescription(`Previous: **${currentNumber}**\nNext: **${nextNumber}**\n\nYou chose: **${choice.toUpperCase()}**`)
                    .setTimestamp();

                if (result === 'win') {
                    resultEmbed.setColor(CONSTANTS.COLOR_SUCCESS);
                    resultEmbed.addFields({ name: 'Result', value: `🎉 You Won **$${winnings.toLocaleString()}**!` });
                } else if (result === 'loss') {
                    resultEmbed.setColor(CONSTANTS.COLOR_ERROR);
                    resultEmbed.addFields({ name: 'Result', value: `💀 You lost **$${amount.toLocaleString()}**.` });
                } else {
                    resultEmbed.setColor(CONSTANTS.COLOR_WARNING);
                    resultEmbed.addFields({ name: 'Result', value: '🤝 It\'s a tie! Bet returned.' });
                }

                await i.update({ embeds: [resultEmbed], components: [] });

            } catch (err) {
                console.error(err);
                await i.update({ content: '❌ An error occurred processing the transaction.', embeds: [], components: [] });
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({ content: '⏱️ Game timed out.', components: [] });
            }
        });
    }
};
