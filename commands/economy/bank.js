const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    getSavings,
    updateSavings,
    updateBalance,
    getActiveLoans,
    createLoan,
    repayLoan,
    getCreditScore,
    getBankLoanLimit,
    getBankInterestRate,
    attemptLoanApproval,
    getLoanApprovalOdds,
    getBankFunds,
    query,
    withTransaction
} = require('../../database');
const { auditLog } = require('../../src/utils/audit');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bank')
        .setDescription('Central Bank. Manage your savings and loans.')
        .addSubcommand(sub =>
            sub.setName('balance')
                .setDescription('View your bank balance and credit score')
        )
        .addSubcommand(sub =>
            sub.setName('deposit')
                .setDescription('Deposit coins into savings')
                .addIntegerOption(opt =>
                    opt.setName('amount')
                        .setDescription('Amount to deposit')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(sub =>
            sub.setName('withdraw')
                .setDescription('Withdraw coins from savings')
                .addIntegerOption(opt =>
                    opt.setName('amount')
                        .setDescription('Amount to withdraw')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(sub =>
            sub.setName('loan')
                .setDescription('Borrow money from the bank')
                .addIntegerOption(opt =>
                    opt.setName('amount')
                        .setDescription('Amount to borrow')
                        .setRequired(true)
                        .setMinValue(100)
                )
        )
        .addSubcommand(sub =>
            sub.setName('repay')
                .setDescription('Repay an active loan')
                .addIntegerOption(opt =>
                    opt.setName('id')
                        .setDescription('Loan ID to repay')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('loans')
                .setDescription('View your active loans')
        )
        .addSubcommand(sub =>
            sub.setName('dividends')
                .setDescription('Claim daily interest on your savings')
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const sub = interaction.options.getSubcommand();

        if (sub === 'balance') {
            const savings = await getSavings(userId);
            const res = await query('SELECT balance FROM users WHERE id = $1', [userId]);
            const cash = res.rows[0] ? parseInt(res.rows[0].balance) : 0;
            const score = await getCreditScore(userId);
            const limit = await getBankLoanLimit(userId);
            const rate = await getBankInterestRate(userId);
            const bankFunds = await getBankFunds();

            const embed = new EmbedBuilder()
                .setTitle('Bank Statement')
                .setDescription(`**Global Bank Liquidity:** ${bankFunds.toLocaleString()} coins`)
                .addFields(
                    { name: 'Your Profile', value: `**Wallet:** ${cash.toLocaleString()} coins\n**Savings:** ${savings.toLocaleString()} coins\n**Credit Score:** ${score}`, inline: true },
                    { name: 'Borrowing', value: `**Limit:** ${limit.toLocaleString()} coins\n**Rate:** ${(rate * 100).toFixed(1)}%\n**Term:** 1 Hour`, inline: true }
                )
                .setColor(CONSTANTS.COLOR_INFO)
                .setFooter({ text: 'Loans must be repaid within 1 hour.' });

            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'deposit') {
            const amount = interaction.options.getInteger('amount');

            // SECURITY FIX: Atomic operation to prevent race condition (VULN-006)
            try {
                await withTransaction(async (client) => {
                    // Ensure user exists
                    await client.query('INSERT INTO users (id, balance) VALUES ($1, 0) ON CONFLICT (id) DO NOTHING', [userId]);

                    // Atomic: deduct from balance and add to savings in one query
                    const result = await client.query(`
                        UPDATE users 
                        SET balance = balance - $1, savings = savings + $1 
                        WHERE id = $2 AND balance >= $1
                        RETURNING balance, savings
                    `, [amount, userId]);

                    if (result.rowCount === 0) {
                        throw new Error('INSUFFICIENT_FUNDS');
                    }

                    return result.rows[0];
                });

                auditLog('bank_deposit', { userId, amount });
                return interaction.reply({ content: `Deposited **${amount.toLocaleString()}** coins into savings.`, ephemeral: true });
            } catch (error) {
                if (error.message === 'INSUFFICIENT_FUNDS') {
                    const res = await query('SELECT balance FROM users WHERE id = $1', [userId]);
                    const balance = res.rows[0] ? parseInt(res.rows[0].balance) : 0;
                    return interaction.reply({ content: `Insufficient funds in wallet. You have ${balance.toLocaleString()} coins.`, ephemeral: true });
                }
                throw error;
            }
        }

        if (sub === 'withdraw') {
            const amount = interaction.options.getInteger('amount');

            // SECURITY FIX: Atomic operation to prevent race condition (VULN-006)
            try {
                await withTransaction(async (client) => {
                    // Ensure user exists
                    await client.query('INSERT INTO users (id, balance) VALUES ($1, 0) ON CONFLICT (id) DO NOTHING', [userId]);

                    // Atomic: deduct from savings and add to balance in one query
                    const result = await client.query(`
                        UPDATE users 
                        SET savings = savings - $1, balance = balance + $1 
                        WHERE id = $2 AND savings >= $1
                        RETURNING balance, savings
                    `, [amount, userId]);

                    if (result.rowCount === 0) {
                        throw new Error('INSUFFICIENT_SAVINGS');
                    }

                    return result.rows[0];
                });

                auditLog('bank_withdraw', { userId, amount });
                return interaction.reply({ content: `Withdrew **${amount.toLocaleString()}** coins from savings.`, ephemeral: true });
            } catch (error) {
                if (error.message === 'INSUFFICIENT_SAVINGS') {
                    const savings = await getSavings(userId);
                    return interaction.reply({ content: `Insufficient savings. You have ${savings.toLocaleString()} coins in savings.`, ephemeral: true });
                }
                throw error;
            }
        }

        if (sub === 'loan') {
            const amount = interaction.options.getInteger('amount');
            const limit = await getBankLoanLimit(userId);
            const rate = await getBankInterestRate(userId);


            const activeLoans = await getActiveLoans(userId);
            const totalDebt = activeLoans.reduce((sum, l) => sum + parseInt(l.amount_due), 0);

            if (totalDebt + amount > limit) {
                return interaction.reply({ content: `Loan denied. Your limit is ${limit} coins and you already owe ${totalDebt}.`, ephemeral: true });
            }


            const approved = await attemptLoanApproval(userId);
            if (!approved) {
                const odds = await getLoanApprovalOdds(userId);
                return interaction.reply({
                    content: `Loan **DENIED**. Your credit score gives you a ${(odds * 100).toFixed(0)}% approval chance. Try again or improve your credit!`,
                    ephemeral: true
                });
            }


            const bankFunds = await getBankFunds();
            if (bankFunds < amount) {
                return interaction.reply({ content: `Loan denied. The Central Bank is currently out of funds! (Liquidity: ${bankFunds})`, ephemeral: true });
            }

            try {

                const loanId = await createLoan(userId, null, amount, rate, 1);
                await updateBalance(userId, amount);
                auditLog('bank_loan_create', { userId, amount, rate });

                const amountDue = Math.floor(amount * (1 + rate));
                return interaction.reply({ content: `Loan **APPROVED**! Received **${amount.toLocaleString()}** coins.\nYou owe **${amountDue.toLocaleString()}** coins in **1 hour**. (Loan ID: ${loanId})\nInterest Rate: ${(rate * 100).toFixed(1)}%`, ephemeral: true });
            } catch (e) {
                // SECURITY FIX: Don't expose detailed error messages (VULN-012)
                console.error('[Bank] Loan error:', e);
                return interaction.reply({ content: `Error processing loan. Please try again later.`, ephemeral: true });
            }
        }

        if (sub === 'repay') {
            const loanId = interaction.options.getInteger('id');
            const result = await repayLoan(loanId, userId);

            if (result.success) {
                auditLog('bank_loan_repay', { userId, loanId, amount: result.amountPaid });
                return interaction.reply({ content: `Loan repaid! Paid **${result.amountPaid.toLocaleString()}** coins. Your credit score has improved!`, ephemeral: true });
            } else {
                return interaction.reply({ content: result.message, ephemeral: true });
            }
        }

        if (sub === 'loans') {
            const loans = await getActiveLoans(userId);
            if (loans.length === 0) {
                return interaction.reply({ content: 'You have no active loans. Good job!', ephemeral: true });
            }

            const loansStr = loans.map(l => {
                const due = new Date(l.due_date);
                return `**ID ${l.id}**: Owed ${parseInt(l.amount_due).toLocaleString()} (due <t:${Math.floor(due.getTime() / 1000)}:R>)`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setTitle('Your Active Loans')
                .setDescription(loansStr)
                .setColor(CONSTANTS.COLOR_ERROR);

            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'dividends') {
            // SECURITY FIX: Atomic dividend claim to prevent TOCTOU (VULN-011)
            try {
                const result = await withTransaction(async (client) => {
                    // Ensure user exists
                    await client.query('INSERT INTO users (id, balance, savings) VALUES ($1, 0, 0) ON CONFLICT (id) DO NOTHING', [userId]);

                    // Get current savings first
                    const savingsRes = await client.query('SELECT savings FROM users WHERE id = $1', [userId]);
                    const savings = parseInt(savingsRes.rows[0]?.savings || 0);

                    if (savings <= 0) {
                        throw new Error('NO_SAVINGS');
                    }

                    // Calculate dividend (FIX #12: documented rate logic)
                    // Rate is Annual Percentage Yield (APY), divided by 365 for daily rate
                    let rate;
                    if (savings >= 1000000) rate = 0.03;       // 3% APY for millionaires
                    else if (savings >= 100000) rate = 0.025;  // 2.5% APY for 100k+
                    else rate = 0.02;                           // 2% APY base

                    const dailyRate = rate / 365;
                    const dividend = Math.floor(savings * dailyRate);

                    if (dividend <= 0) {
                        throw new Error('DIVIDEND_TOO_SMALL');
                    }

                    // Atomic update: only update if 24h has passed
                    const updateResult = await client.query(`
                        UPDATE users 
                        SET savings = savings + $1, last_dividend = NOW() 
                        WHERE id = $2 
                        AND (last_dividend IS NULL OR last_dividend < NOW() - INTERVAL '24 hours')
                        RETURNING savings, last_dividend
                    `, [dividend, userId]);

                    if (updateResult.rowCount === 0) {
                        throw new Error('TOO_SOON');
                    }

                    return { dividend, rate, newSavings: parseInt(updateResult.rows[0].savings) };
                });

                const { dividend, rate, newSavings } = result;

                const embed = new EmbedBuilder()
                    .setTitle('💰 Dividends Claimed!')
                    .setColor(CONSTANTS.COLOR_SUCCESS)
                    .addFields(
                        { name: 'New Savings', value: `$${newSavings.toLocaleString()}`, inline: true },
                        { name: 'Rate', value: `${(rate * 100).toFixed(1)}% APY`, inline: true },
                        { name: 'Earned', value: `+$${dividend.toLocaleString()}`, inline: true }
                    )
                    .setFooter({ text: 'Claim again in 24 hours!' });

                return interaction.reply({ embeds: [embed] });
            } catch (error) {
                if (error.message === 'NO_SAVINGS') {
                    return interaction.reply({ content: '❌ You need savings to earn dividends! Use `/bank deposit` first.', ephemeral: true });
                }
                if (error.message === 'DIVIDEND_TOO_SMALL') {
                    return interaction.reply({ content: '❌ Your savings are too low to earn dividends. Deposit more!', ephemeral: true });
                }
                if (error.message === 'TOO_SOON') {
                    // Calculate time remaining
                    const userRes = await query('SELECT last_dividend FROM users WHERE id = $1', [userId]);
                    const lastDividend = userRes.rows[0]?.last_dividend;
                    if (lastDividend) {
                        const hoursSince = (new Date() - new Date(lastDividend)) / (1000 * 60 * 60);
                        const hoursLeft = Math.ceil(24 - hoursSince);
                        return interaction.reply({ content: `⏰ You can claim dividends again in **${hoursLeft} hours**.`, ephemeral: true });
                    }
                }
                throw error;
            }
        }
    }
};
