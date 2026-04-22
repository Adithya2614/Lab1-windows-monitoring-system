const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Data file path for persistence
const DATA_DIR = path.join(__dirname, '..', 'data');
const NODES_FILE = path.join(DATA_DIR, 'nodes.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory storage for nodes, backed by file
let nodes = new Map();

/**
 * Load nodes from file on startup
 */
function loadNodes() {
    try {
        if (fs.existsSync(NODES_FILE)) {
            const data = JSON.parse(fs.readFileSync(NODES_FILE, 'utf8'));
            nodes = new Map(data.map(node => [node.id, node]));
            console.log(`Loaded ${nodes.size} nodes from storage`);
        }
    } catch (error) {
        console.error('Error loading nodes:', error.message);
        nodes = new Map();
    }
}

/**
 * Save nodes to file
 */
function saveNodes() {
    try {
        const data = Array.from(nodes.values());
        fs.writeFileSync(NODES_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving nodes:', error.message);
    }
}

// Load nodes on module initialization
loadNodes();

/**
 * Get all registered nodes
 * GET /api/nodes
 */
router.get('/', (req, res) => {
    const nodeList = Array.from(nodes.values()).map(node => ({
        id: node.id,
        name: node.name,
        alias: node.alias,
        hostname: node.hostname,
        ipAddress: node.ipAddress,
        os: node.os,
        status: node.status,
        lastSeen: node.lastSeen,
        metrics: node.metrics || {}
    }));

    res.json({
        success: true,
        count: nodeList.length,
        nodes: nodeList
    });
});

/**
 * Get a specific node by ID
 * GET /api/nodes/:id
 */
router.get('/:id', (req, res) => {
    const node = nodes.get(req.params.id);

    if (!node) {
        return res.status(404).json({
            success: false,
            error: 'Node not found'
        });
    }

    res.json({
        success: true,
        node
    });
});

/**
 * Register a new node
 * POST /api/nodes
 */
router.post('/', (req, res) => {
    const { name, alias, hostname, ipAddress } = req.body;

    if (!hostname && !ipAddress) {
        return res.status(400).json({
            success: false,
            error: 'Either hostname or ipAddress is required'
        });
    }

    const id = uuidv4();
    const node = {
        id,
        name: name || hostname || ipAddress,
        alias: alias || '',
        hostname: hostname || '',
        ipAddress: ipAddress || '',
        os: '',
        status: 'pending',
        lastSeen: null,
        metrics: {},
        createdAt: new Date().toISOString()
    };

    nodes.set(id, node);
    saveNodes(); // Persist to file

    res.status(201).json({
        success: true,
        message: 'Node registered successfully',
        node
    });
});

/**
 * Update a node
 * PUT /api/nodes/:id
 */
router.put('/:id', (req, res) => {
    const node = nodes.get(req.params.id);

    if (!node) {
        return res.status(404).json({
            success: false,
            error: 'Node not found'
        });
    }

    const { name, alias, hostname, ipAddress } = req.body;

    if (name) node.name = name;
    if (alias !== undefined) node.alias = alias;
    if (hostname) node.hostname = hostname;
    if (ipAddress) node.ipAddress = ipAddress;

    nodes.set(req.params.id, node);
    saveNodes(); // Persist to file

    res.json({
        success: true,
        message: 'Node updated successfully',
        node
    });
});

/**
 * Delete a node
 * DELETE /api/nodes/:id
 */
router.delete('/:id', (req, res) => {
    if (!nodes.has(req.params.id)) {
        return res.status(404).json({
            success: false,
            error: 'Node not found'
        });
    }

    nodes.delete(req.params.id);
    saveNodes(); // Persist to file

    res.json({
        success: true,
        message: 'Node deleted successfully'
    });
});

/**
 * Update node status (internal use)
 */
function updateNodeStatus(nodeId, status, metrics = null) {
    const node = nodes.get(nodeId);
    if (node) {
        node.status = status;
        node.lastSeen = new Date().toISOString();
        if (metrics) {
            node.metrics = metrics;
            if (metrics.os) node.os = metrics.os;
        }
        nodes.set(nodeId, node);
        saveNodes(); // Persist status updates
    }
}

/**
 * Get node by ID (internal use)
 */
function getNodeById(nodeId) {
    return nodes.get(nodeId);
}

module.exports = router;
module.exports.updateNodeStatus = updateNodeStatus;
module.exports.getNodeById = getNodeById;
