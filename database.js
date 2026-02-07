const { Pool } = require('pg');
const CONSTANTS = require('./config/constants');
const path = require('path');
const fs = require('fs');
const BANK_SYSTEM_ID = 'BANK_SYSTEM';
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
    max: 5,                          
    idleTimeoutMillis: 30000,        
    connectionTimeoutMillis: 10000,  
    allowExitOnIdle: true            
});
async function query(text, params) {
    return pool.query(text, params);
}
async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}
async function initDatabase() {
    try {
        console.log('[DB] Initializing PostgreSQL schema...');
        await query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                balance BIGINT DEFAULT 0 CHECK (balance >= 0),
                xp BIGINT DEFAULT 0 CHECK (xp >= 0),
                level INT DEFAULT 0 CHECK (level >= 0),
                last_daily TIMESTAMP,
                last_work TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                credit_score INT DEFAULT 500,
                savings BIGINT DEFAULT 0 CHECK (savings >= 0),
                equipped_bg TEXT,
                last_dividend TIMESTAMP
            )
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS guilds (
                id VARCHAR(255) PRIMARY KEY,
                prefix VARCHAR(10) DEFAULT '!',
                language VARCHAR(10) DEFAULT 'en',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                active BOOLEAN DEFAULT TRUE,
                -- Aternos configuration (per-guild)
                aternos_user VARCHAR(255),
                aternos_pass VARCHAR(255),
                mc_host VARCHAR(255),
                mc_port INT DEFAULT 25565
            )
        `);
        await query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='aternos_user') THEN
                    ALTER TABLE guilds ADD COLUMN aternos_user VARCHAR(255);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='aternos_pass') THEN
                    ALTER TABLE guilds ADD COLUMN aternos_pass VARCHAR(255);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='mc_host') THEN
                    ALTER TABLE guilds ADD COLUMN mc_host VARCHAR(255);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='mc_port') THEN
                    ALTER TABLE guilds ADD COLUMN mc_port INT DEFAULT 25565;
                END IF;
            END $$;
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS shop_items (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                price BIGINT NOT NULL CHECK (price >= 0),
                description TEXT,
                role_id VARCHAR(255),
                type VARCHAR(50) DEFAULT 'role',
                data TEXT
            )
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS user_items (
                user_id VARCHAR(255),
                item_id INT,
                amount INT DEFAULT 1 CHECK (amount > 0),
                FOREIGN KEY(item_id) REFERENCES shop_items(id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                UNIQUE(user_id, item_id)
            )
        `);
        await query(`
            DO $$ 
            BEGIN 
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='inventory') 
                    AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='user_items') THEN
                    ALTER TABLE inventory RENAME TO user_items;
                ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='inventory') THEN
                    INSERT INTO user_items (user_id, item_id, amount)
                    SELECT user_id, item_id, amount FROM inventory
                    ON CONFLICT (user_id, item_id) DO UPDATE SET amount = user_items.amount + EXCLUDED.amount;
                    DROP TABLE inventory;
                END IF;
            END $$;
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                from_id VARCHAR(255),
                to_id VARCHAR(255),
                amount BIGINT,
                type VARCHAR(255),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS active_boosts (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255),
                type VARCHAR(255),
                multiplier REAL,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS loans (
                id SERIAL PRIMARY KEY,
                borrower_id VARCHAR(255) NOT NULL,
                lender_id VARCHAR(255),
                principal BIGINT NOT NULL CHECK (principal > 0),
                interest_rate REAL NOT NULL CHECK (interest_rate >= 0),
                amount_due BIGINT NOT NULL CHECK (amount_due >= 0),
                due_date TIMESTAMP NOT NULL,
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(borrower_id) REFERENCES users(id)
            )
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS credit_history (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                change INT NOT NULL,
                reason TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS stocks (
                id SERIAL PRIMARY KEY,
                ticker VARCHAR(10) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                price BIGINT NOT NULL DEFAULT 100,
                prev_price BIGINT NOT NULL DEFAULT 100,
                volatility REAL DEFAULT 0.05,
                last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS user_stocks (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                stock_id INT NOT NULL,
                shares INT NOT NULL DEFAULT 0 CHECK (shares >= 0),
                avg_price BIGINT NOT NULL DEFAULT 0,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(stock_id) REFERENCES stocks(id),
                UNIQUE(user_id, stock_id)
            )
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS recipes (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                result_item_id INT,
                result_coins BIGINT DEFAULT 0,
                components JSONB NOT NULL,
                FOREIGN KEY(result_item_id) REFERENCES shop_items(id)
            )
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS market_listings (
                id SERIAL PRIMARY KEY,
                seller_id VARCHAR(255) NOT NULL,
                listing_type VARCHAR(20) DEFAULT 'item',
                item_id INT NULL,
                stock_id INT NULL,
                quantity INT DEFAULT 1,
                price BIGINT NOT NULL CHECK (price > 0),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(20) DEFAULT 'active',
                FOREIGN KEY(seller_id) REFERENCES users(id),
                FOREIGN KEY(item_id) REFERENCES shop_items(id),
                FOREIGN KEY(stock_id) REFERENCES stocks(id)
            )
        `);
        await query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_dividend') THEN
                    ALTER TABLE users ADD COLUMN last_dividend TIMESTAMP;
                END IF;
            END $$;
        `);
        await query(`
            DO $$ 
            BEGIN 
                -- Index for getActiveLoans query
                IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_loans_borrower_status') THEN
                    CREATE INDEX idx_loans_borrower_status ON loans(borrower_id, status);
                END IF;
                -- Index for market listings queries
                IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_market_seller_status') THEN
                    CREATE INDEX idx_market_seller_status ON market_listings(seller_id, status);
                END IF;
                -- Index for user stock portfolio queries
                IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_stocks_user') THEN
                    CREATE INDEX idx_user_stocks_user ON user_stocks(user_id);
                END IF;
            END $$;
        `);
        await query(`
            DO $$ 
            BEGIN 
                -- Add listing_type if missing
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='market_listings' AND column_name='listing_type') THEN
                    ALTER TABLE market_listings ADD COLUMN listing_type VARCHAR(20) DEFAULT 'item';
                END IF;
                -- Add stock_id if missing
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='market_listings' AND column_name='stock_id') THEN
                    ALTER TABLE market_listings ADD COLUMN stock_id INT NULL;
                    ALTER TABLE market_listings ADD CONSTRAINT fk_market_stocks FOREIGN KEY (stock_id) REFERENCES stocks(id);
                END IF;
                -- Add item_id if missing
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='market_listings' AND column_name='item_id') THEN
                    ALTER TABLE market_listings ADD COLUMN item_id INT NULL;
                    ALTER TABLE market_listings ADD CONSTRAINT fk_market_items FOREIGN KEY (item_id) REFERENCES shop_items(id);
                END IF;
                -- Alter columns to be nullable if they aren't already (fix for the NOT NULL violation)
                ALTER TABLE market_listings ALTER COLUMN item_id DROP NOT NULL;
                ALTER TABLE market_listings ALTER COLUMN stock_id DROP NOT NULL;
            END $$;
        `);
        await query('INSERT INTO users (id, balance) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [BANK_SYSTEM_ID, 10000]);
        await query('UPDATE users SET balance = 10000 WHERE id = $1 AND balance = 0', [BANK_SYSTEM_ID]);
        const stocks = [
            ['NVDA', 'NVIDIA Corporation', 8500, 0.12],       
            ['AAPL', 'Apple Inc.', 17500, 0.06],              
            ['MSFT', 'Microsoft Corporation', 38000, 0.07],   
            ['TSLA', 'Tesla Inc.', 20000, 0.15],              
            ['AMZN', 'Amazon.com Inc.', 15000, 0.08],         
            ['GOOGL', 'Alphabet Inc.', 14000, 0.08],          
            ['META', 'Meta Platforms Inc.', 4500, 0.10],      
            ['BTC', 'Bitcoin Index Fund', 45000, 0.20]        
        ];
        const realTickers = stocks.map(s => s[0]);
        for (const [ticker, name, price, volatility] of stocks) {
            await query(`
                INSERT INTO stocks (ticker, name, price, prev_price, volatility) 
                VALUES ($1, $2, $3, $3, $4)
                ON CONFLICT (ticker) DO UPDATE SET 
                    name = EXCLUDED.name,
                    volatility = EXCLUDED.volatility
                    -- We don't overwrite price continuously to allow market fluctuation, 
                    -- but could force it if needed. For now, name/volatility is key.
            `, [ticker, name, price, volatility]);
        }
        const legacyStocks = await query(`SELECT id, ticker FROM stocks WHERE ticker != ALL($1::text[])`, [realTickers]);
        if (legacyStocks.rows.length > 0) {
            const legacyIds = legacyStocks.rows.map(r => r.id);
            console.log(`[DB] Removing ${legacyIds.length} legacy stocks: ${legacyStocks.rows.map(r => r.ticker).join(', ')}`);
            await query(`DELETE FROM market_listings WHERE stock_id = ANY($1::int[])`, [legacyIds]);
            await query(`DELETE FROM user_stocks WHERE stock_id = ANY($1::int[])`, [legacyIds]);
            await query(`DELETE FROM stocks WHERE id = ANY($1::int[])`, [legacyIds]);
            console.log('[DB] Legacy stocks purged.');
        }
        const shopRes = await query('SELECT COUNT(*) as c FROM shop_items');
        if (parseInt(shopRes.rows[0].c) === 0) {
            const items = [
                ['PinpinJR Senpai Role', 100000, 'Become a true Senpai with this exclusive role!', null, 'role', null],
                ['Revenue Boost', 5000, 'Multiplies your earnings (Daily & Work) by 1.5x!', null, 'boost', null],
                ['Legacy Bot', 15000, "A 'nostalgic' look back at a week ago ig? ", null, 'background', 'src/assets/backgrounds/legacy_bot.png'],
                ['Night City View', 20000, 'A breathtaking view of the city at night.', null, 'background', 'src/assets/backgrounds/night_city.jpg'],
                ['Epsteinian', 12000, 'A totally normal island background.', null, 'background', 'src/assets/backgrounds/epsteinian.png']
            ];
            for (const item of items) {
                await query('INSERT INTO shop_items (name, price, description, role_id, type, data) VALUES ($1, $2, $3, $4, $5, $6)', item);
            }
        }
        const listingRes = await query('SELECT COUNT(*) as c FROM market_listings WHERE status = \'active\'');
        if (parseInt(listingRes.rows[0].c) === 0) {
            await query(`
                INSERT INTO market_listings (seller_id, listing_type, stock_id, item_id, quantity, price, status)
                SELECT $1, 'stock', id, NULL, 10, 5000, 'active' 
                FROM stocks LIMIT 3
            `, [BANK_SYSTEM_ID]);
            console.log('[DB] Seeded initial stock market listings.');
        }
        console.log('[DB] Schema initialized successfully.');
    } catch (e) {
        console.error('[DB] Failed to initialize database:', e);
        process.exit(1);
    }
}
async function ensureUser(userId, defaultBalance = 0) {
    await query('INSERT INTO users (id, balance) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [userId, defaultBalance]);
}
async function getBankFunds() {
    await ensureUser(BANK_SYSTEM_ID, 10000);
    const res = await query('SELECT balance FROM users WHERE id = $1', [BANK_SYSTEM_ID]);
    return res.rows[0] ? parseInt(res.rows[0].balance) : 10000;
}
async function updateBalance(userId, amount) {
    return withTransaction(async (client) => {
        await client.query('INSERT INTO users (id, balance) VALUES ($1, 0) ON CONFLICT (id) DO NOTHING', [userId]);
        const res = await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING balance', [amount, userId]);
        return res.rowCount > 0;
    });
}
async function logTransaction(fromId, toId, amount, type) {
    try {
        await query('INSERT INTO transactions (from_id, to_id, amount, type) VALUES ($1, $2, $3, $4)', [fromId, toId, amount, type]);
    } catch (error) {
        console.error('[DB] Failed to log transaction:', error);
    }
}
async function updateXP(userId, amount) {
    return withTransaction(async (client) => {
        await client.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);
        const res = await client.query('SELECT xp, level FROM users WHERE id = $1', [userId]);
        let currentXp = res.rows[0] ? parseInt(res.rows[0].xp) : 0;
        let currentLevel = res.rows[0] ? parseInt(res.rows[0].level) : 0;
        const newXp = currentXp + amount;
        const XP_CONFIG = require('./config/xp_config');
        let newLevel = currentLevel;
        let levelsGained = 0;
        while (newXp >= XP_CONFIG.xpForLevel(newLevel + 1)) {
            newLevel++;
            levelsGained++;
        }
        await client.query('UPDATE users SET xp = $1, level = $2 WHERE id = $3', [newXp, newLevel, userId]);
        return {
            xp: newXp,
            level: newLevel,
            leveledUp: levelsGained > 0,
            levelsGained
        };
    });
}
async function setLevel(userId, level) {
    await query('UPDATE users SET level = $1 WHERE id = $2', [level, userId]);
}
async function getRank(userId) {
    const res = await query(`
        SELECT COUNT(*) + 1 as rank 
        FROM users 
        WHERE xp > (SELECT xp FROM users WHERE id = $1)
    `, [userId]);
    return res.rows[0] ? parseInt(res.rows[0].rank) : 1;
}
async function getXpLeaderboard(limit = 10) {
    const res = await query('SELECT id, xp, level FROM users ORDER BY xp DESC LIMIT $1', [limit]);
    return res.rows.map(row => ({ ...row, xp: parseInt(row.xp), level: parseInt(row.level) })); 
}
async function getUserStats(userId) {
    const res = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (!res.rows[0]) return null;
    const u = res.rows[0];
    return {
        ...u,
        balance: parseInt(u.balance),
        xp: parseInt(u.xp),
        level: parseInt(u.level),
        credit_score: parseInt(u.credit_score || 500),
        savings: parseInt(u.savings || 0)
    };
}
async function getCreditScore(userId) {
    await ensureUser(userId);
    const res = await query('SELECT credit_score, balance, savings FROM users WHERE id = $1', [userId]);
    const user = res.rows[0];
    const baseScore = user ? parseInt(user.credit_score || 500) : 500;
    const balance = user ? parseInt(user.balance || 0) : 0;
    const savings = user ? parseInt(user.savings || 0) : 0;
    const totalWealth = balance + savings;
    const wealthModifier = Math.min(200, Math.floor(totalWealth / 100));
    const poorPenalty = totalWealth < 500 ? Math.floor((500 - totalWealth) / 5) : 0;
    return Math.min(900, Math.max(100, baseScore + wealthModifier - poorPenalty));
}
async function updateCreditScore(userId, change, reason) {
    await ensureUser(userId);
    await query('UPDATE users SET credit_score = credit_score + $1 WHERE id = $2', [change, userId]);
    await query('INSERT INTO credit_history (user_id, change, reason) VALUES ($1, $2, $3)', [userId, change, reason]);
    await query('UPDATE users SET credit_score = LEAST(900, GREATEST(100, credit_score)) WHERE id = $1', [userId]);
}
async function getSavings(userId) {
    await ensureUser(userId);
    const res = await query('SELECT savings FROM users WHERE id = $1', [userId]);
    return res.rows[0] ? parseInt(res.rows[0].savings) : 0;
}
async function updateSavings(userId, amount) {
    await ensureUser(userId);
    const res = await query('UPDATE users SET savings = savings + $1 WHERE id = $2 AND savings + $1 >= 0 RETURNING savings', [amount, userId]);
    return res.rowCount > 0;
}
async function hasOverdueLoan(userId) {
    const res = await query(`SELECT COUNT(*) as count FROM loans WHERE borrower_id = $1 AND status = 'active' AND due_date < NOW()`, [userId]);
    return parseInt(res.rows[0].count) > 0;
}
async function createLoan(borrowerId, lenderId, principal, interestRate, durationHours) {
    return withTransaction(async (client) => {
        if (!lenderId) {
            await ensureUser(BANK_SYSTEM_ID);
            const bRes = await client.query('SELECT balance FROM users WHERE id = $1', [BANK_SYSTEM_ID]);
            const bal = bRes.rows[0] ? parseInt(bRes.rows[0].balance) : 0;
            if (bal < principal) throw new Error("Central Bank has insufficient funds.");
            await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [principal, BANK_SYSTEM_ID]);
        }
        const amountDue = Math.floor(principal * (1 + interestRate));
        const dueDate = new Date(Date.now() + durationHours * 60 * 60 * 1000);
        const res = await client.query(`
            INSERT INTO loans (borrower_id, lender_id, principal, interest_rate, amount_due, due_date)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `, [borrowerId, lenderId, principal, interestRate, amountDue, dueDate]);
        return res.rows[0].id;
    });
}
async function getActiveLoans(userId) {
    const res = await query(`SELECT * FROM loans WHERE borrower_id = $1 AND status = 'active'`, [userId]);
    return res.rows.map(r => ({ ...r, principal: parseInt(r.principal), amount_due: parseInt(r.amount_due) }));
}
async function repayLoan(loanId, userId) {
    return withTransaction(async (client) => {
        const lRes = await client.query('SELECT * FROM loans WHERE id = $1 AND borrower_id = $2', [loanId, userId]);
        const loan = lRes.rows[0];
        if (!loan || loan.status !== 'active') return { success: false, message: 'Loan not found/already repaid.' };
        const amountDue = parseInt(loan.amount_due);
        const uRes = await client.query('SELECT balance FROM users WHERE id = $1', [userId]);
        const userBal = uRes.rows[0] ? parseInt(uRes.rows[0].balance) : 0;
        if (userBal < amountDue) return { success: false, message: 'Insufficient funds.' };
        await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amountDue, userId]);
        const lenderDest = loan.lender_id || BANK_SYSTEM_ID;
        await ensureUser(lenderDest);
        await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amountDue, lenderDest]);
        await client.query("UPDATE loans SET status = 'repaid' WHERE id = $1", [loanId]);
        return { success: true, amountPaid: amountDue };
    });
}
function getBankLoanLimitSync(score) {
    return Math.max(1000, 1000 + Math.floor((score - 500) / 100) * 500);
}
function getBankInterestRateSync(score) {
    return Math.max(0.05, 0.20 - (score - 500) / 100 * 0.02);
}
function getLoanApprovalOddsSync(score) {
    const probability = 0.3 + (score - 100) * 0.00875;
    return Math.min(1, Math.max(0, probability));
}
async function ensureGuild(guildId) {
    await query(`INSERT INTO guilds (id, prefix, language, active) VALUES ($1, '!', 'en', TRUE) ON CONFLICT (id) DO NOTHING`, [guildId]);
}
async function getGuildSettings(guildId) {
    await ensureGuild(guildId);
    const res = await query('SELECT * FROM guilds WHERE id = $1', [guildId]);
    return res.rows[0];
}
async function updateGuildSettings(guildId, settings) {
    await ensureGuild(guildId);
    const allowed = ['prefix', 'language', 'active'];
    const keys = Object.keys(settings).filter(k => allowed.includes(k));
    if (keys.length === 0) return 0;
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = keys.map(k => settings[k]);
    values.push(guildId);
    const res = await query(`UPDATE guilds SET ${setClause} WHERE id = $${values.length}`, values);
    return res.rowCount;
}
module.exports = {
    pool, 
    query,
    initDatabase,
    withTransaction,
    updateBalance,
    logTransaction,
    updateXP,
    setLevel,
    getRank,
    getXpLeaderboard,
    getUserStats,
    ensureUser,
    getCreditScore,
    updateCreditScore,
    getSavings,
    updateSavings,
    createLoan,
    getActiveLoans,
    repayLoan,
    hasOverdueLoan,
    getBankFunds,
    ensureGuild,
    getGuildSettings,
    updateGuildSettings,
    getBankLoanLimitSync,
    getBankInterestRateSync,
    getLoanApprovalOddsSync,
    getBankLoanLimit: async (uid) => getBankLoanLimitSync(await getCreditScore(uid)),
    getBankInterestRate: async (uid) => getBankInterestRateSync(await getCreditScore(uid)),
    getLoanApprovalOdds: async (uid) => getLoanApprovalOddsSync(await getCreditScore(uid)),
    attemptLoanApproval: async (uid) => {
        const score = await getCreditScore(uid);
        const odds = getLoanApprovalOddsSync(score);
        return Math.random() < odds;
    },
    getGuildConfig: async (guildId) => {
        await query(`INSERT INTO guilds (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [guildId]);
        const res = await query(`SELECT * FROM guilds WHERE id = $1`, [guildId]);
        return res.rows[0] || null;
    },
    setGuildAternosConfig: async (guildId, aternosUser, aternosPass, mcHost, mcPort = 25565) => {
        await query(`
            INSERT INTO guilds (id, aternos_user, aternos_pass, mc_host, mc_port)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE SET 
                aternos_user = EXCLUDED.aternos_user,
                aternos_pass = EXCLUDED.aternos_pass,
                mc_host = EXCLUDED.mc_host,
                mc_port = EXCLUDED.mc_port
        `, [guildId, aternosUser, aternosPass, mcHost, mcPort]);
    },
    clearGuildAternosConfig: async (guildId) => {
        await query(`
            UPDATE guilds 
            SET aternos_user = NULL, aternos_pass = NULL, mc_host = NULL, mc_port = 25565
            WHERE id = $1
        `, [guildId]);
    }
};
