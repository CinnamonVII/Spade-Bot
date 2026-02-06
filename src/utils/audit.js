const fs = require('fs');
const path = require('path');

const AUDIT_LOG_PATH = path.join(__dirname, '../../audit.log');

function auditLog(event, data = {}) {
    try {
        const payload = {
            ts: new Date().toISOString(),
            event,
            ...data
        };
        fs.appendFile(AUDIT_LOG_PATH, JSON.stringify(payload) + '\n', () => {});
    } catch (e) {
        console.error('[AuditLog] Failed to write audit log:', e);
    }
}

module.exports = { auditLog, AUDIT_LOG_PATH };
