const { query, withTransaction } = require('../../database');

const UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const NEWS_CHANCE = 0.3; // 30% chance of news per update
const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

const NEWS_TEMPLATES = [
    { text: "{company} reports record quarterly earnings!", impact: 0.15 },
    { text: "{company} faces lawsuit over patent infringement.", impact: -0.10 },
    { text: "{company} announces revolutionary new product.", impact: 0.20 },
    { text: "{company} CEO steps down amid scandal.", impact: -0.15 },
    { text: "{company} expands into new markets.", impact: 0.08 },
    { text: "{company} hit by supply chain improved.", impact: 0.05 },
    { text: "{company} recalls major product line.", impact: -0.12 },
    { text: "Analysts upgrade {company} to 'Buy'.", impact: 0.07 },
    { text: "Market uncertainty hits {company} shares.", impact: -0.05 },
    { text: "{company} merges with smaller competitor.", impact: 0.10 }
];

async function generateNews(client, stocks) {
    if (Math.random() > NEWS_CHANCE) return;

    const stock = stocks[Math.floor(Math.random() * stocks.length)];
    const template = NEWS_TEMPLATES[Math.floor(Math.random() * NEWS_TEMPLATES.length)];
    const headline = template.text.replace('{company}', stock.name);
    // Randomize impact slightly
    const actualImpact = template.impact * (0.8 + Math.random() * 0.4);

    await client.query(`
        INSERT INTO stock_news (stock_id, headline, impact_score)
        VALUES ($1, $2, $3)
    `, [stock.id, headline, actualImpact]);

    // Apply immediate impact to price
    const newPrice = Math.floor(parseInt(stock.price) * (1 + actualImpact));
    // We update the price in memory for the current turn, 
    // but the main loop updates the DB. We should let the main loop handle it?
    // Actually, let's just update the stock object reference so the main loop uses it.
    stock.newsImpact = actualImpact;

    console.log(`[Stock Market] NEWS: ${headline} (Impact: ${(actualImpact * 100).toFixed(1)}%)`);
}

async function updateStockPrices() {
    try {
        console.log('[Stock Market] Updating stock prices...');
        const stocksRes = await query('SELECT * FROM stocks');
        const stocks = stocksRes.rows;

        let totalMarketValue = 0;

        await withTransaction(async (client) => {
            // Generate News first
            await generateNews(client, stocks);

            for (const stock of stocks) {
                let volatility = stock.volatility || 0.05;
                let changePercent = (Math.random() * volatility * 2) - volatility;

                // Add news impact if any
                if (stock.newsImpact) {
                    changePercent += stock.newsImpact;
                    // Reset for next time (though we are iterating, so local var is fine)
                }

                // Global market trend (random walk)
                // varying between -2% and +2%
                const globalTrend = (Math.random() * 0.04) - 0.02;
                changePercent += globalTrend;

                // Calculate new price
                let newPrice = Math.floor(parseInt(stock.price) * (1 + changePercent));

                // Ensure price doesn't drop below $1
                if (newPrice < 1) newPrice = 1;

                // Update stock record
                await client.query(`
                    UPDATE stocks 
                    SET price = $1, prev_price = $2, last_update = NOW() 
                    WHERE id = $3
                `, [newPrice, stock.price, stock.id]);

                // Log history
                await client.query(`
                    INSERT INTO stock_history (stock_id, price)
                    VALUES ($1, $2)
                `, [stock.id, newPrice]);

                totalMarketValue += newPrice;
            }

            // Log Market Index (Spade Index)
            await client.query(`
                INSERT INTO market_index_history (value)
                VALUES ($1)
            `, [totalMarketValue]);

            // Prune old history
            const cutoff = new Date(Date.now() - HISTORY_RETENTION_MS);
            await client.query('DELETE FROM stock_history WHERE timestamp < $1', [cutoff]);
            await client.query('DELETE FROM market_index_history WHERE timestamp < $1', [cutoff]);
            // Prune old news
            await client.query('DELETE FROM stock_news WHERE timestamp < $1', [cutoff]);
        });

        console.log(`[Stock Market] Update complete. Spade Index: ${totalMarketValue}`);
    } catch (error) {
        console.error('[Stock Market] Failed to update prices:', error);
    }
}

function startMarketSimulation() {
    // Run immediately on startup
    updateStockPrices();

    // Schedule periodic updates
    setInterval(updateStockPrices, UPDATE_INTERVAL_MS);
    console.log('[Stock Market] Simulation started (updates every 5m)');
}

module.exports = { startMarketSimulation };
