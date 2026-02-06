const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query, withTransaction, ensureUser } = require('../../database');
const CONSTANTS = require('../../config/constants');
const { BANK_AI_ID } = require('../../src/ai/bankAI');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('market')
        .setDescription('Player-to-player marketplace')
        .addSubcommand(sub =>
            sub.setName('browse').setDescription('Browse active listings')
                .addStringOption(opt => opt.setName('type').setDescription('Filter by type').addChoices(
                    { name: 'All', value: 'all' },
                    { name: 'Stocks', value: 'stock' },
                    { name: 'Items', value: 'item' }
                ))
        )
        .addSubcommand(sub =>
            sub.setName('buy')
                .setDescription('Buy a listing')
                .addIntegerOption(opt => opt.setName('listing').setDescription('Listing ID').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('cancel')
                .setDescription('Cancel your listing')
                .addIntegerOption(opt => opt.setName('listing').setDescription('Listing ID').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('mylistings').setDescription('View your active listings')
        )
        .addSubcommand(sub =>
            sub.setName('sell')
                .setDescription('List your stocks or items for sale on the market')
                .addStringOption(opt => opt.setName('type').setDescription('What to sell').setRequired(true)
                    .addChoices(
                        { name: 'Stock', value: 'stock' },
                        { name: 'Item', value: 'item' }
                    ))
                .addStringOption(opt => opt.setName('asset').setDescription('Stock ticker (e.g., NVDA) or Item ID').setRequired(true))
                .addIntegerOption(opt => opt.setName('quantity').setDescription('Amount to sell').setRequired(true).setMinValue(1))
                .addIntegerOption(opt => opt.setName('price').setDescription('Total price for all units').setRequired(true).setMinValue(1))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        await ensureUser(userId);

        if (sub === 'browse') {
            const filterType = interaction.options.getString('type') || 'all';

            let filterClause = '';
            if (filterType === 'stock') filterClause = "AND ml.listing_type = 'stock'";
            else if (filterType === 'item') filterClause = "AND ml.listing_type = 'item'";

            const listings = await query(`
                SELECT 
                    ml.*,
                    si.name as item_name,
                    s.ticker as stock_ticker,
                    s.name as stock_name,
                    u.id as seller_display_id
                FROM market_listings ml
                LEFT JOIN shop_items si ON ml.item_id = si.id AND ml.listing_type = 'item'
                LEFT JOIN stocks s ON ml.stock_id = s.id AND ml.listing_type = 'stock'
                LEFT JOIN users u ON ml.seller_id = u.id
                WHERE ml.status = 'active' ${filterClause}
                ORDER BY ml.created_at DESC
                LIMIT 20
            `);

            if (listings.rows.length === 0) {
                return interaction.reply({ content: 'No listings available.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('Player Market')
                .setColor(CONSTANTS.COLOR_INFO)
                .setDescription('Use `/market buy <listing_id>` to purchase!');

            for (const listing of listings.rows) {
                const isBankAI = listing.seller_id === BANK_AI_ID;
                const isSystem = listing.seller_id === 'BANK_SYSTEM'; // Main Bank Seeded ID

                let sellerName = 'Player';
                if (isBankAI) sellerName = 'Bank AI';
                if (isSystem) sellerName = 'System';

                let itemDisplay, pricePerUnit;
                if (listing.listing_type === 'stock') {
                    itemDisplay = `${listing.stock_ticker || 'Stock'}`;
                    pricePerUnit = Math.floor(listing.price / listing.quantity);
                    embed.addFields({
                        name: `#${listing.id} - ${itemDisplay} (${listing.quantity} shares)`,
                        value: `\`\`\`
Price: $${pricePerUnit.toLocaleString()}/share
Total: $${listing.price.toLocaleString()}
Seller: ${sellerName}
\`\`\``,
                        inline: false
                    });
                } else {
                    itemDisplay = `${listing.item_name || 'Item'}`;
                    embed.addFields({
                        name: `#${listing.id} - ${itemDisplay} x${listing.quantity}`,
                        value: `\`\`\`
Price: $${listing.price.toLocaleString()}
Seller: ${sellerName}
\`\`\``,
                        inline: false
                    });
                }
            }

            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'buy') {
            const listingId = interaction.options.getInteger('listing');

            const listingRes = await query(`
                SELECT ml.*, si.name as item_name, s.ticker, s.name as stock_name
                FROM market_listings ml
                LEFT JOIN shop_items si ON ml.item_id = si.id
                LEFT JOIN stocks s ON ml.stock_id = s.id
                WHERE ml.id = $1 AND ml.status = 'active'
            `, [listingId]);

            if (listingRes.rows.length === 0) {
                return interaction.reply({ content: 'Listing not found or already sold.', ephemeral: true });
            }

            const listing = listingRes.rows[0];

            if (listing.seller_id === userId) {
                return interaction.reply({ content: 'You can\'t buy your own listing!', ephemeral: true });
            }

            // Check balance
            const userRes = await query('SELECT balance FROM users WHERE id = $1', [userId]);
            const balance = parseInt(userRes.rows[0]?.balance || 0);

            if (balance < listing.price) {
                return interaction.reply({ content: `Insufficient funds. Need **$${listing.price.toLocaleString()}**.`, ephemeral: true });
            }

            await withTransaction(async (client) => {
                // Deduct buyer balance
                await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [listing.price, userId]);

                // Add to seller balance
                await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [listing.price, listing.seller_id]);

                // Transfer the asset
                if (listing.listing_type === 'stock') {
                    // Give stocks to buyer
                    await client.query(`
                        INSERT INTO user_stocks (user_id, stock_id, shares, avg_price)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (user_id, stock_id) DO UPDATE SET
                            avg_price = (user_stocks.avg_price * user_stocks.shares + $4 * $3) / (user_stocks.shares + $3),
                            shares = user_stocks.shares + $3
                    `, [userId, listing.stock_id, listing.quantity, Math.floor(listing.price / listing.quantity)]);
                } else {
                    // Give item to buyer
                    await client.query(`
                        INSERT INTO user_items (user_id, item_id, amount)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (user_id, item_id) DO UPDATE SET amount = user_items.amount + $3
                    `, [userId, listing.item_id, listing.quantity]);
                }

                // Mark listing as sold
                await client.query('UPDATE market_listings SET status = $1 WHERE id = $2', ['sold', listingId]);
            });

            const itemName = listing.listing_type === 'stock'
                ? `${listing.quantity} shares of ${listing.ticker}`
                : listing.item_name;

            return interaction.reply({ content: `Purchased **${itemName}** for **$${listing.price.toLocaleString()}**!` });
        }

        if (sub === 'cancel') {
            const listingId = interaction.options.getInteger('listing');

            const listingRes = await query('SELECT * FROM market_listings WHERE id = $1 AND seller_id = $2 AND status = $3', [listingId, userId, 'active']);

            if (listingRes.rows.length === 0) {
                return interaction.reply({ content: 'Listing not found or not yours.', ephemeral: true });
            }

            const listing = listingRes.rows[0];

            await withTransaction(async (client) => {
                // Return asset
                if (listing.listing_type === 'stock') {
                    await client.query(`
                        INSERT INTO user_stocks (user_id, stock_id, shares, avg_price)
                        VALUES ($1, $2, $3, 0)
                        ON CONFLICT (user_id, stock_id) DO UPDATE SET shares = user_stocks.shares + $3
                    `, [userId, listing.stock_id, listing.quantity]);
                } else {
                    await client.query(`
                        INSERT INTO user_items (user_id, item_id, amount)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (user_id, item_id) DO UPDATE SET amount = user_items.amount + $3
                    `, [userId, listing.item_id, listing.quantity]);
                }

                // Cancel listing
                await client.query('UPDATE market_listings SET status = $1 WHERE id = $2', ['cancelled', listingId]);
            });

            return interaction.reply({ content: 'Listing cancelled and asset returned.', ephemeral: true });
        }

        if (sub === 'mylistings') {
            const listings = await query(`
                SELECT ml.*, si.name as item_name, s.ticker, s.name as stock_name
                FROM market_listings ml
                LEFT JOIN shop_items si ON ml.item_id = si.id
                LEFT JOIN stocks s ON ml.stock_id = s.id
                WHERE ml.seller_id = $1 AND ml.status = 'active'
            `, [userId]);

            if (listings.rows.length === 0) {
                return interaction.reply({ content: 'You have no active listings.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('Your Listings')
                .setColor(CONSTANTS.COLOR_INFO);

            for (const listing of listings.rows) {
                const itemName = listing.listing_type === 'stock'
                    ? `${listing.ticker} (${listing.quantity} shares)`
                    : `${listing.item_name} x${listing.quantity}`;

                embed.addFields({
                    name: `#${listing.id} - ${itemName}`,
                    value: `**$${listing.price.toLocaleString()}**`,
                    inline: true
                });
            }

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'sell') {
            const listingType = interaction.options.getString('type');
            const assetIdentifier = interaction.options.getString('asset');
            const quantity = interaction.options.getInteger('quantity');
            const totalPrice = interaction.options.getInteger('price');

            if (listingType === 'stock') {
                // Find stock by ticker
                const stockRes = await query('SELECT * FROM stocks WHERE UPPER(ticker) = UPPER($1)', [assetIdentifier]);
                if (stockRes.rows.length === 0) {
                    return interaction.reply({ content: `❌ Stock \`${assetIdentifier}\` not found. Use \`/stocks list\` to see available tickers.`, ephemeral: true });
                }
                const stock = stockRes.rows[0];

                // Check user owns enough shares
                const holdingRes = await query('SELECT shares FROM user_stocks WHERE user_id = $1 AND stock_id = $2', [userId, stock.id]);
                const ownedShares = holdingRes.rows[0]?.shares || 0;

                if (ownedShares < quantity) {
                    return interaction.reply({ content: `❌ You only own **${ownedShares}** shares of ${stock.ticker}. Can't list ${quantity}.`, ephemeral: true });
                }

                await withTransaction(async (client) => {
                    // Deduct shares from user
                    await client.query('UPDATE user_stocks SET shares = shares - $1 WHERE user_id = $2 AND stock_id = $3', [quantity, userId, stock.id]);

                    // Create listing
                    await client.query(`
                        INSERT INTO market_listings (seller_id, listing_type, stock_id, item_id, quantity, price, status)
                        VALUES ($1, 'stock', $2, NULL, $3, $4, 'active')
                    `, [userId, stock.id, quantity, totalPrice]);
                });

                const pricePerShare = Math.floor(totalPrice / quantity);
                return interaction.reply({ content: `✅ Listed **${quantity} shares of ${stock.ticker}** for **$${totalPrice.toLocaleString()}** ($${pricePerShare}/share) on the market!` });

            } else if (listingType === 'item') {
                // Find item by ID
                const itemId = parseInt(assetIdentifier);
                if (isNaN(itemId)) {
                    return interaction.reply({ content: '❌ For items, please provide the numeric Item ID.', ephemeral: true });
                }

                const itemRes = await query('SELECT * FROM shop_items WHERE id = $1', [itemId]);
                if (itemRes.rows.length === 0) {
                    return interaction.reply({ content: `❌ Item with ID \`${itemId}\` not found.`, ephemeral: true });
                }
                const item = itemRes.rows[0];

                // Check user owns enough
                const inventoryRes = await query('SELECT amount FROM user_items WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
                const ownedAmount = inventoryRes.rows[0]?.amount || 0;

                if (ownedAmount < quantity) {
                    return interaction.reply({ content: `❌ You only own **${ownedAmount}x ${item.name}**. Can't list ${quantity}.`, ephemeral: true });
                }

                await withTransaction(async (client) => {
                    // Deduct items from user
                    if (ownedAmount === quantity) {
                        await client.query('DELETE FROM user_items WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
                    } else {
                        await client.query('UPDATE user_items SET amount = amount - $1 WHERE user_id = $2 AND item_id = $3', [quantity, userId, itemId]);
                    }

                    // Create listing
                    await client.query(`
                        INSERT INTO market_listings (seller_id, listing_type, stock_id, item_id, quantity, price, status)
                        VALUES ($1, 'item', NULL, $2, $3, $4, 'active')
                    `, [userId, itemId, quantity, totalPrice]);
                });

                return interaction.reply({ content: `✅ Listed **${quantity}x ${item.name}** for **$${totalPrice.toLocaleString()}** on the market!` });
            }
        }
    }
};
