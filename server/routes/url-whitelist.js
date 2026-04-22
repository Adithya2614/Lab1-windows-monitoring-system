const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const whitelistPath = path.join(__dirname, '../../server/data/allowed_urls.txt');

// Ensure directory exists
if (!fs.existsSync(path.dirname(whitelistPath))) {
    fs.mkdirSync(path.dirname(whitelistPath), { recursive: true });
}

// Initial content if not exists
if (!fs.existsSync(whitelistPath)) {
    fs.writeFileSync(whitelistPath, 'google.com\nmicrosoft.com\n');
}

/**
 * Get current whitelisted URLs
 * GET /api/url-whitelist
 */
router.get('/', (req, res) => {
    try {
        if (!fs.existsSync(whitelistPath)) {
            return res.json({ urls: [] });
        }
        const content = fs.readFileSync(whitelistPath, 'utf8');
        const urls = content.split('\n').map(s => s.trim()).filter(Boolean);
        res.json({ urls });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Save whitelisted URLs
 * POST /api/url-whitelist
 */
router.post('/', (req, res) => {
    try {
        const { urls } = req.body;
        if (!Array.isArray(urls)) {
            return res.status(400).json({ success: false, error: 'urls must be an array' });
        }
        fs.writeFileSync(whitelistPath, urls.join('\n'));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
