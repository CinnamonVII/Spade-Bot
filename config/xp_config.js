
module.exports = {
    
    XP_COOLDOWN: 60000,

    
    XP_PER_MESSAGE_MIN: 15,
    XP_PER_MESSAGE_MAX: 25,

    
    XP_VOICE_PER_MINUTE: 10,
    VOICE_MIN_MEMBERS: 2, 


    
    
    LEVEL_FORMULA: {
        BASE: 5,
        RATE: 2,
        FLAT: 50,
        OFFSET: 100
    },

    
    
    
    
    
    xpForLevel: (level) => {
        return Math.floor(5 * Math.pow(level, 2) + 50 * level + 100);
    }
};
