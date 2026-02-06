const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const CONSTANTS = require('../../config/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crash-rules')
        .setDescription('Learn how to play the Crash gambling game!'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🚀 Crash Game - How to Play')
            .setDescription('**Crash** is a high-stakes multiplier game where you bet on a rocket that can crash at any moment!')
            .setColor(CONSTANTS.COLOR_INFO)
            .addFields(
                {
                    name: '📋 How It Works',
                    value: '• A rocket launches and its multiplier starts at **1.00x**\n' +
                        '• The multiplier increases rapidly over time\n' +
                        '• At a random point, the rocket **crashes** 💥\n' +
                        '• If you cash out before the crash, you win your bet × the multiplier\n' +
                        '• If the rocket crashes before you cash out, you **lose** your bet',
                    inline: false
                },
                {
                    name: '🎮 Commands',
                    value: '`/crash bet <amount>` - Place a bet on the current round\n' +
                        '`/crash cashout` - Cash out your bet at the current multiplier\n' +
                        '`/crash start` - Start a new round (auto-starts when you bet)',
                    inline: false
                },
                {
                    name: '💡 How to Play',
                    value: '1️⃣ Use `/crash bet <amount>` to place your bet (minimum $10)\n' +
                        '2️⃣ Watch the multiplier climb 📈\n' +
                        '3️⃣ Use `/crash cashout` to claim your winnings at any time\n' +
                        '4️⃣ Cash out before the crash to win! 💰',
                    inline: false
                },
                {
                    name: '⚡ Strategy Tips',
                    value: '• **Low Risk**: Cash out at 1.5x - 2.0x for consistent small wins\n' +
                        '• **Medium Risk**: Wait for 3.0x - 5.0x for bigger payouts\n' +
                        '• **High Risk**: Chase 10x+ multipliers (very rare!)\n' +
                        '• The rocket can crash at ANY multiplier, even below 1.5x!',
                    inline: false
                },
                {
                    name: '🏠 House Edge',
                    value: 'The game has a **1% house edge**, meaning the expected return is 99% of your bet over time.',
                    inline: false
                },
                {
                    name: '⚠️ Important Notes',
                    value: '• You can only have **one bet** per round\n' +
                        '• Once you cash out, you **cannot** re-enter the same round\n' +
                        '• If you have overdue loans, you cannot place bets\n' +
                        '• The crash point is randomly generated (provably fair)',
                    inline: false
                },
                {
                    name: '🎲 Example',
                    value: '**Scenario**: You bet $100\n' +
                        '• Multiplier reaches **2.50x** 🚀\n' +
                        '• You cash out → Win **$250** (profit: $150)\n' +
                        '• If you waited and it crashed at 2.75x → Lose **$100**',
                    inline: false
                }
            )
            .setFooter({ text: 'Remember: Gamble responsibly! The house always has an edge.' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
