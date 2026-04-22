const express = require('express');
const router = express.Router();
const { storeCredentials, getCredentials, hasCredentials, removeCredentials, getAllCredentialNodeIds } = require('../services/credential-manager');
const { testConnection } = require('../services/powershell-engine');
const { getNodeById } = require('./nodes');

/**
 * Store credentials for a node
 * POST /api/credentials
 */
router.post('/', async (req, res) => {
    const { nodeId, username, password, domain } = req.body;

    if (!nodeId || !username || !password) {
        return res.status(400).json({
            success: false,
            error: 'nodeId, username, and password are required'
        });
    }

    const node = getNodeById(nodeId);
    if (!node) {
        return res.status(404).json({
            success: false,
            error: 'Node not found'
        });
    }

    try {
        // Test connection before storing
        const targetHost = node.hostname || node.ipAddress;
        const isConnected = await testConnection(targetHost, { username, password, domain });

        if (!isConnected) {
            return res.status(401).json({
                success: false,
                error: 'Failed to connect with provided credentials'
            });
        }

        await storeCredentials(nodeId, username, password, domain);

        res.json({
            success: true,
            message: 'Credentials stored and verified successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Check if credentials exist for a node
 * GET /api/credentials/:nodeId
 */
router.get('/:nodeId', (req, res) => {
    const exists = hasCredentials(req.params.nodeId);

    res.json({
        success: true,
        nodeId: req.params.nodeId,
        hasCredentials: exists
    });
});

/**
 * Get all nodes with stored credentials
 * GET /api/credentials
 */
router.get('/', (req, res) => {
    const nodeIds = getAllCredentialNodeIds();

    res.json({
        success: true,
        count: nodeIds.length,
        nodeIds
    });
});

/**
 * Remove credentials for a node
 * DELETE /api/credentials/:nodeId
 */
router.delete('/:nodeId', async (req, res) => {
    try {
        await removeCredentials(req.params.nodeId);

        res.json({
            success: true,
            message: 'Credentials removed successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Test connection with stored credentials
 * POST /api/credentials/:nodeId/test
 */
router.post('/:nodeId/test', async (req, res) => {
    const node = getNodeById(req.params.nodeId);
    if (!node) {
        return res.status(404).json({
            success: false,
            error: 'Node not found'
        });
    }

    const credentials = getCredentials(req.params.nodeId);
    if (!credentials) {
        return res.status(404).json({
            success: false,
            error: 'No credentials stored for this node'
        });
    }

    try {
        const targetHost = node.hostname || node.ipAddress;
        const isConnected = await testConnection(targetHost, credentials);

        res.json({
            success: true,
            connected: isConnected
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
