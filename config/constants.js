

module.exports = {

    STATUS_CHECK_INTERVAL_MS: 30000,
    MC_PING_TIMEOUT_MS: 5000,
    GAME_TIMEOUT_MS: 5 * 60 * 1000,
    DISCORD_RETRY_DELAY_MS: 1000,
    MAX_RETRY_ATTEMPTS: 3,


    MIN_BET_AMOUNT: 10,
    DAILY_REWARD_AMOUNT: 1000,
    DAILY_COOLDOWN_HOURS: 24,
    WORK_BASE_REWARD: 50,
    WORK_MAX_REWARD: 150,
    WORK_COOLDOWN_MINUTES: 2,


    // Gambling - Balanced house edge
    COINFLIP_WIN_CHANCE: 0.48,              // 4% house edge (was 0.5)
    DICE_WIN_THRESHOLD: 5,                  // Roll 5-6 wins (33% win rate)
    DICE_MULTIPLIER: 2.5,                   // Compensate for lower win rate
    SLOTS_PAIR_MULTIPLIER: 1.5,             // Reduced from 2x
    SLOTS_TRIPLE_MULTIPLIER: 15,            // Reduced from 20x
    SLOTS_JACKPOT_MULTIPLIER: 75,           // Reduced from 100x


    COLOR_SUCCESS: 0x00FF00,
    COLOR_ERROR: 0xFF0000,
    COLOR_INFO: 0x3498DB,
    COLOR_WARNING: 0xFFA500,
    COLOR_GOLD: 0xF1C40F,


    LOG_LEVELS: {
        ERROR: 'error',
        WARN: 'warn',
        INFO: 'info',
        DEBUG: 'debug'
    },


    DB_PATH: process.env.DB_PATH || './economy.db',
    DB_WAL_MODE: true,
    DB_FOREIGN_KEYS: true,


    LOG_FILE_ENABLED: false,
    LOG_MAX_SIZE: 10 * 1024 * 1024,
    LOG_MAX_FILES: 5,
    LOG_DIR_MAX_SIZE: 100 * 1024 * 1024,
};
