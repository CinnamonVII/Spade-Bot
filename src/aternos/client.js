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
            await this.login(user, pass);
            return true;
        } catch (error) {
            console.error('[AternosClient] Init error:', error.message);
            await this.cleanup();
            throw error;
        }
    }
    async login(username, password) {
        try {
            await this.page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
            await this.page.waitForSelector('#user', { timeout: 10000 });
            await this.page.type('#user', username);
            await this.page.type('#password', password);
            await this.page.click('#login');
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
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
    async getServerStatus() {
        if (!this.isLoggedIn) await this.init();
        try {
            await this.page.goto(SERVER_URL, { waitUntil: 'networkidle2', timeout: 30000 });
            await this.page.waitForSelector('.status', { timeout: 10000 });
            const status = await this.page.$eval('.status', el => el.textContent.trim().toLowerCase());
            const statusClass = await this.page.$eval('.status', el => el.className);
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
            let players = [];
            try {
                const playerList = await this.page.$$eval('.players .player', els =>
                    els.map(el => el.textContent.trim())
                );
                players = playerList;
            } catch (e) {
            }
            return { status: parsedStatus, players };
        } catch (error) {
            console.error('[AternosClient] Status error:', error.message);
            return { status: 'error', players: [], error: error.message };
        }
    }
    async startServer() {
        if (!this.isLoggedIn) await this.init();
        try {
            await this.page.goto(SERVER_URL, { waitUntil: 'networkidle2', timeout: 30000 });
            const { status } = await this.getServerStatus();
            if (status === 'online' || status === 'starting') {
                return { success: false, message: `Server is already ${status}` };
            }
            const startButton = await this.page.$('#start');
            if (!startButton) {
                return { success: false, message: 'Start button not found. Server may be in a transitional state.' };
            }
            await startButton.click();
            await this.page.waitForTimeout(3000);
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
    async stopServer() {
        if (!this.isLoggedIn) await this.init();
        try {
            await this.page.goto(SERVER_URL, { waitUntil: 'networkidle2', timeout: 30000 });
            const { status } = await this.getServerStatus();
            if (status === 'offline' || status === 'stopping') {
                return { success: false, message: `Server is already ${status}` };
            }
            const stopButton = await this.page.$('#stop');
            if (!stopButton) {
                return { success: false, message: 'Stop button not found. Server may be in a transitional state.' };
            }
            await stopButton.click();
            await this.page.waitForTimeout(2000);
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
    async restartServer() {
        if (!this.isLoggedIn) await this.init();
        try {
            await this.page.goto(SERVER_URL, { waitUntil: 'networkidle2', timeout: 30000 });
            const { status } = await this.getServerStatus();
            if (status !== 'online') {
                return { success: false, message: `Cannot restart - server is ${status}` };
            }
            const restartButton = await this.page.$('#restart');
            if (!restartButton) {
                return { success: false, message: 'Restart button not found.' };
            }
            await restartButton.click();
            await this.page.waitForTimeout(2000);
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
    async getLogs() {
        if (!this.isLoggedIn) await this.init();
        try {
            await this.page.goto(`${SERVER_URL}console/`, { waitUntil: 'networkidle2', timeout: 30000 });
            await this.page.waitForSelector('.console', { timeout: 10000 });
            const logs = await this.page.$$eval('.console .line', lines =>
                lines.slice(-50).map(line => line.textContent.trim())
            );
            return { success: true, logs };
        } catch (error) {
            console.error('[AternosClient] Logs error:', error.message);
            return { success: false, message: `Failed to fetch logs: ${error.message}` };
        }
    }
    async cleanup() {
        if (this.browser) {
            try {
                await this.browser.close();
            } catch (e) {
            }
            this.browser = null;
            this.page = null;
            this.isLoggedIn = false;
        }
    }
}
let clientInstance = null;
module.exports = {
    async getClient() {
        if (!clientInstance) {
            clientInstance = new AternosClient();
        }
        return clientInstance;
    },
    async cleanup() {
        if (clientInstance) {
            await clientInstance.cleanup();
            clientInstance = null;
        }
    }
};
