const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const metricsRoutes = require('./routes/metrics');
const nodesRoutes = require('./routes/nodes');
const actionsRoutes = require('./routes/actions');
const auditRoutes = require('./routes/audit');
const credentialsRoutes = require('./routes/credentials');
const urlWhitelistRoutes = require('./routes/url-whitelist');
const appWhitelistRoutes = require('./routes/app-whitelist');

// Import services
const { initializeCredentialManager } = require('./services/credential-manager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'dashboard')));

// API Routes
app.use('/api/metrics', metricsRoutes);
app.use('/api/nodes', nodesRoutes);
app.use('/api/action', actionsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/credentials', credentialsRoutes);
app.use('/api/url-whitelist', urlWhitelistRoutes);
app.use('/api/app-whitelist', appWhitelistRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve dashboard for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
});

// Initialize services and start server
async function startServer() {
    try {
        await initializeCredentialManager();
        console.log('Credential manager initialized');
        
        app.listen(PORT, () => {
            console.log(`Windows Monitoring System running on http://localhost:${PORT}`);
            console.log(`Dashboard available at http://localhost:${PORT}`);
            console.log(`API available at http://localhost:${PORT}/api`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
