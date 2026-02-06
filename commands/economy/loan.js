const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    query,
    updateBalance,
    createLoan,
    getActiveLoans,
    repayLoan,
    getCreditScore,
    updateCreditScore,
    ensureUser
} = require('../../database');
const { checkRateLimit } = require('../../src/utils/rateLimiter');
const { sanitizeText } = require('../../src/utils/sanitize');
const { auditLog } = require('../../src/utils/audit');


const loanOffers = new Map();
const OFFER_TTL_MS = 10 * 60 * 1000;
const MAX_ACTIVE_OFFERS = 20;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loan')
        .setDescription('Peer-to-peer lending marketplace')
        .addSubcommand(sub =>
            sub.setName('offer')
                .setDescription('Offer a loan to other players')
                .addIntegerOption(opt =>
                    opt.setName('amount')
                        .setDescription('Loan amount')
                        .setRequired(true)
                        .setMinValue(100)
                )
                .addNumberOption(opt =>
                    opt.setName('interest')
                        .setDescription('Interest rate (e.g. 0.1 for 10%)')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(1)
                )
                .addIntegerOption(opt =>
                    opt.setName('days')
                        .setDescription('Days until due')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(7)
                )
        )
        .addSubcommand(sub =>
            sub.setName('cancel')
                .setDescription('Cancel your active loan offer')
        )
        .addSubcommand(sub =>
            sub.setName('browse')
                .setDescription('View available loan offers from other players')
        )
        .addSubcommand(sub =>
            sub.setName('accept')
                .setDescription('Accept a loan offer from another player')
                .addUserOption(opt =>
                    opt.setName('lender')
                        .setDescription('The player offering the loan')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const sub = interaction.options.getSubcommand();

        const rate = checkRateLimit(`loan:${interaction.user.id}`, 5000, 1);
        if (!rate.ok) {
            const waitSec = Math.ceil(rate.retryAfterMs / 1000);
            return interaction.reply({ content: `Slow down. Try again in ${waitSec}s.`, ephemeral: true });
        }

        const now = Date.now();
        for (const [lenderId, offer] of loanOffers) {
            if (offer.expiresAt <= now) loanOffers.delete(lenderId);
        }

        if (sub === 'offer') {
            if (loanOffers.size >= MAX_ACTIVE_OFFERS) {
                return interaction.reply({ content: 'Loan market is full. Try again later.', ephemeral: true });
            }

            const amount = interaction.options.getInteger('amount');
            const interest = interaction.options.getNumber('interest');
            const days = interaction.options.getInteger('days');


            const res = await query('SELECT balance FROM users WHERE id = $1', [userId]);
            const user = res.rows[0];
            if (!user || parseInt(user.balance) < amount) {
                return interaction.reply({ content: 'Insufficient funds to offer this loan.', ephemeral: true });
            }


            loanOffers.set(userId, {
                amount,
                interestRate: interest,
                days,
                username: interaction.user.username,
                createdAt: now,
                expiresAt: now + OFFER_TTL_MS
            });
            auditLog('loan_offer_create', { userId, amount, interestRate: interest, days });
            return interaction.reply({ content: `Loan offer created: **${amount.toLocaleString()}** coins at **${(interest * 100).toFixed(1)}%** interest, due in **${days}** days.\nOthers can use \`/loan accept\` to take this loan.`, ephemeral: true });
        }

        if (sub === 'cancel') {
            if (loanOffers.has(userId)) {
                loanOffers.delete(userId);
                auditLog('loan_offer_cancel', { userId });
                return interaction.reply({ content: 'Your loan offer has been cancelled.', ephemeral: true });
            }
            return interaction.reply({ content: 'You have no active loan offer.', ephemeral: true });
        }

        if (sub === 'browse') {
            if (loanOffers.size === 0) {
                return interaction.reply({ content: 'No loan offers available right now.', ephemeral: true });
            }

            let desc = '';
            for (const [lenderId, offer] of loanOffers) {
                const safeName = sanitizeText(offer.username, 32);
                desc += `**${safeName}**: ${offer.amount.toLocaleString()} coins @ ${(offer.interestRate * 100).toFixed(1)}% (${offer.days} days)\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle('Loan Marketplace')
                .setDescription(desc)
                .setFooter({ text: 'Use /loan accept @user to take a loan' })
                .setColor(0x4caf50);

            return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
        }

        if (sub === 'accept') {
            const lender = interaction.options.getUser('lender');
            if (lender.id === userId) {
                return interaction.reply({ content: 'You cannot take your own loan.', ephemeral: true });
            }

            const offer = loanOffers.get(lender.id);
            if (!offer) {
                return interaction.reply({ content: 'This user has no active loan offer.', ephemeral: true });
            }


            const lenderRes = await query('SELECT balance FROM users WHERE id = $1', [lender.id]);
            const lenderUser = lenderRes.rows[0];
            if (!lenderUser || parseInt(lenderUser.balance) < offer.amount) {
                loanOffers.delete(lender.id);
                return interaction.reply({ content: 'Lender no longer has sufficient funds. Offer removed.', ephemeral: true });
            }


            await updateBalance(lender.id, -offer.amount);
            await updateBalance(userId, offer.amount);


            await createLoan(userId, lender.id, offer.amount, offer.interestRate, offer.days * 24);


            loanOffers.delete(lender.id);

            const amountDue = Math.floor(offer.amount * (1 + offer.interestRate));
            auditLog('loan_offer_accept', { userId, lenderId: lender.id, amount: offer.amount, interestRate: offer.interestRate, days: offer.days });
            return interaction.reply({ content: `You have accepted a loan from **${lender.username}**.\nReceived: **${offer.amount.toLocaleString()}** coins.\nYou owe: **${amountDue.toLocaleString()}** coins in ${offer.days} days.`, ephemeral: true });
        }
    }
};
