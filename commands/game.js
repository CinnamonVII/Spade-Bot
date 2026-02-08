const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder } = require('discord.js');
const { query, ensureUser, withTransaction } = require('../../database');
const CONSTANTS = require('../../config/constants');

// ============================================
// GAME DATA & CONSTANTS
// ============================================

const SUITS = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const BASE_STATS = {
    '2': { hp: 20, atk: 4, def: 2, spd: 3 },
    '3': { hp: 22, atk: 5, def: 3, spd: 4 },
    '4': { hp: 24, atk: 6, def: 3, spd: 4 },
    '5': { hp: 26, atk: 7, def: 4, spd: 5 },
    '6': { hp: 28, atk: 8, def: 4, spd: 5 },
    '7': { hp: 30, atk: 9, def: 5, spd: 6 },
    '8': { hp: 32, atk: 10, def: 5, spd: 6 },
    '9': { hp: 35, atk: 11, def: 6, spd: 7 },
    '10': { hp: 40, atk: 12, def: 6, spd: 7 },
    'J': { hp: 50, atk: 15, def: 8, spd: 9 },  // Boss Tier
    'Q': { hp: 60, atk: 18, def: 10, spd: 10 },
    'K': { hp: 75, atk: 22, def: 12, spd: 11 },
    'A': { hp: 90, atk: 25, def: 15, spd: 15 } // Mythic
};

// Growth per Level (multiplier on base)


const SUIT_BONUS = {
    'Spades': { stat: 'atk', bonus: 1.2, desc: 'Sharp (+ATK)', strongVs: 'Hearts' },
    'Hearts': { stat: 'hp', bonus: 1.2, desc: 'Soul (+HP)', strongVs: 'Clubs' },
    'Clubs': { stat: 'def', bonus: 1.2, desc: 'Force (+DEF)', strongVs: 'Diamonds' },
    'Diamonds': { stat: 'spd', bonus: 1.2, desc: 'Speed (+SPD)', strongVs: 'Spades' }
};

const RARITY = {
    '2': 'Common', '3': 'Common', '4': 'Common', '5': 'Common',
    '6': 'Common', '7': 'Uncommon', '8': 'Uncommon', '9': 'Uncommon',
    '10': 'Rare', 'J': 'Rare', 'Q': 'Epic', 'K': 'Legendary', 'A': 'Mythic'
};

const XP_TABLE = level => Math.floor(100 * Math.pow(level, 1.5));

// Cooldown
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const cooldowns = new Map();

// ============================================
// HELPER FUNCTIONS
// ============================================

function getCooldown(userId) {
    const last = cooldowns.get(userId);
    if (!last) return 0;
    const diff = Date.now() - last;
    if (diff < COOLDOWN_MS) return COOLDOWN_MS - diff;
    return 0;
}

function setCooldown(userId) {
    cooldowns.set(userId, Date.now());
}

function getCardEmoji(suit, rank) {
    const suitIcons = { 'Spades': '♠️', 'Hearts': '♥️', 'Diamonds': '♦️', 'Clubs': '♣️' };
    return `${rank}${suitIcons[suit]}`;
}

function calculateStats(card) {
    const base = BASE_STATS[card.rank];
    const suitMod = SUIT_BONUS[card.suit];
    const level = card.level || 1;

    // Base scale with level
    // Stat = Base * (1 + (Level-1)*0.1) * QualityMod * SuitMod

    const levelMod = 1 + (level - 1) * 0.1;
    let qualityMod = 1.0;
    if (card.quality === 'Foil') qualityMod = 1.1;
    if (card.quality === 'Holo') qualityMod = 1.2;

    const stats = {
        max_hp: Math.floor(base.hp * levelMod * qualityMod),
        atk: Math.floor(base.atk * levelMod * qualityMod),
        def: Math.floor(base.def * levelMod * qualityMod),
        spd: Math.floor(base.spd * levelMod * qualityMod),
    };

    // Apply Suit Bonus
    if (suitMod.stat === 'hp') stats.max_hp = Math.floor(stats.max_hp * suitMod.bonus);
    if (suitMod.stat === 'atk') stats.atk = Math.floor(stats.atk * suitMod.bonus);
    if (suitMod.stat === 'def') stats.def = Math.floor(stats.def * suitMod.bonus);
    if (suitMod.stat === 'spd') stats.spd = Math.floor(stats.spd * suitMod.bonus);

    return stats;
}

