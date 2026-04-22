const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// In-memory audit log storage
const auditLogs = [];

/**
 * Create an audit log entry
 * POST /api/audit
 */
router.post('/', (req, res) => {
    const { nodeId, action, details, user, status } = req.body;

    if (!action) {
        return res.status(400).json({
            success: false,
            error: 'action is required'
        });
    }

    const entry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        nodeId: nodeId || null,
        action,
        details: details || {},
        user: user || 'system',
        status: status || 'completed'
    };

    auditLogs.push(entry);

    // Keep only last 1000 entries
    if (auditLogs.length > 1000) {
        auditLogs.shift();
    }

    res.status(201).json({
        success: true,
        entry
    });
});

/**
 * Get audit logs
 * GET /api/audit
 */
router.get('/', (req, res) => {
    const { nodeId, action, limit = 100, offset = 0 } = req.query;

    let filtered = [...auditLogs];

    if (nodeId) {
        filtered = filtered.filter(e => e.nodeId === nodeId);
    }

    if (action) {
        filtered = filtered.filter(e => e.action === action);
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply pagination
    const paginated = filtered.slice(Number(offset), Number(offset) + Number(limit));

    res.json({
        success: true,
        total: filtered.length,
        count: paginated.length,
        offset: Number(offset),
        limit: Number(limit),
        logs: paginated
    });
});

/**
 * Get audit log by ID
 * GET /api/audit/:id
 */
router.get('/:id', (req, res) => {
    const entry = auditLogs.find(e => e.id === req.params.id);

    if (!entry) {
        return res.status(404).json({
            success: false,
            error: 'Audit log entry not found'
        });
    }

    res.json({
        success: true,
        entry
    });
});

module.exports = router;
