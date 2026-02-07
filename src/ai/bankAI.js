/**
 * Bank AI - Market Maker for Stocks
 * Maintains liquidity by always having stock listings available
 */

const { query, withTransaction } = require('../../database');

const BANK_AI_ID = 'BANK_SYSTEM_AI';
const LISTING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MIN_LISTINGS = 3; // Always maintain at least 3 active listings

let listingInterval = null;

/**
 * Initialize Bank AI with stock holdings
 */
async function initBankAI() {
    // Ensure Bank AI user exists
    await query(`
        INSERT INTO users (id, balance, savings)
        VALUES ($1, 1000000000, 0)
        ON CONFLICT (id) DO NOTHING
    `, [BANK_AI_ID]);

    // SECURITY FIX: Only initialize holdings if they don't exist (prevent infinite inflation)
    const existingHoldings = await query('SELECT COUNT(*) as count FROM user_stocks WHERE user_id = $1', [BANK_AI_ID]);
    const holdingsCount = parseInt(existingHoldings.rows[0]?.count || 0);

    if (holdingsCount === 0) {
        // First-time initialization only
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

/**
 * Create a market listing from Bank AI
 */
async function createBankListing() {
    try {
        // Get current active listings count
        const listingCount = await query(`
            SELECT COUNT(*) as count 
            FROM market_listings 
            WHERE seller_id = $1 AND status = 'active'
        `, [BANK_AI_ID]);

        const activeCount = parseInt(listingCount.rows[0]?.count || 0);

        // Only create if below minimum
        if (activeCount >= MIN_LISTINGS) {
            console.log('[Bank AI] Sufficient listings already exist');
            return;
        }

        // Get a random stock that Bank AI owns
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

        // Price slightly above market (1-5% markup)
        const markup = 1 + (Math.random() * 0.04 + 0.01);
        const listingPrice = Math.floor(stock.price * markup);
        const quantity = Math.floor(Math.random() * 10) + 5; // 5-14 shares

        await withTransaction(async (client) => {
            // Deduct from Bank AI user_items (unlimited supply, so we don't check)
            await client.query(`
                UPDATE user_stocks 
                SET shares = shares - $1 
                WHERE user_id = $2 AND stock_id = $3
            `, [quantity, BANK_AI_ID, stock.stock_id]);

            // Create listing
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

/**
 * Start periodic listing creation
 */
function startBankAI() {
    // Initialize on first run
    initBankAI().catch(console.error);

    // Create initial listings
    setTimeout(() => {
        for (let i = 0; i < MIN_LISTINGS; i++) {
            setTimeout(() => createBankListing(), i * 2000);
        }
    }, 5000);

    // Schedule periodic listings
    if (listingInterval) {
        clearInterval(listingInterval);
    }

    listingInterval = setInterval(() => {
        createBankListing();
    }, LISTING_INTERVAL_MS);

    console.log('[Bank AI] Market maker started (listings every 10 minutes)');
}

/**
 * Stop Bank AI
 */
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