function generateWildCard() {
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
    const rand = Math.random();
    let quality = 'Standard';
    if (rand > 0.98) quality = 'Holo';
    else if (rand > 0.90) quality = 'Foil';

    // Wild cards are level 1-5 usually
    const level = Math.floor(Math.random() * 3) + 1;

    return { suit, rank, quality, level, rarity: RARITY[rank] };
}

// ============================================
// COMMAND MODULE
// ============================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cards')
        .setDescription('Spade TCG RPG: Collect, Battle, Level Up!')
        .addSubcommand(sub =>
            sub.setName('hunt')
                .setDescription('Search for wild cards (Battle Encounter)')
        )
        .addSubcommand(sub =>
            sub.setName('collection')
                .setDescription('View your card collection')
                .addUserOption(opt => opt.setName('user').setDescription('User to view'))
        )
        .addSubcommand(sub =>
            sub.setName('set_active')
                .setDescription('Choose your active buddy card')
        )
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('View detailed stats of your active card')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        await ensureUser(userId);

        // Fetch User's Active Card
        const userRes = await query(`
            SELECT u.active_card_id, c.* 
            FROM users u
            LEFT JOIN user_cards c ON u.active_card_id = c.id
            WHERE u.id = $1
        `, [userId]);

        const activeCard = userRes.rows[0]?.active_card_id ? userRes.rows[0] : null;

        // ====================================================
        // SET ACTIVE
        // ====================================================
        if (sub === 'set_active') {
            const cards = await query('SELECT * FROM user_cards WHERE user_id = $1 ORDER BY level DESC, rank DESC LIMIT 25', [userId]);
            if (cards.rows.length === 0) return interaction.reply({ content: 'You have no cards! Use `/cards hunt` to find your first one!', ephemeral: true });

            const options = cards.rows.map(c => {
                const emoji = getCardEmoji(c.suit, c.rank);
                return {
                    label: `${emoji} Lv.${c.level} ${c.quality}`,
                    description: `ID: ${c.id} - ${c.suit} ${c.rank}`,
                    value: c.id.toString()
                };
            });

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_active')
                    .setPlaceholder('Select your buddy...')
                    .addOptions(options)
            );

            const msg = await interaction.reply({ content: 'Choose your active card for battles:', components: [row], fetchReply: true });

            // Interaction collector handled here primarily for instant feedback, 
            // but persistent selects might need a global handler.
            // For now, local collector.
            try {
                const selection = await msg.awaitMessageComponent({ filter: i => i.user.id === userId, time: 30000, componentType: ComponentType.StringSelect });
                const newActiveId = selection.values[0];
                await query('UPDATE users SET active_card_id = $1 WHERE id = $2', [newActiveId, userId]);

                const card = cards.rows.find(c => c.id.toString() === newActiveId);
                const emoji = getCardEmoji(card.suit, card.rank);
                await selection.update({ content: `✅ **${emoji}** is now your active buddy!`, components: [] });
            } catch (e) {
                await interaction.editReply({ content: 'Selection timed out.', components: [] });
            }
            return;
        }

        // ====================================================
        // INFO
        // ====================================================
        if (sub === 'info') {
            if (!activeCard) return interaction.reply({ content: '❌ You don\'t have an active card set! Use `/cards set_active`.', ephemeral: true });

            const stats = calculateStats(activeCard);
            const nextXp = XP_TABLE(activeCard.level);
            const emoji = getCardEmoji(activeCard.suit, activeCard.rank);

            const embed = new EmbedBuilder()
                .setTitle(`${emoji} Lv.${activeCard.level} ${activeCard.suit} ${activeCard.rank}`)
                .setDescription(`Rarity: **${RARITY[activeCard.rank]}** | Quality: **${activeCard.quality}**`)
                .setColor(CONSTANTS.COLOR_INFO)
                .addFields(
                    { name: '❤️ HP', value: `${stats.max_hp}`, inline: true },
                    { name: '⚔️ ATK', value: `${stats.atk}`, inline: true },
                    { name: '🛡️ DEF', value: `${stats.def}`, inline: true },
                    { name: '💨 SPD', value: `${stats.spd}`, inline: true },
                    { name: '✨ XP', value: `${activeCard.xp} / ${nextXp}`, inline: true }
                );
            return interaction.reply({ embeds: [embed] });
        }

        // ====================================================
        // HUNT (BATTLE)
        // ====================================================
        if (sub === 'hunt') {
            const cd = getCooldown(userId);
            if (cd > 0) {
                const minutes = Math.ceil(cd / 60000);
                return interaction.reply({ content: `⏳ You are exhausted. Wait **${minutes}m** to hunt again.`, ephemeral: true });
            }
            // Auto-grant Starter if first time
            if (!activeCard) {
                // Check if they have ANY cards
                const countRes = await query('SELECT count(*) FROM user_cards WHERE user_id = $1', [userId]);
                if (parseInt(countRes.rows[0].count) === 0) {
                    await query("INSERT INTO user_cards (user_id, suit, rank, quality, level) VALUES ($1, 'Spades', '2', 'Standard', 1)", [userId]);
                    const newCard = await query('SELECT * FROM user_cards WHERE user_id = $1 LIMIT 1', [userId]);
                    await query('UPDATE users SET active_card_id = $1 WHERE id = $2', [newCard.rows[0].id, userId]);
                    return interaction.reply({ content: '👋 Welcome to Spade TCG! You received a **2♠️** starter card provided by the Guild. Set as active automatically.', ephemeral: true });
                }
                return interaction.reply({ content: '❌ You need an active card to battle! Use `/cards set_active`.', ephemeral: true });
            }

            // Generate Enemy
            const enemy = generateWildCard();
            // Scale enemy level relative to player? Or pure random?
            // Let's make it challenging: Active Level +/- 2
            enemy.level = Math.max(1, activeCard.level + (Math.floor(Math.random() * 3) - 1));
            const enemyStats = calculateStats(enemy);
            enemy.current_hp = enemyStats.max_hp;

            const playerStats = calculateStats(activeCard);
            let playerHp = playerStats.max_hp; // Start fresh each battle for simplicity? Or persist damage? Fresh is easier for Discord async.
            // Persisting damage requires healing mechanics (Inn). Let's stick to Fresh for now.
            // Wait, previous prompt mentioned Inn. Let's assume full heal between battles for TCG mode.

            const pEmoji = getCardEmoji(activeCard.suit, activeCard.rank);
            const eEmoji = getCardEmoji(enemy.suit, enemy.rank);

            // Battle State
            let battleLog = [`⚔️ Encountered a wild **${eEmoji} Lv.${enemy.level}**!`];

            const updateEmbed = (ended = false) => {
                const embed = new EmbedBuilder()
                    .setTitle(`⚔️ Battle: ${pEmoji} vs ${eEmoji}`)
                    .setColor(ended ? (playerHp > 0 ? CONSTANTS.COLOR_SUCCESS : CONSTANTS.COLOR_ERROR) : CONSTANTS.COLOR_WARNING)
                    .setDescription(battleLog.slice(-5).join('\n')) // Show last 5 logs
                    .addFields(
                        { name: 'Your Card', value: `❤️ ${playerHp}/${playerStats.max_hp}`, inline: true },
                        { name: 'Wild Card', value: `❤️ ${enemy.current_hp}/${enemyStats.max_hp}`, inline: true }
                    );
                return embed;
            };

            const getComponents = (disabled = false) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('attack').setLabel('Attack').setStyle(ButtonStyle.Danger).setDisabled(disabled),
                    new ButtonBuilder().setCustomId('catch').setLabel('Catch').setStyle(ButtonStyle.Success).setDisabled(disabled),
                    new ButtonBuilder().setCustomId('flee').setLabel('Run').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
                );
            };

            const msg = await interaction.reply({ embeds: [updateEmbed()], components: [getComponents()], fetchReply: true });
            setCooldown(userId);

            const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

            let processing = false;
            collector.on('collect', async i => {
                if (i.user.id !== userId) return i.reply({ content: "Not your battle!", ephemeral: true });

                if (processing) return i.deferUpdate();
                processing = true;
                try {

                    const action = i.customId;

                    // Player Turn
                    if (action === 'flee') {
                        battleLog.push(`🏃 You ran away safely.`);
                        await i.update({ embeds: [updateEmbed(true)], components: [] });
                        collector.stop();
                        return;
                    }

                    if (action === 'catch') {
                        // Catch Formula: (MaxHP * 3 - CurrentHP * 2) * Rate / (MaxHP * 3)
                        // Simplified: (1 - (Current / Max)) * BaseRate
                        const hpPercent = enemy.current_hp / enemyStats.max_hp;
                        let baseRate = 0.5; // Base 50%
                        // Rarity penalty
                        if (['J', 'Q', 'K'].includes(enemy.rank)) baseRate = 0.2;
                        if (enemy.rank === 'A') baseRate = 0.1;

                        // Probability increases as HP decreases
                        // If HP is 100%, chance is baseRate * 0.1 (Very low)
                        // If HP is 1%, chance is baseRate * 2.0 (High)
                        const chance = baseRate * (2.0 - hpPercent * 1.5);
                        const roll = Math.random();

                        if (roll < chance) {
                            try {
                                await query(`
                                INSERT INTO user_cards (user_id, suit, rank, quality, level, xp)
                                VALUES ($1, $2, $3, $4, $5, 0)
                            `, [userId, enemy.suit, enemy.rank, enemy.quality, enemy.level]);
                                battleLog.push(`🎉 **Gotcha!** ${eEmoji} was caught!`);
                                await i.update({ embeds: [updateEmbed(true)], components: [] });
                                collector.stop();
                                return;
                            } catch (e) { console.error(e); }
                        } else {
                            battleLog.push(`❌ Catch failed! The wild card is angry!`);
                            // Enemy turn continues
                        }
                    }

                    if (action === 'attack') {
                        // Damage Recalc
                        // Advantage?
                        let multiplier = 1.0;
                        const bonus = SUIT_BONUS[activeCard.suit];
                        if (bonus.strongVs === enemy.suit) multiplier = 1.5;

                        const dmg = Math.max(1, Math.floor((playerStats.atk * multiplier) - (enemyStats.def * 0.5)));
                        enemy.current_hp -= dmg;
                        const crit = Math.random() < 0.1 ? ' (CRIT!)' : ''; // simple crit
                        const effText = multiplier > 1 ? ' **(Effective!)**' : '';
                        battleLog.push(`🗡️ You deal **${dmg}** damage!${effText}`);
                    }

                    // Check Enemy Death
                    if (enemy.current_hp <= 0) {
                        enemy.current_hp = 0;
                        // XP Gain
                        // Base 10 * EnemyLevel
                        const xpGain = 10 * enemy.level;
                        battleLog.push(`🏆 **You Won!** Gained ${xpGain} XP.`);

                        // Apply XP
                        let newXp = (activeCard.xp || 0) + xpGain;
                        let newLevel = activeCard.level;
                        let leveledUp = false;
                        while (newXp >= XP_TABLE(newLevel)) {
                            newXp -= XP_TABLE(newLevel);
                            newLevel++;
                            leveledUp = true;
                        }
                        if (leveledUp) battleLog.push(`🔼 **Level Up!** Your card is now Lv.${newLevel}!`);

                        await query('UPDATE user_cards SET xp = $1, level = $2 WHERE id = $3', [newXp, newLevel, activeCard.id]);

                        await i.update({ embeds: [updateEmbed(true)], components: [] });
                        collector.stop();
                        return;
                    }

                    // Enemy Turn (if not caught/dead)
                    // Speed check? For simplicity, Player always first, Enemy responds.
                    let eMult = 1.0;
                    if (SUIT_BONUS[enemy.suit].strongVs === activeCard.suit) eMult = 1.5;
                    const eDmg = Math.max(1, Math.floor((enemyStats.atk * eMult) - (playerStats.def * 0.5)));
                    playerHp -= eDmg;
                    battleLog.push(`💥 Enemy hits back for **${eDmg}**!`);

                    if (playerHp <= 0) {
                        playerHp = 0;
                        battleLog.push(`💀 **Defeated!** You blacked out.`);
                        await i.update({ embeds: [updateEmbed(true)], components: [] });
                        collector.stop();
                        return;
                    }

                    await i.update({ embeds: [updateEmbed()], components: [getComponents()] });
                } catch (e) {
                    console.error("Battle interaction error:", e);
                } finally {
                    processing = false;
                }
            });

            collector.on('end', (_, reason) => {
                if (reason === 'time') {
                    msg.edit({ content: 'Battle timed out.', components: [] });
                }
            });
        }

        // ====================================================
        // COLLECTION
        // ====================================================
        if (sub === 'collection') {
            // Updated to show Levels
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const cards = await query('SELECT * FROM user_cards WHERE user_id = $1 ORDER BY level DESC', [targetUser.id]);

            const embed = new EmbedBuilder()
                .setTitle(`🃏 ${targetUser.username}'s Collection`)
                .setDescription(`Total Cards: **${cards.rows.length}**`)
                .setColor(CONSTANTS.COLOR_INFO);

            // Just listing top 15 for brevity in embed, maybe paginated in future
            const list = cards.rows.slice(0, 15).map(c => {
                const e = getCardEmoji(c.suit, c.rank);
                return `${e} **Lv.${c.level}** ${c.quality !== 'Standard' ? `(${c.quality})` : ''} - ID:${c.id}`;
            }).join('\n');

            embed.addFields({ name: 'Top Cards', value: list || 'No cards.' });
            if (cards.rows.length > 15) embed.setFooter({ text: `And ${cards.rows.length - 15} more...` });

            return interaction.reply({ embeds: [embed] });
        }
    }
};
