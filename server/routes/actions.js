const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { executeRemoteScript, executeScript } = require('../services/powershell-engine');
const { getCredentials } = require('../services/credential-manager');
const { getNodeById } = require('./nodes');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');

// Track pending actions for verification
const pendingActions = new Map();


/**
 * Execute an action on a node
 * POST /api/action
 */
router.post('/', async (req, res) => {
    const { nodeId, action, params, local } = req.body;

    if (!action) {
        return res.status(400).json({
            success: false,
            error: 'action is required'
        });
    }

    const validActions = [
        'listApps',
        'uninstallApp',
        'listFiles',
        'deleteFiles',
        'searchFiles',
        'enableInternet',
        'disableInternet',
        'enableBrowsers',
        'disableBrowsers',
        'getStoreApps',
        'setTime',
        'enableWebRestriction',
        'disableWebRestriction',
        'previewAppWhitelist',
        'enforceAppWhitelist'
    ];

    if (!validActions.includes(action)) {
        return res.status(400).json({
            success: false,
            error: `Invalid action. Valid actions: ${validActions.join(', ')}`
        });
    }

    const actionId = uuidv4();

    try {
        // Map action to script
        const actionScripts = {
            listApps: { script: 'Manage-Applications.ps1', params: { Action: 'List', ...params } },
            uninstallApp: { script: 'Manage-Applications.ps1', params: { Action: 'Uninstall', ...params } },
            listFiles: { script: 'Manage-Files.ps1', params: { Action: 'List', ...params } },
            deleteFiles: { script: 'Manage-Files.ps1', params: { Action: 'Delete', ...params } },
            searchFiles: { script: 'Manage-Files.ps1', params: { Action: 'Search', ...params } },
            enableInternet: { script: 'Control-Internet.ps1', params: { Action: 'Enable' } },
            disableInternet: { script: 'Control-Internet.ps1', params: { Action: 'Disable' } },
            enableBrowsers: { script: 'Control-Browsers.ps1', params: { Action: 'Enable' } },
            disableBrowsers: { script: 'Control-Browsers.ps1', params: { Action: 'Disable' } },
            getStoreApps: { script: 'Get-SystemMetrics.ps1', params: { StoreAppsOnly: true } },
            setTime: { script: 'Set-Time.ps1', params: { Time: params?.Time } },
            enableWebRestriction: { script: 'Control-WebAccess.ps1', params: { Action: 'Enable' } },
            disableWebRestriction: { script: 'Control-WebAccess.ps1', params: { Action: 'Disable' } },
            previewAppWhitelist: { script: 'Enforce-AppWhitelist.ps1', params: { Action: 'Preview' } },
            enforceAppWhitelist: { script: 'Enforce-AppWhitelist.ps1', params: { Action: 'Enforce' } }
        };

        let actionConfig = actionScripts[action];

        if (action === 'enableWebRestriction') {
            const whitelistPath = path.join(__dirname, '../../server/data/allowed_urls.txt');
            let urls = [];
            if (fs.existsSync(whitelistPath)) {
                urls = fs.readFileSync(whitelistPath, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
            }
            actionConfig.params.AllowedUrls = urls;
        }

        if (action === 'previewAppWhitelist' || action === 'enforceAppWhitelist') {
            const appWhitelistPath = path.join(__dirname, '../../server/data/allowed_apps.txt');
            let apps = [];
            if (fs.existsSync(appWhitelistPath)) {
                apps = fs.readFileSync(appWhitelistPath, 'utf8')
                    .split('\n')
                    .map(s => s.trim())
                    .filter(s => s && !s.startsWith('#'));
            }
            actionConfig.params.WhitelistedApps = apps;
        }

        let result;

        // Mark action as pending
        pendingActions.set(actionId, {
            id: actionId,
            action,
            nodeId,
            status: 'pending',
            startTime: new Date().toISOString()
        });

        if (local) {
            result = await executeScript(actionConfig.script, actionConfig.params);
        } else {
            if (!nodeId) {
                throw new Error('nodeId is required for remote actions');
            }

            const node = getNodeById(nodeId);
            if (!node) {
                throw new Error('Node not found');
            }

            const credentials = getCredentials(nodeId);
            if (!credentials) {
                throw new Error('No credentials stored for this node');
            }

            const findBestIp = (n) => {
                if (n.ipAddress && n.ipAddress !== '') return n.ipAddress;
                if (n.metrics?.network?.adapters?.length > 0) {
                    const adapterWithIp = n.metrics.network.adapters.find(a => a.ip && a.ip !== '');
                    if (adapterWithIp) return adapterWithIp.ip;
                }
                return null;
            };

            const primaryHost = node.hostname || findBestIp(node);

            // Execute main script
            result = await executeRemoteScript(primaryHost, credentials, actionConfig.script, actionConfig.params, node);
        }




        // Update action status
        pendingActions.set(actionId, {
            ...pendingActions.get(actionId),
            status: result.success ? 'verified' : 'failed',
            result,
            endTime: new Date().toISOString()
        });

        res.json({
            success: true,
            actionId,
            status: result.success ? 'verified' : 'failed',
            result
        });
    } catch (error) {
        pendingActions.set(actionId, {
            ...pendingActions.get(actionId),
            status: 'failed',
            error: error.message,
            endTime: new Date().toISOString()
        });

        res.status(500).json({
            success: false,
            actionId,
            status: 'failed',
            error: error.message
        });
    }
});

/**
 * Get action status
 * GET /api/action/:actionId
 */
router.get('/:actionId', (req, res) => {
    const action = pendingActions.get(req.params.actionId);

    if (!action) {
        return res.status(404).json({
            success: false,
            error: 'Action not found'
        });
    }

    res.json({
        success: true,
        action
    });
});

/**
 * Get all pending actions
 * GET /api/action
 */
router.get('/', (req, res) => {
    const actions = Array.from(pendingActions.values())
        .filter(a => req.query.status ? a.status === req.query.status : true);

    res.json({
        success: true,
        count: actions.length,
        actions
    });
});

module.exports = router;
