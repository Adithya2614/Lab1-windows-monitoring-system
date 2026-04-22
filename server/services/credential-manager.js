const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const CREDENTIALS_FILE = path.join(__dirname, '..', '..', 'config', 'credentials.enc');
const ENCRYPTION_KEY_FILE = path.join(__dirname, '..', '..', 'config', '.key');

let cachedCredentials = new Map();
let encryptionKey = null;

/**
 * Generate or load encryption key
 */
async function getEncryptionKey() {
    if (encryptionKey) return encryptionKey;

    try {
        const keyData = await fs.readFile(ENCRYPTION_KEY_FILE);
        encryptionKey = keyData;
    } catch {
        // Generate new key if not exists
        encryptionKey = crypto.randomBytes(32);
        await fs.mkdir(path.dirname(ENCRYPTION_KEY_FILE), { recursive: true });
        await fs.writeFile(ENCRYPTION_KEY_FILE, encryptionKey);
    }
    return encryptionKey;
}

/**
 * Encrypt data using AES-256-GCM
 */
function encrypt(text, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return {
        iv: iv.toString('hex'),
        encrypted,
        authTag: authTag.toString('hex')
    };
}

/**
 * Decrypt data using AES-256-GCM
 */
function decrypt(encryptedData, key) {
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(encryptedData.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Initialize the credential manager
 */
async function initializeCredentialManager() {
    const key = await getEncryptionKey();

    try {
        const data = await fs.readFile(CREDENTIALS_FILE, 'utf8');
        const encryptedData = JSON.parse(data);
        const decrypted = decrypt(encryptedData, key);
        const credentials = JSON.parse(decrypted);

        // Load into cache
        for (const [nodeId, cred] of Object.entries(credentials)) {
            cachedCredentials.set(nodeId, cred);
        }
        console.log(`Loaded ${cachedCredentials.size} cached credentials`);
    } catch {
        // No existing credentials file
        console.log('No existing credentials found, starting fresh');
    }
}

/**
 * Save credentials to encrypted file
 */
async function saveCredentials() {
    const key = await getEncryptionKey();
    const credObj = Object.fromEntries(cachedCredentials);
    const encryptedData = encrypt(JSON.stringify(credObj), key);

    await fs.mkdir(path.dirname(CREDENTIALS_FILE), { recursive: true });
    await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(encryptedData));
}

/**
 * Store credentials for a node
 */
async function storeCredentials(nodeId, username, password, domain = '') {
    cachedCredentials.set(nodeId, { username, password, domain });
    await saveCredentials();
    return true;
}

/**
 * Get credentials for a node
 */
function getCredentials(nodeId) {
    return cachedCredentials.get(nodeId) || null;
}

/**
 * Check if credentials exist for a node
 */
function hasCredentials(nodeId) {
    return cachedCredentials.has(nodeId);
}

/**
 * Remove credentials for a node
 */
async function removeCredentials(nodeId) {
    cachedCredentials.delete(nodeId);
    await saveCredentials();
    return true;
}

/**
 * Get all stored node IDs with credentials
 */
function getAllCredentialNodeIds() {
    return Array.from(cachedCredentials.keys());
}

module.exports = {
    initializeCredentialManager,
    storeCredentials,
    getCredentials,
    hasCredentials,
    removeCredentials,
    getAllCredentialNodeIds
};
