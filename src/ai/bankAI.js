const { query, withTransaction } = require('../../database');
const BANK_AI_ID = 'BANK_SYSTEM_AI';
const LISTING_INTERVAL_MS = 10 * 60 * 1000; 
const MIN_LISTINGS = 3; 
let listingInterval = null;
async function initBankAI() {
    await query(`
        INSERT INTO users (id, balance, savings)
        VALUES ($1, 1000000000, 0)
        ON CONFLICT (id) DO NOTHING
    `, [BANK_AI_ID]);
    const existingHoldings = await query('SELECT COUNT(*) as count FROM user_stocks WHERE user_id = $1', [BANK_AI_ID]);
    const holdingsCount = parseInt(existingHoldings.rows[0]?.count || 0);
    if (holdingsCount === 0) {
        const stocks = await query('SELECT id FROM stocks');
        for (const stock of stocks.rows) {
            await query(`
                INSERT INTO user_stocks (user_id, stock_id, shares, avg_price)
                VALUES ($1, $2, 10000, 0)
                ON CONFLICT (user_id, stock_id) DO NOTHING
            `, [BANK_AI_ID, stock.id]);
        }
        console.log('[Bank AI] Initialized with 10,000 shares per stock');
    } else {
        console.log('[Bank AI] Holdings already exist, skipping initialization');
    }
}
async function createBankListing() {
    try {
        const listingCount = await query(`
            SELECT COUNT(*) as count 
            FROM market_listings 
            WHERE seller_id = $1 AND status = 'active'
        `, [BANK_AI_ID]);
        const activeCount = parseInt(listingCount.rows[0]?.count || 0);
        if (activeCount >= MIN_LISTINGS) {
            console.log('[Bank AI] Sufficient listings already exist');
            return;
        }
        const stockRes = await query(`
            SELECT us.stock_id, s.ticker, s.name, s.price
            FROM user_stocks us
            JOIN stocks s ON us.stock_id = s.id
            WHERE us.user_id = $1 AND us.shares > 0
            ORDER BY RANDOM()
            LIMIT 1
        `, [BANK_AI_ID]);
        if (stockRes.rows.length === 0) {
            console.log('[Bank AI] No stocks available to list');
            return;
        }
        const stock = stockRes.rows[0];
        const markup = 1 + (Math.random() * 0.04 + 0.01);
        const listingPrice = Math.floor(stock.price * markup);
        const quantity = Math.floor(Math.random() * 10) + 5; 
        await withTransaction(async (client) => {
            await client.query(`
                UPDATE user_stocks 
                SET shares = shares - $1 
                WHERE user_id = $2 AND stock_id = $3
            `, [quantity, BANK_AI_ID, stock.stock_id]);
            await client.query(`
                INSERT INTO market_listings (seller_id, listing_type, stock_id, quantity, price, status)
                VALUES ($1, 'stock', $2, $3, $4, 'active')
            `, [BANK_AI_ID, stock.stock_id, quantity, listingPrice]);
        });
        console.log(`[Bank AI] Listed ${quantity}x ${stock.ticker} at $${listingPrice.toLocaleString()}/share`);
    } catch (error) {
        console.error('[Bank AI] Failed to create listing:', error);
    }
}
function startBankAI() {
    initBankAI().catch(console.error);
    setTimeout(() => {
        for (let i = 0; i < MIN_LISTINGS; i++) {
            setTimeout(() => createBankListing(), i * 2000);
        }
    }, 5000);
    if (listingInterval) {
        clearInterval(listingInterval);
    }
    listingInterval = setInterval(() => {
        createBankListing();
    }, LISTING_INTERVAL_MS);
    console.log('[Bank AI] Market maker started (listings every 10 minutes)');
}
function stopBankAI() {
    if (listingInterval) {
        clearInterval(listingInterval);
        listingInterval = null;
    }
}
module.exports = {
    startBankAI,
    stopBankAI,
    createBankListing,
    BANK_AI_ID
};
