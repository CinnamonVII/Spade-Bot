const { query, withTransaction } = require('../../database');

const UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

async function updateStockPrices() {
    try {
        console.log('[Stock Market] Updating stock prices...');
        const stocksRes = await query('SELECT * FROM stocks');
        const stocks = stocksRes.rows;

        let totalMarketValue = 0;

        await withTransaction(async (client) => {
            for (const stock of stocks) {
                const volatility = stock.volatility || 0.05;
                // Random fluctuation between -volatility and +volatility
                const changePercent = (Math.random() * volatility * 2) - volatility;

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
