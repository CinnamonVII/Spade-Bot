/**
 * Aternos Client - Browser automation for Aternos server control
 * Uses Puppeteer to automate the Aternos web interface
 */

const puppeteer = require('puppeteer');

const ATERNOS_URL = 'https://aternos.org';
const LOGIN_URL = `${ATERNOS_URL}/go/`;
const SERVER_URL = `${ATERNOS_URL}/server/`;

class AternosClient {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
        this.lastStatus = null;
    }

    /**
     * Initialize browser and login to Aternos
     */
    async init() {
        if (this.browser) return true;

        const user = process.env.ATERNOS_USER;
        const pass = process.env.ATERNOS_PASS;

        if (!user || !pass) {
            throw new Error('ATERNOS_USER and ATERNOS_PASS environment variables required');
        }

        try {
            this.browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--single-process'
                ]
            });

            this.page = await this.browser.newPage();
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

            // Login
            await this.login(user, pass);
            return true;
        } catch (error) {
            console.error('[AternosClient] Init error:', error.message);
            await this.cleanup();
            throw error;
        }
    }

    /**
     * Login to Aternos
     */
    async login(username, password) {
        try {
            await this.page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });

            // Wait for login form
            await this.page.waitForSelector('#user', { timeout: 10000 });

            // Fill credentials
            await this.page.type('#user', username);
            await this.page.type('#password', password);

            // Click login button
            await this.page.click('#login');

            // Wait for navigation to server page
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

            // Check if login succeeded
            const url = this.page.url();
            if (url.includes('/servers/') || url.includes('/server/')) {
                this.isLoggedIn = true;
                console.log('[AternosClient] Login successful');
                return true;
            }

            throw new Error('Login failed - check credentials');
        } catch (error) {
            console.error('[AternosClient] Login error:', error.message);
            throw error;
        }
    }

    /**
     * Navigate to the server page and get status
     */
    async getServerStatus() {
        if (!this.isLoggedIn) await this.init();

        try {
            await this.page.goto(SERVER_URL, { waitUntil: 'networkidle2', timeout: 30000 });

            // Wait for status element
            await this.page.waitForSelector('.status', { timeout: 10000 });

            // Get status text
            const status = await this.page.$eval('.status', el => el.textContent.trim().toLowerCase());
            const statusClass = await this.page.$eval('.status', el => el.className);

            // Parse status
            let parsedStatus = 'unknown';
            if (statusClass.includes('online') || status.includes('online')) {
                parsedStatus = 'online';
            } else if (statusClass.includes('offline') || status.includes('offline')) {
                parsedStatus = 'offline';
            } else if (statusClass.includes('starting') || status.includes('starting') || status.includes('loading')) {
                parsedStatus = 'starting';
            } else if (statusClass.includes('stopping') || status.includes('stopping')) {
                parsedStatus = 'stopping';
            } else if (status.includes('queue') || status.includes('waiting')) {
                parsedStatus = 'queued';
            }

            this.lastStatus = parsedStatus;

            // Try to get player count
            let players = [];
            try {
                const playerList = await this.page.$$eval('.players .player', els =>
                    els.map(el => el.textContent.trim())
                );
                players = playerList;
            } catch (e) {
                // No players online
            }

            return { status: parsedStatus, players };
        } catch (error) {
            console.error('[AternosClient] Status error:', error.message);
            return { status: 'error', players: [], error: error.message };
        }
    }

    /**
     * Start the server
     */
    async startServer() {
        if (!this.isLoggedIn) await this.init();

        try {
            await this.page.goto(SERVER_URL, { waitUntil: 'networkidle2', timeout: 30000 });

            // Check current status
            const { status } = await this.getServerStatus();
            if (status === 'online' || status === 'starting') {
                return { success: false, message: `Server is already ${status}` };
            }

            // Look for start button
            const startButton = await this.page.$('#start');
            if (!startButton) {
                return { success: false, message: 'Start button not found. Server may be in a transitional state.' };
            }

            // Click start
            await startButton.click();

            // Wait for confirmation or queue
            await this.page.waitForTimeout(3000);

            // Check for queue confirmation dialog
            const confirmButton = await this.page.$('.btn-confirm');
            if (confirmButton) {
                await confirmButton.click();
                await this.page.waitForTimeout(2000);
            }

            return { success: true, message: 'Server start initiated. It may take a few minutes to come online.' };
        } catch (error) {
            console.error('[AternosClient] Start error:', error.message);
            return { success: false, message: `Failed to start server: ${error.message}` };
        }
    }

    /**
     * Stop the server
     */
    async stopServer() {
        if (!this.isLoggedIn) await this.init();

        try {
            await this.page.goto(SERVER_URL, { waitUntil: 'networkidle2', timeout: 30000 });

            // Check current status
            const { status } = await this.getServerStatus();
            if (status === 'offline' || status === 'stopping') {
                return { success: false, message: `Server is already ${status}` };
            }

            // Look for stop button
            const stopButton = await this.page.$('#stop');
            if (!stopButton) {
                return { success: false, message: 'Stop button not found. Server may be in a transitional state.' };
            }

            // Click stop
            await stopButton.click();

            // Wait for confirmation
            await this.page.waitForTimeout(2000);

            // Check for confirmation dialog
            const confirmButton = await this.page.$('.btn-confirm');
            if (confirmButton) {
                await confirmButton.click();
                await this.page.waitForTimeout(2000);
            }

            return { success: true, message: 'Server stop initiated.' };
        } catch (error) {
            console.error('[AternosClient] Stop error:', error.message);
            return { success: false, message: `Failed to stop server: ${error.message}` };
        }
    }

    /**
     * Restart the server
     */
    async restartServer() {
        if (!this.isLoggedIn) await this.init();

        try {
            await this.page.goto(SERVER_URL, { waitUntil: 'networkidle2', timeout: 30000 });

            // Check current status
            const { status } = await this.getServerStatus();
            if (status !== 'online') {
                return { success: false, message: `Cannot restart - server is ${status}` };
            }

            // Look for restart button
            const restartButton = await this.page.$('#restart');
            if (!restartButton) {
                return { success: false, message: 'Restart button not found.' };
            }

            // Click restart
            await restartButton.click();

            // Wait for confirmation
            await this.page.waitForTimeout(2000);

            // Check for confirmation dialog
            const confirmButton = await this.page.$('.btn-confirm');
            if (confirmButton) {
                await confirmButton.click();
                await this.page.waitForTimeout(2000);
            }

            return { success: true, message: 'Server restart initiated.' };
        } catch (error) {
            console.error('[AternosClient] Restart error:', error.message);
            return { success: false, message: `Failed to restart server: ${error.message}` };
        }
    }

    /**
     * Get server logs (console output)
     */
    async getLogs() {
        if (!this.isLoggedIn) await this.init();

        try {
            await this.page.goto(`${SERVER_URL}console/`, { waitUntil: 'networkidle2', timeout: 30000 });

            // Wait for console element
            await this.page.waitForSelector('.console', { timeout: 10000 });

            // Get log lines
            const logs = await this.page.$$eval('.console .line', lines =>
                lines.slice(-50).map(line => line.textContent.trim())
            );

            return { success: true, logs };
        } catch (error) {
            console.error('[AternosClient] Logs error:', error.message);
            return { success: false, message: `Failed to fetch logs: ${error.message}` };
        }
    }

    /**
     * Cleanup browser resources
     */
    async cleanup() {
        if (this.browser) {
            try {
                await this.browser.close();
            } catch (e) {
                // Ignore cleanup errors
            }
            this.browser = null;
            this.page = null;
            this.isLoggedIn = false;
        }
    }
}

// Singleton instance
let clientInstance = null;

module.exports = {
    /**
     * Get or create client instance
     */
    async getClient() {
        if (!clientInstance) {
            clientInstance = new AternosClient();
        }
        return clientInstance;
    },

    /**
     * Cleanup client
     */
    async cleanup() {
        if (clientInstance) {
            await clientInstance.cleanup();
            clientInstance = null;
        }
    }
};
