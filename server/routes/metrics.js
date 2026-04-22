const express = require('express');
const router = express.Router();
const { executeRemoteScript, executeScript } = require('../services/powershell-engine');
const { getCredentials } = require('../services/credential-manager');
const { updateNodeStatus, getNodeById } = require('./nodes');

/**
 * Collect metrics from a node
 * POST /api/metrics
 */
router.post('/', async (req, res) => {
    const { nodeId, local } = req.body;

    try {
        let result;

        if (local) {
            // Execute locally on the controller
            result = await executeScript('Get-SystemMetrics.ps1', {});
        } else {
            // Execute remotely on target node
            if (!nodeId) {
                return res.status(400).json({
                    success: false,
                    error: 'nodeId is required for remote metrics collection'
                });
            }

            const node = getNodeById(nodeId);
            if (!node) {
                return res.status(404).json({
                    success: false,
                    error: 'Node not found'
                });
            }

            const credentials = getCredentials(nodeId);
            if (!credentials) {
                return res.status(401).json({
                    success: false,
                    error: 'No credentials stored for this node'
                });
            }

            const targetHost = node.hostname || node.ipAddress;
            result = await executeRemoteScript(targetHost, credentials, 'Get-SystemMetrics.ps1', {});

            // Update node status based on result success
            if (result && result.success) {
                updateNodeStatus(nodeId, 'online', result);
            } else {
                updateNodeStatus(nodeId, 'offline');
                // Throw error to trigger 500 response or handle gracefully
                throw new Error(result.error || 'Failed to collect remote metrics');
            }
        }

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            metrics: result
        });
    } catch (error) {
        if (nodeId) {
            updateNodeStatus(nodeId, 'offline');
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get latest cached metrics for a node
 * GET /api/metrics/:nodeId
 */
router.get('/:nodeId', (req, res) => {
    const node = getNodeById(req.params.nodeId);

    if (!node) {
        return res.status(404).json({
            success: false,
            error: 'Node not found'
        });
    }

    res.json({
        success: true,
        nodeId: node.id,
        status: node.status,
        lastSeen: node.lastSeen,
        metrics: node.metrics
    });
});

module.exports = router;
