const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query, withTransaction, ensureUser } = require('../../database');
const CONSTANTS = require('../../config/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stocks')
        .setDescription('Stock market trading')
        .addSubcommand(sub =>
            sub.setName('list').setDescription('View all available stocks')
        )
        .addSubcommand(sub =>
            sub.setName('buy')
                .setDescription('Buy shares of a stock')
                .addStringOption(opt => opt.setName('ticker').setDescription('Stock ticker (e.g., SPDE)').setRequired(true))
                .addIntegerOption(opt => opt.setName('shares').setDescription('Number of shares').setRequired(true).setMinValue(1))
        )
        .addSubcommand(sub =>
            sub.setName('sell')
                .setDescription('Sell shares of a stock')
                .addStringOption(opt => opt.setName('ticker').setDescription('Stock ticker').setRequired(true))
                .addIntegerOption(opt => opt.setName('shares').setDescription('Number of shares').setRequired(true).setMinValue(1))
        )
        .addSubcommand(sub =>
            sub.setName('portfolio').setDescription('View your stock portfolio')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        await ensureUser(userId);

        if (sub === 'list') {
            const stocks = await query('SELECT * FROM stocks ORDER BY ticker');

            const embed = new EmbedBuilder()
                .setTitle('📈 Stock Market')
                .setColor(CONSTANTS.COLOR_INFO)
                .setDescription('Buy and sell virtual stocks!')
                .setTimestamp();

            for (const stock of stocks.rows) {
                const change = stock.price - stock.prev_price;
                const changePercent = stock.prev_price > 0 ? ((change / stock.prev_price) * 100).toFixed(2) : 0;
                const arrow = change >= 0 ? '🟢' : '🔴';
                const sign = change >= 0 ? '+' : '';

                embed.addFields({
                    name: `${arrow} ${stock.ticker} - ${stock.name}`,
                    value: `💰 **$${stock.price.toLocaleString()}** (${sign}${changePercent}%)`,
                    inline: true
                });
            }

            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'portfolio') {
            const holdings = await query(`
                SELECT us.*, s.ticker, s.name, s.price 
                FROM user_stocks us 
                JOIN stocks s ON us.stock_id = s.id 
                WHERE us.user_id = $1 AND us.shares > 0
            `, [userId]);

            if (holdings.rows.length === 0) {
                return interaction.reply({ content: '📊 You don\'t own any stocks. Use `/stocks buy` to start investing!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle(`📊 ${interaction.user.username}'s Portfolio`)
                .setColor(CONSTANTS.COLOR_INFO)
                .setTimestamp();

            let totalValue = 0;
            let totalCost = 0;

            for (const h of holdings.rows) {
                const currentValue = h.shares * h.price;
                const costBasis = h.shares * h.avg_price;
                const pnl = currentValue - costBasis;
                const pnlPercent = costBasis > 0 ? ((pnl / costBasis) * 100).toFixed(2) : 0;
                const pnlSign = pnl >= 0 ? '+' : '';

                totalValue += currentValue;
                totalCost += costBasis;

                embed.addFields({
                    name: `${h.ticker} - ${h.shares} shares`,
                    value: `Value: **$${currentValue.toLocaleString()}**\nP/L: ${pnlSign}$${pnl.toLocaleString()} (${pnlSign}${pnlPercent}%)`,
                    inline: true
                });
            }

            const totalPnl = totalValue - totalCost;
            const totalPnlPercent = totalCost > 0 ? ((totalPnl / totalCost) * 100).toFixed(2) : 0;
            const sign = totalPnl >= 0 ? '+' : '';

            embed.setFooter({ text: `Total: $${totalValue.toLocaleString()} | P/L: ${sign}$${totalPnl.toLocaleString()} (${sign}${totalPnlPercent}%)` });

            return interaction.reply({ embeds: [embed] });
        }

        // Buy/Sell
        const ticker = interaction.options.getString('ticker').toUpperCase();
        const shares = interaction.options.getInteger('shares');

        const stockRes = await query('SELECT * FROM stocks WHERE ticker = $1', [ticker]);
        if (stockRes.rows.length === 0) {
            return interaction.reply({ content: `❌ Stock \`${ticker}\` not found. Use \`/stocks list\` to see available stocks.`, ephemeral: true });
        }
        const stock = stockRes.rows[0];
        const totalCost = stock.price * shares;

        if (sub === 'buy') {
            const userRes = await query('SELECT balance FROM users WHERE id = $1', [userId]);
            const balance = parseInt(userRes.rows[0]?.balance || 0);

            if (balance < totalCost) {
                return interaction.reply({ content: `❌ Insufficient funds. You need **$${totalCost.toLocaleString()}** but have **$${balance.toLocaleString()}**.`, ephemeral: true });
            }

            await withTransaction(async (client) => {
                // Deduct balance
                await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [totalCost, userId]);

                // Update holdings (upsert)
                await client.query(`
                    INSERT INTO user_stocks (user_id, stock_id, shares, avg_price)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (user_id, stock_id) DO UPDATE SET
                        avg_price = (user_stocks.avg_price * user_stocks.shares + $4 * $3) / (user_stocks.shares + $3),
                        shares = user_stocks.shares + $3
                `, [userId, stock.id, shares, stock.price]);
            });

            const embed = new EmbedBuilder()
                .setTitle('📈 Stock Purchased!')
                .setColor(CONSTANTS.COLOR_SUCCESS)
                .addFields(
                    { name: 'Stock', value: `${stock.ticker} - ${stock.name}`, inline: true },
                    { name: 'Shares', value: shares.toString(), inline: true },
                    { name: 'Total Cost', value: `$${totalCost.toLocaleString()}`, inline: true }
                );

            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'sell') {
            const holdingRes = await query('SELECT * FROM user_stocks WHERE user_id = $1 AND stock_id = $2', [userId, stock.id]);
            const holding = holdingRes.rows[0];

            if (!holding || holding.shares < shares) {
                return interaction.reply({ content: `❌ You don't have ${shares} shares of ${ticker}. You own ${holding?.shares || 0}.`, ephemeral: true });
            }

            await withTransaction(async (client) => {
                // Add balance
                await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [totalCost, userId]);

                // Reduce holdings
                if (holding.shares === shares) {
                    await client.query('DELETE FROM user_stocks WHERE user_id = $1 AND stock_id = $2', [userId, stock.id]);
                } else {
                    await client.query('UPDATE user_stocks SET shares = shares - $1 WHERE user_id = $2 AND stock_id = $3', [shares, userId, stock.id]);
                }
            });

            const pnl = (stock.price - holding.avg_price) * shares;
            const pnlSign = pnl >= 0 ? '+' : '';

            const embed = new EmbedBuilder()
                .setTitle('📉 Stock Sold!')
                .setColor(pnl >= 0 ? CONSTANTS.COLOR_SUCCESS : CONSTANTS.COLOR_ERROR)
                .addFields(
                    { name: 'Stock', value: `${stock.ticker} - ${stock.name}`, inline: true },
                    { name: 'Shares', value: shares.toString(), inline: true },
                    { name: 'Revenue', value: `$${totalCost.toLocaleString()}`, inline: true },
                    { name: 'Profit/Loss', value: `${pnlSign}$${pnl.toLocaleString()}`, inline: true }
                );

            return interaction.reply({ embeds: [embed] });
        }
    }
};
