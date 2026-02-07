const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { query, withTransaction, ensureUser } = require('../../database');
const CONSTANTS = require('../../config/constants');
const { drawStockGraph } = require('../gambling/canvasRenderer');
const { BANK_AI_ID } = require('../../src/ai/bankAI');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stocks')
        .setDescription('Stock market trading')
        .addSubcommand(sub =>
            sub.setName('list').setDescription('View all available stocks and Market Index')
        )
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View stock price history graph')
                .addStringOption(opt => opt.setName('ticker').setDescription('Stock ticker').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('buy')
                .setDescription('Buy shares from the Bank')
                .addStringOption(opt => opt.setName('ticker').setDescription('Stock ticker').setRequired(true))
                .addIntegerOption(opt => opt.setName('shares').setDescription('Number of shares').setRequired(true).setMinValue(1))
        )
        .addSubcommand(sub =>
            sub.setName('sell')
                .setDescription('Sell shares to the Bank')
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
            const indexRes = await query('SELECT value FROM market_index_history ORDER BY timestamp DESC LIMIT 2');
            const currentIndex = indexRes.rows[0]?.value || 0;
            const prevIndex = indexRes.rows[1]?.value || currentIndex;
            const indexChange = currentIndex - prevIndex;
            const indexPercent = prevIndex > 0 ? ((indexChange / prevIndex) * 100).toFixed(2) : 0;
            const indexArrow = indexChange >= 0 ? '🟢' : '🔴';

            const embed = new EmbedBuilder()
                .setTitle('📈 Spade Stock Market')
                .setColor(CONSTANTS.COLOR_INFO)
                .setDescription(`**Spade Index:** ${indexArrow} **${currentIndex.toLocaleString()}** (${indexChange >= 0 ? '+' : ''}${indexPercent}%)`)
                .setTimestamp();

            for (const stock of stocks.rows) {
                const change = stock.price - stock.prev_price;
                const changePercent = stock.prev_price > 0 ? ((change / stock.prev_price) * 100).toFixed(2) : 0;
                const arrow = change >= 0 ? '🟢' : '🔴';
                const sign = change >= 0 ? '+' : '';
                embed.addFields({
                    name: `${arrow} ${stock.ticker} - ${stock.name}`,
                    value: `💰 **$${parseInt(stock.price).toLocaleString()}** (${sign}${changePercent}%)\nVolatility: ${(stock.volatility * 100).toFixed(0)}%`,
                    inline: true
                });
            }
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'view') {
            const ticker = interaction.options.getString('ticker').toUpperCase();
            const stockRes = await query('SELECT * FROM stocks WHERE ticker = $1', [ticker]);
            if (stockRes.rows.length === 0) return interaction.reply({ content: `❌ Stock ${ticker} not found.`, ephemeral: true });

            const stock = stockRes.rows[0];
            const historyRes = await query(`
                SELECT price, timestamp 
                FROM stock_history 
                WHERE stock_id = $1 
                AND timestamp > NOW() - INTERVAL '1 hour'
                ORDER BY timestamp ASC
            `, [stock.id]);

            const buffer = await drawStockGraph(stock.ticker, historyRes.rows, parseInt(stock.price));
            const attachment = new AttachmentBuilder(buffer, { name: 'graph.png' });

            const embed = new EmbedBuilder()
                .setTitle(`📊 ${stock.name} (${stock.ticker})`)
                .setColor(CONSTANTS.COLOR_INFO)
                .setImage('attachment://graph.png')
                .addFields(
                    { name: 'Current Price', value: `$${parseInt(stock.price).toLocaleString()}`, inline: true },
                    { name: 'Volatility', value: `${(stock.volatility * 100).toFixed(0)}%`, inline: true }
                );

            return interaction.reply({ embeds: [embed], files: [attachment] });
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
                const currentValue = h.shares * parseInt(h.price);
                const costBasis = h.shares * parseInt(h.avg_price);
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

        const ticker = interaction.options.getString('ticker').toUpperCase();
        const shares = interaction.options.getInteger('shares');
        const stockRes = await query('SELECT * FROM stocks WHERE ticker = $1', [ticker]);

        if (stockRes.rows.length === 0) {
            return interaction.reply({ content: `❌ Stock \`${ticker}\` not found.`, ephemeral: true });
        }

        const stock = stockRes.rows[0];
        const stockPrice = parseInt(stock.price);
        const totalCost = stockPrice * shares;

        if (sub === 'buy') {
            try {
                await withTransaction(async (client) => {
                    // Check Bank Supply
                    const bankStockRes = await client.query('SELECT shares FROM user_stocks WHERE user_id = $1 AND stock_id = $2', [BANK_AI_ID, stock.id]);
                    const bankShares = bankStockRes.rows[0]?.shares || 0;

                    if (bankShares < shares) {
                        throw new Error(`LOW_LIQUIDITY: Only ${bankShares} shares available.`);
                    }

                    // Deduct User Balance
                    const result = await client.query(
                        'UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1',
                        [totalCost, userId]
                    );
                    if (result.rowCount === 0) throw new Error('INSUFFICIENT_FUNDS');

                    // Transfer Shares: Bank -> User
                    await client.query('UPDATE user_stocks SET shares = shares - $1 WHERE user_id = $2 AND stock_id = $3', [shares, BANK_AI_ID, stock.id]);

                    await client.query(`
                        INSERT INTO user_stocks (user_id, stock_id, shares, avg_price)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (user_id, stock_id) DO UPDATE SET
                            avg_price = (user_stocks.avg_price * user_stocks.shares + $4 * $3) / (user_stocks.shares + $3),
                            shares = user_stocks.shares + $3
                    `, [userId, stock.id, shares, stockPrice]);

                    // Give money to Bank
                    await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [totalCost, BANK_AI_ID]);
                });

                const embed = new EmbedBuilder()
                    .setTitle('📈 Stock Purchased')
                    .setColor(CONSTANTS.COLOR_SUCCESS)
                    .addFields(
                        { name: 'Stock', value: `${stock.ticker}`, inline: true },
                        { name: 'Shares', value: `${shares}`, inline: true },
                        { name: 'Cost', value: `$${totalCost.toLocaleString()}`, inline: true }
                    );
                return interaction.reply({ embeds: [embed] });

            } catch (error) {
                if (error.message.startsWith('LOW_LIQUIDITY')) {
                    return interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
                }
                if (error.message === 'INSUFFICIENT_FUNDS') {
                    return interaction.reply({ content: `❌ Insufficient funds. You need **$${totalCost.toLocaleString()}**.`, ephemeral: true });
                }
                throw error;
            }
        }

        if (sub === 'sell') {
            const holdingRes = await query('SELECT * FROM user_stocks WHERE user_id = $1 AND stock_id = $2', [userId, stock.id]);
            const holding = holdingRes.rows[0];

            if (!holding || holding.shares < shares) {
                return interaction.reply({ content: `❌ You check your portfolio... you don't have ${shares} shares of ${ticker}.`, ephemeral: true });
            }

            try {
                await withTransaction(async (client) => {
                    // Check Bank Funds (should be infinite practically, but good to check)
                    const bankBalRes = await client.query('SELECT balance FROM users WHERE id = $1', [BANK_AI_ID]);
                    if (bankBalRes.rows[0].balance < totalCost) {
                        // Mint money for bank if needed to ensure liquidity
                        await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [totalCost, BANK_AI_ID]);
                    }

                    // Transfer Money: Bank -> User
                    await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [totalCost, BANK_AI_ID]);
                    await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [totalCost, userId]);

                    // Transfer Shares: User -> Bank
                    if (holding.shares === shares) {
                        await client.query('DELETE FROM user_stocks WHERE user_id = $1 AND stock_id = $2', [userId, stock.id]);
                    } else {
                        await client.query('UPDATE user_stocks SET shares = shares - $1 WHERE user_id = $2 AND stock_id = $3', [shares, userId, stock.id]);
                    }

                    await client.query(`
                        INSERT INTO user_stocks (user_id, stock_id, shares, avg_price)
                        VALUES ($1, $2, $3, 0)
                        ON CONFLICT (user_id, stock_id) DO UPDATE SET shares = user_stocks.shares + $3
                    `, [BANK_AI_ID, stock.id, shares]);
                });

                const pnl = (stockPrice - holding.avg_price) * shares;
                const pnlSign = pnl >= 0 ? '+' : '';

                const embed = new EmbedBuilder()
                    .setTitle('📉 Stock Sold')
                    .setColor(pnl >= 0 ? CONSTANTS.COLOR_SUCCESS : CONSTANTS.COLOR_ERROR)
                    .addFields(
                        { name: 'Stock', value: `${stock.ticker}`, inline: true },
                        { name: 'Revenue', value: `$${totalCost.toLocaleString()}`, inline: true },
                        { name: 'Profit/Loss', value: `${pnlSign}$${pnl.toLocaleString()}`, inline: true }
                    );
                return interaction.reply({ embeds: [embed] });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: '❌ Transaction failed.', ephemeral: true });
            }
        }
    }
};
