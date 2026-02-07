const crypto = require('crypto');
function getEncryptionKey() {
    if (!process.env.ENCRYPTION_KEY) {
        console.warn('[Security] ENCRYPTION_KEY not set! Credentials will not be encrypted properly.');
        console.warn('[Security] Generate a key with: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"');
        return crypto.createHash('sha256').update(process.env.DATABASE_URL || 'default').digest();
    }
    return Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
}
function encrypt(text) {
    if (!text) return null;
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}
function decrypt(encryptedText) {
    if (!encryptedText) return null;
    try {
        const key = getEncryptionKey();
        const parts = encryptedText.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted format');
        }
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const ciphertext = parts[2];
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error('[Security] Decryption failed:', error.message);
        return null;
    }
}
module.exports = {
    encrypt,
    decrypt
};
