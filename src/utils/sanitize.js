function sanitizeText(text, maxLen = 80) {
    if (text === null || text === undefined) return '';
    let t = String(text);
    t = t.replace(/[`*_~|>]/g, '');
    // Prevent @mentions and @everyone/@here spam
    t = t.replace(/@/g, '@\u200b'); // Zero-width space breaks mention
    // Remove control characters and newlines
    t = t.replace(/[\r\n\t\x00-\x1F\x7F]/g, ' ');
    // Collapse multiple spaces
    t = t.replace(/\s+/g, ' ');
    // Trim and limit length
    t = t.trim();
    if (t.length > maxLen) {
        t = t.slice(0, Math.max(0, maxLen - 3)) + '...';
    }
    return t;
}
module.exports = { sanitizeText };
