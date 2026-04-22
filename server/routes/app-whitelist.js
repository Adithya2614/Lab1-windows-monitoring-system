const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const whitelistPath = path.join(__dirname, '../../server/data/allowed_apps.txt');

// Ensure directory exists
if (!fs.existsSync(path.dirname(whitelistPath))) {
    fs.mkdirSync(path.dirname(whitelistPath), { recursive: true });
}

// Default content if not exists
if (!fs.existsSync(whitelistPath)) {
    const defaults = [
        '# Whitelisted Applications',
        '# One app name per line. Lines starting with # are comments.',
        'Microsoft Edge',
        'Google Chrome',
        'Mozilla Firefox',
        'Microsoft Visual C++',
        'Microsoft .NET',
        'Microsoft Office',
        'Microsoft Teams',
        'Microsoft OneDrive',
        '7-Zip',
        'VLC media player',
        'Notepad++',
        'Adobe Acrobat Reader DC',
    ].join('\n');
    fs.writeFileSync(whitelistPath, defaults);
}

/**
 * Helper: parse allowed_apps.txt into an array of app name strings (ignores comments/blanks)
 */
function readWhitelist() {
    if (!fs.existsSync(whitelistPath)) return [];
    return fs.readFileSync(whitelistPath, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
}

/**
 * GET /api/app-whitelist
 * Returns the raw file content and parsed app list
 */
router.get('/', (req, res) => {
    try {
        const raw = fs.existsSync(whitelistPath)
            ? fs.readFileSync(whitelistPath, 'utf8')
            : '';
        const apps = readWhitelist();
        res.json({ success: true, raw, apps });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/app-whitelist
 * Save the whitelist (accepts { raw: "..." } for raw text or { apps: [...] } for array)
 */
router.post('/', (req, res) => {
    try {
        let content;
        if (typeof req.body.raw === 'string') {
            content = req.body.raw;
        } else if (Array.isArray(req.body.apps)) {
            content = req.body.apps.join('\n');
        } else {
            return res.status(400).json({ success: false, error: 'Provide raw (string) or apps (array)' });
        }
        fs.writeFileSync(whitelistPath, content, 'utf8');
        const apps = readWhitelist();
        res.json({ success: true, appCount: apps.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
