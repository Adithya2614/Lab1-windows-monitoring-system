/**
 * Windows Monitoring System - Dashboard Application
 */

const API_BASE = '/api';

// Application State
const state = {
    nodes: [],
    currentNode: null,
    currentNodeId: null,
    layout: localStorage.getItem('layout') || 'grid',
    pendingActions: new Map(),
    refreshInterval: null
};

// DOM Elements
const elements = {
    statusIndicator: document.getElementById('status-indicator'),
    statusText: document.querySelector('.status-text'),
    pcContainer: document.getElementById('pc-container'),
    emptyState: document.getElementById('empty-state'),
    totalPcs: document.getElementById('total-pcs'),
    onlinePcs: document.getElementById('online-pcs'),
    offlinePcs: document.getElementById('offline-pcs'),
    addPcBtn: document.getElementById('add-pc-btn'),
    addPcModal: document.getElementById('add-pc-modal'),
    addPcForm: document.getElementById('add-pc-form'),
    removePcBtn: document.getElementById('remove-pc-btn'),
    removePcModal: document.getElementById('remove-pc-modal'),
    removePcForm: document.getElementById('remove-pc-form'),
    removePcSelect: document.getElementById('remove-pc-select'),
    confirmModal: document.getElementById('confirm-modal'),
    confirmTitle: document.getElementById('confirm-title'),
    confirmMessage: document.getElementById('confirm-message'),
    confirmOk: document.getElementById('confirm-ok'),
    confirmCancel: document.getElementById('confirm-cancel'),
    auditTbody: document.getElementById('audit-tbody'),
    auditFilter: document.getElementById('audit-filter')
};

// API Helper
async function api(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    return response.json();
}

// Status Indicator
function updateStatus(status, text) {
    elements.statusIndicator.className = `status-indicator ${status}`;
    elements.statusText.textContent = text;
}

// Initialize Application
async function init() {
    setupEventListeners();
    applyLayout(state.layout);
    await loadNodes();
    startAutoRefresh();
}

// Check if current node is local machine (shouldn't use WinRM)
function isLocalNode() {
    if (!state.currentNodeId) return true;
    const node = state.nodes.find(n => n.id === state.currentNodeId);
    if (!node) return true;
    const host = (node.hostname || node.ipAddress || '').toLowerCase();

    // Only treat as local if it's an actual localhost identifier
    return host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1';
}

// Event Listeners
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Layout Toggle
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyLayout(btn.dataset.layout);
        });
    });



    // Add PC Modal
    elements.addPcBtn.addEventListener('click', () => openModal('add-pc-modal'));
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => closeAllModals());
    });
    elements.addPcForm.addEventListener('submit', handleAddPc);

    // Remove PC Modal
    elements.removePcBtn.addEventListener('click', openRemovePcModal);
    elements.removePcForm.addEventListener('submit', handleRemovePc);

    // Back to Dashboard
    document.getElementById('back-to-dashboard').addEventListener('click', () => {
        switchView('dashboard');
    });

    // Detail Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // File Management
    document.getElementById('file-go').addEventListener('click', loadFiles);
    document.getElementById('file-go-up').addEventListener('click', navigateUp);
    document.getElementById('file-search').addEventListener('input', debounce(searchFiles, 300));
    document.getElementById('select-all-files').addEventListener('change', toggleSelectAllFiles);
    document.getElementById('delete-selected').addEventListener('click', deleteSelectedFiles);

    // Application Management
    document.getElementById('refresh-apps').addEventListener('click', loadApplications);
    document.getElementById('app-search').addEventListener('input', debounce(filterApps, 300));
    document.getElementById('select-all-apps').addEventListener('change', toggleSelectAllApps);
    document.getElementById('uninstall-selected').addEventListener('click', uninstallSelectedApps);

    // Controls (per-PC)
    document.getElementById('enable-internet').addEventListener('click', () => controlInternet('Enable'));
    document.getElementById('disable-internet').addEventListener('click', () => controlInternet('Disable'));
    document.getElementById('enable-browsers').addEventListener('click', () => controlBrowsers('Enable'));
    document.getElementById('disable-browsers').addEventListener('click', () => controlBrowsers('Disable'));

    // Global Controls (all PCs)
    document.getElementById('global-enable-internet').addEventListener('click', () => globalControl('enableInternet'));
    document.getElementById('global-disable-internet').addEventListener('click', () => globalControl('disableInternet'));
    document.getElementById('global-enable-browsers').addEventListener('click', () => globalControl('enableBrowsers'));
    document.getElementById('global-disable-browsers').addEventListener('click', () => globalControl('disableBrowsers'));
    document.getElementById('global-set-time').addEventListener('click', () => globalControl('setTime'));
    
    // Web Access Restriction
    document.getElementById('global-manage-urls').addEventListener('click', () => {
        loadUrls();
        openModal('url-whitelist-modal');
    });
    document.getElementById('global-enable-restriction').addEventListener('click', () => handleGlobalWebRestriction('Enable'));
    document.getElementById('global-disable-restriction').addEventListener('click', () => handleGlobalWebRestriction('Disable'));
    document.getElementById('url-whitelist-form').addEventListener('submit', handleSaveUrls);

    // App Whitelist Controls
    document.getElementById('global-manage-apps').addEventListener('click', openAppWhitelistModal);
    document.getElementById('global-preview-apps').addEventListener('click', handleGlobalPreviewApps);
    document.getElementById('global-enforce-apps').addEventListener('click', handleGlobalEnforceApps);

    // Audit
    document.getElementById('refresh-audit').addEventListener('click', loadAuditLogs);
    elements.auditFilter.addEventListener('change', loadAuditLogs);

    // Confirm Modal
    elements.confirmCancel.addEventListener('click', () => closeAllModals());

    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAllModals();
        });
    });
}

// View Management
function switchView(view) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
    });
    document.getElementById(`${view}-view`).classList.add('active');

    if (view === 'audit') loadAuditLogs();
}

function applyLayout(layout) {
    state.layout = layout;
    localStorage.setItem('layout', layout);
    elements.pcContainer.classList.toggle('list-view', layout === 'list');
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tab}`).classList.add('active');

    // Load tab-specific data
    if (tab === 'files') loadFiles();
    if (tab === 'apps') loadApplications();
}

// Modal Management
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function confirm(title, message) {
    return new Promise((resolve) => {
        elements.confirmTitle.textContent = title;
        elements.confirmMessage.textContent = message;
        openModal('confirm-modal');

        const handleConfirm = () => {
            closeAllModals();
            elements.confirmOk.removeEventListener('click', handleConfirm);
            resolve(true);
        };

        const handleCancel = () => {
            closeAllModals();
            elements.confirmCancel.removeEventListener('click', handleCancel);
            resolve(false);
        };

        elements.confirmOk.addEventListener('click', handleConfirm);
        elements.confirmCancel.addEventListener('click', handleCancel);
    });
}

// Node Management
async function loadNodes() {
    try {
        updateStatus('verifying', 'Loading...');
        const response = await api('/nodes');
        state.nodes = response.nodes || [];
        renderNodes();
        updateStats();
        updateStatus('', 'Ready');
    } catch (error) {
        console.error('Failed to load nodes:', error);
        updateStatus('error', 'Error');
    }
}

function renderNodes() {
    const cards = state.nodes.map(node => createPcCard(node)).join('');
    elements.pcContainer.innerHTML = cards || elements.emptyState.outerHTML;

    // Add click handlers for cards
    document.querySelectorAll('.pc-card').forEach(card => {
        card.addEventListener('click', () => openNodeDetail(card.dataset.nodeId));
    });
}

function createPcCard(node) {
    const status = node.status || 'pending';
    const metrics = node.metrics || {};
    const ram = metrics.ram || {};
    const disk = metrics.disks?.[0] || {};
    const cpu = metrics.cpu || {};
    const network = metrics.network || {};

    return `
        <div class="pc-card ${status}" data-node-id="${node.id}">

            <div class="pc-card-header">
                <div class="pc-info">
                    <div class="pc-name">${escapeHtml(node.name)}</div>
                    ${node.alias ? `<div class="pc-alias">${escapeHtml(node.alias)}</div>` : ''}
                    <div class="pc-os">${escapeHtml(node.os || 'Windows')}</div>
                </div>
                <span class="status-badge ${status}">${status}</span>
            </div>
            <div class="pc-metrics">
                <div class="pc-metric">
                    <span class="pc-metric-label">CPU</span>
                    <span class="pc-metric-value">${cpu.usagePercent ?? '--'}%</span>
                    <div class="metric-bar">
                        <div class="metric-fill cpu" style="width: ${cpu.usagePercent || 0}%"></div>
                    </div>
                </div>
                <div class="pc-metric">
                    <span class="pc-metric-label">RAM</span>
                    <span class="pc-metric-value">${ram.usagePercent ?? '--'}%</span>
                    <div class="metric-bar">
                        <div class="metric-fill ram" style="width: ${ram.usagePercent || 0}%"></div>
                    </div>
                </div>
                <div class="pc-metric">
                    <span class="pc-metric-label">Disk</span>
                    <span class="pc-metric-value">${disk.usagePercent ?? '--'}%</span>
                    <div class="metric-bar">
                        <div class="metric-fill disk" style="width: ${disk.usagePercent || 0}%"></div>
                    </div>
                </div>
                <div class="pc-metric">
                    <span class="pc-metric-label">Internet</span>
                    <span class="pc-metric-value">${metrics.internet?.connected ? '✓ Online' : '✗ Offline'}</span>
                </div>
            </div>
            <div class="pc-footer">
                <div class="pc-network">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
                        <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                        <circle cx="12" cy="20" r="1"/>
                    </svg>
                    <span>${escapeHtml(network.ssid || network.type || 'Unknown')}</span>
                </div>
                <span class="pc-updated">${node.lastSeen ? formatTime(node.lastSeen) : 'Never'}</span>
            </div>
        </div>
    `;
}

function updateStats() {
    const total = state.nodes.length;
    const online = state.nodes.filter(n => n.status === 'online').length;
    const offline = total - online;

    elements.totalPcs.textContent = total;
    elements.onlinePcs.textContent = online;
    elements.offlinePcs.textContent = offline;
}

// Add PC Handler
async function handleAddPc(e) {
    e.preventDefault();

    const formData = {
        name: document.getElementById('pc-name').value,
        alias: document.getElementById('pc-alias').value,
        hostname: document.getElementById('pc-hostname').value,
        ipAddress: document.getElementById('pc-ip').value
    };

    const credentials = {
        username: document.getElementById('cred-username').value,
        password: document.getElementById('cred-password').value,
        domain: document.getElementById('cred-domain').value
    };

    try {
        updateStatus('verifying', 'Adding PC...');

        // Create node
        const nodeResponse = await api('/nodes', 'POST', formData);
        if (!nodeResponse.success) throw new Error(nodeResponse.error);

        // Store credentials
        const credResponse = await api('/credentials', 'POST', {
            nodeId: nodeResponse.node.id,
            ...credentials
        });

        if (!credResponse.success) {
            // Rollback node creation if credentials fail
            await api(`/nodes/${nodeResponse.node.id}`, 'DELETE');
            throw new Error(credResponse.error || 'Failed to verify credentials');
        }

        closeAllModals();
        elements.addPcForm.reset();
        await loadNodes();

        // Collect initial metrics
        collectMetrics(nodeResponse.node.id);

        updateStatus('', 'PC Added');
    } catch (error) {
        console.error('Failed to add PC:', error);
        updateStatus('error', error.message);
        alert('Failed to add PC: ' + error.message);
    }
}

// Remove PC Handlers
function openRemovePcModal() {
    // Populate select with current nodes
    elements.removePcSelect.innerHTML = state.nodes.length === 0 
        ? '<option value="" disabled selected>No PCs available</option>'
        : state.nodes.map(node => `<option value="${node.id}">${escapeHtml(node.name)} ${node.hostname ? `(${escapeHtml(node.hostname)})` : ''}</option>`).join('');
    
    openModal('remove-pc-modal');
}

async function handleRemovePc(e) {
    e.preventDefault();

    const nodeId = elements.removePcSelect.value;
    if (!nodeId) return;

    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const confirmed = await confirm('Remove PC', `Are you sure you want to remove ${node.name}?`);
    if (!confirmed) {
        // Re-open if they cancel the confirm but were in the remove modal
        openRemovePcModal();
        return;
    }

    try {
        updateStatus('verifying', 'Removing PC...');

        // Remove node
        const nodeResponse = await api(`/nodes/${nodeId}`, 'DELETE');
        if (!nodeResponse.success) throw new Error(nodeResponse.error);

        // Remove credentials
        await api(`/credentials/${nodeId}`, 'DELETE').catch(err => console.warn('Failed to delete credentials:', err));

        closeAllModals();
        
        // If we were viewing this node, go back to dashboard
        if (state.currentNodeId === nodeId) {
            switchView('dashboard');
            state.currentNodeId = null;
            state.currentNode = null;
        }

        await loadNodes();
        updateStatus('', 'PC Removed');
    } catch (error) {
        console.error('Failed to remove PC:', error);
        updateStatus('error', error.message);
        alert('Failed to remove PC: ' + error.message);
    }
}

// Node Detail
async function openNodeDetail(nodeId) {
    state.currentNodeId = nodeId;
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return;

    state.currentNode = node;

    // Update header
    document.getElementById('detail-pc-name').textContent = node.name;
    document.getElementById('detail-status').textContent = node.status;
    document.getElementById('detail-status').className = `status-badge ${node.status}`;

    // Switch to detail view
    document.getElementById('dashboard-view').classList.remove('active');
    document.getElementById('pc-detail-view').classList.add('active');

    // Load metrics
    await loadDetailMetrics();
}

async function loadDetailMetrics() {
    const node = state.currentNode;
    if (!node) return;

    const metrics = node.metrics || {};
    const cpu = metrics.cpu || {};
    const ram = metrics.ram || {};
    const disk = metrics.disks?.[0] || {};
    const uptime = metrics.uptime || {};
    const network = metrics.network || {};
    const computer = metrics.computer || {};

    // Update metrics
    document.getElementById('detail-cpu').textContent = `${cpu.usagePercent ?? '--'}%`;
    document.getElementById('detail-cpu-bar').style.width = `${cpu.usagePercent || 0}%`;

    document.getElementById('detail-ram').textContent = `${ram.usedGB ?? '--'} / ${ram.totalGB ?? '--'} GB`;
    document.getElementById('detail-ram-bar').style.width = `${ram.usagePercent || 0}%`;

    document.getElementById('detail-disk').textContent = `${disk.usedGB ?? '--'} / ${disk.totalGB ?? '--'} GB`;
    document.getElementById('detail-disk-bar').style.width = `${disk.usagePercent || 0}%`;

    const uptimeStr = uptime.days !== undefined
        ? `${uptime.days}d ${uptime.hours}h ${uptime.minutes}m`
        : '--';
    document.getElementById('detail-uptime').textContent = uptimeStr;

    // System info
    document.getElementById('detail-os').textContent = metrics.os?.name || '--';
    document.getElementById('detail-computer-name').textContent = computer.name || '--';
    document.getElementById('detail-domain').textContent = computer.domain || '--';

    // Network
    document.getElementById('detail-network-type').textContent = network.type || '--';
    document.getElementById('detail-network-name').textContent = network.ssid || 'N/A';
    document.getElementById('detail-internet').textContent = metrics.internet?.connected ? 'Connected' : 'Disconnected';

    // USB devices
    const usbList = document.getElementById('detail-usb-list');
    const usbDevices = metrics.usb?.devices || [];
    usbList.innerHTML = usbDevices.slice(0, 5).map(usb => `
        <div class="info-item">
            <span class="info-value">${escapeHtml(usb.name)}</span>
        </div>
    `).join('') || '<div class="info-item"><span class="info-value">No USB devices</span></div>';
}

// Metrics Collection
async function collectMetrics(nodeId) {
    try {
        updateStatus('verifying', 'Collecting metrics...');
        await api('/metrics', 'POST', { nodeId });
        await loadNodes();
        updateStatus('', 'Ready');
    } catch (error) {
        console.error('Failed to collect metrics:', error);
        updateStatus('error', 'Collection failed');
    }
}

// File Management
async function loadFiles() {
    const path = document.getElementById('file-path').value || 'C:\\';
    const showHidden = document.getElementById('show-hidden').checked;

    try {
        updateStatus('verifying', 'Loading files...');
        const response = await api('/action', 'POST', {
            nodeId: state.currentNodeId,
            action: 'listFiles',
            params: {
                Path: path,
                IncludeHidden: showHidden ? 'true' : 'false'  // Pass as string for PowerShell switch
            },
            local: isLocalNode()
        });

        console.log('Files response:', response);

        if (response.success && response.result) {
            // Handle different response structures
            const items = response.result.data?.items ||
                response.result.items ||
                response.result.output?.data?.items ||
                [];
            renderFiles(items);
        } else {
            console.error('Files error:', response.error);
            renderFiles([]);
        }
        updateStatus('', 'Ready');
    } catch (error) {
        console.error('Failed to load files:', error);
        updateStatus('error', 'Failed to load files');
    }
}

// Navigate to parent folder
function navigateUp() {
    const pathInput = document.getElementById('file-path');
    let currentPath = pathInput.value.replace(/\\/g, '/'); // Normalize to forward slashes

    // Remove trailing slash if present
    if (currentPath.endsWith('/')) {
        currentPath = currentPath.slice(0, -1);
    }

    // Find last slash and get parent path
    const lastSlashIndex = currentPath.lastIndexOf('/');

    if (lastSlashIndex > 0) {
        // Go to parent folder
        pathInput.value = currentPath.slice(0, lastSlashIndex).replace(/\//g, '\\') + '\\';
    } else if (lastSlashIndex === 0) {
        // We're at root (like "/")
        pathInput.value = '/';
    } else if (currentPath.match(/^[A-Za-z]:$/)) {
        // Already at drive root (like "C:")
        pathInput.value = currentPath + '\\';
    } else if (currentPath.match(/^[A-Za-z]:/)) {
        // Path like "C:/something" - go to drive root
        pathInput.value = currentPath.slice(0, 2) + '\\';
    }

    loadFiles();
}

function renderFiles(files) {
    const tbody = document.getElementById('file-tbody');
    tbody.innerHTML = files.map(file => `
        <tr data-path="${escapeHtml(file.path)}" data-type="${file.type}">
            <td><input type="checkbox" class="file-checkbox" onclick="event.stopPropagation()"></td>
            <td class="file-name-cell ${file.type === 'folder' ? 'folder-link' : ''}">
                ${file.type === 'folder' ? '📁' : '📄'}
                ${escapeHtml(file.name)}
                ${file.isHidden ? '<span class="text-muted">(hidden)</span>' : ''}
            </td>
            <td>${file.type}</td>
            <td>${file.sizeFormatted || '-'}</td>
            <td>${formatTime(file.modifiedAt)}</td>
        </tr>
    `).join('');

    // Update selection handlers
    document.querySelectorAll('.file-checkbox').forEach(cb => {
        cb.addEventListener('change', updateDeleteButton);
    });

    // Add folder click handlers for navigation
    document.querySelectorAll('#file-tbody tr[data-type="folder"]').forEach(row => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
            if (e.target.type === 'checkbox') return; // Don't navigate when clicking checkbox
            const folderPath = row.dataset.path;
            document.getElementById('file-path').value = folderPath;
            loadFiles();
        });
    });
}

function searchFiles() {
    const searchTerm = document.getElementById('file-search').value;
    // Filter displayed files client-side for quick search
    const rows = document.querySelectorAll('#file-tbody tr');
    rows.forEach(row => {
        const name = row.querySelector('td:nth-child(2)').textContent.toLowerCase();
        row.style.display = name.includes(searchTerm.toLowerCase()) ? '' : 'none';
    });
}

function toggleSelectAllFiles(e) {
    document.querySelectorAll('.file-checkbox').forEach(cb => {
        cb.checked = e.target.checked;
    });
    updateDeleteButton();
}

function updateDeleteButton() {
    const selected = document.querySelectorAll('.file-checkbox:checked').length;
    document.getElementById('delete-selected').disabled = selected === 0;
}

async function deleteSelectedFiles() {
    const paths = Array.from(document.querySelectorAll('.file-checkbox:checked'))
        .map(cb => cb.closest('tr').dataset.path);

    if (paths.length === 0) return;

    const confirmed = await confirm(
        'Delete Files',
        `Are you sure you want to delete ${paths.length} item(s)? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
        updateStatus('pending', 'Deleting...');

        // Mark items as pending in UI
        paths.forEach(path => {
            const row = document.querySelector(`tr[data-path="${path}"]`);
            if (row) row.classList.add('pending');
        });

        const response = await api('/action', 'POST', {
            nodeId: state.currentNodeId,
            action: 'deleteFiles',
            params: { FilesToDelete: paths },
            local: isLocalNode()
        });

        console.log('Delete response:', response);

        // Handle verification status
        if (response.success && response.result && response.result.results) {
            let anySuccessful = false;
            response.result.results.forEach(result => {
                if (result.verified) {
                    anySuccessful = true;
                }
            });

            // Auto-refresh file list after successful deletion
            if (anySuccessful) {
                updateStatus('verifying', 'Refreshing...');
                await loadFiles();
            } else {
                // Show errors for failed deletions
                response.result.results.forEach(result => {
                    const row = document.querySelector(`tr[data-path="${result.path}"]`);
                    if (row) {
                        row.classList.remove('pending');
                        row.classList.add('failed');
                        const nameCell = row.cells[1];
                        nameCell.title = result.message || 'Delete failed';
                    }
                });
            }
        } else {
            // Error - unmark all as pending
            paths.forEach(path => {
                const row = document.querySelector(`tr[data-path="${path}"]`);
                if (row) {
                    row.classList.remove('pending');
                    row.classList.add('failed');
                }
            });
            alert(`Delete failed: ${response.error || 'Unknown error'}`);
        }

        updateStatus('', 'Complete');
        await logAudit('deleteFiles', { paths, result: response.result });
    } catch (error) {
        console.error('Delete failed:', error);
        updateStatus('error', 'Delete failed');

        // Unmark items as pending
        paths.forEach(path => {
            const row = document.querySelector(`tr[data-path="${path}"]`);
            if (row) {
                row.classList.remove('pending');
                row.classList.add('failed');
            }
        });
    }
}

// Application Management
async function loadApplications() {
    try {
        updateStatus('verifying', 'Loading applications...');
        const response = await api('/action', 'POST', {
            nodeId: state.currentNodeId,
            action: 'listApps',
            local: isLocalNode()
        });

        console.log('Apps response:', response);

        if (response.success && response.result) {
            // Handle different response structures
            const apps = response.result.applications ||
                response.result.output?.applications ||
                [];
            renderApps(apps);
        } else {
            console.error('Apps error:', response.error);
            renderApps([]);
        }
        updateStatus('', 'Ready');
    } catch (error) {
        console.error('Failed to load applications:', error);
        updateStatus('error', 'Failed to load apps');
    }
}



function renderApps(apps) {
    const tbody = document.getElementById('app-tbody');
    tbody.innerHTML = apps.map(app => `
        <tr data-app-name="${escapeHtml(app.Name || app.name)}">
            <td><input type="checkbox" class="app-checkbox"></td>
            <td>${escapeHtml(app.Name || app.name)}</td>
            <td>${escapeHtml(app.Version || app.version || '-')}</td>
            <td>${escapeHtml(app.Publisher || app.publisher || '-')}</td>
            <td>${app.SizeMB || app.sizeMB ? `${app.SizeMB || app.sizeMB} MB` : '-'}</td>
            <td><span class="action-status">Installed</span></td>
        </tr>
    `).join('');

    document.querySelectorAll('.app-checkbox').forEach(cb => {
        cb.addEventListener('change', updateUninstallButton);
    });
}

function filterApps() {
    const searchTerm = document.getElementById('app-search').value.toLowerCase();
    document.querySelectorAll('#app-tbody tr').forEach(row => {
        const name = row.querySelector('td:nth-child(2)').textContent.toLowerCase();
        const publisher = row.querySelector('td:nth-child(4)').textContent.toLowerCase();
        row.style.display = (name.includes(searchTerm) || publisher.includes(searchTerm)) ? '' : 'none';
    });
}

function toggleSelectAllApps(e) {
    document.querySelectorAll('.app-checkbox').forEach(cb => {
        cb.checked = e.target.checked;
    });
    updateUninstallButton();
}

function updateUninstallButton() {
    const selected = document.querySelectorAll('.app-checkbox:checked').length;
    document.getElementById('uninstall-selected').disabled = selected === 0;
}

async function uninstallSelectedApps() {
    const appNames = Array.from(document.querySelectorAll('.app-checkbox:checked'))
        .map(cb => cb.closest('tr').dataset.appName);

    if (appNames.length === 0) return;

    const confirmed = await confirm(
        'Uninstall Applications',
        `Are you sure you want to uninstall ${appNames.length} application(s)? This may take up to 30 seconds per app.`
    );

    if (!confirmed) return;

    try {
        updateStatus('pending', 'Uninstalling (may take up to 30s)...');

        // Mark as pending
        appNames.forEach(name => {
            const row = document.querySelector(`tr[data-app-name="${name}"]`);
            if (row) {
                row.querySelector('.action-status').textContent = 'Uninstalling...';
                row.querySelector('.action-status').className = 'action-status pending';
            }
        });

        console.log('Sending uninstall request for:', appNames);

        const response = await api('/action', 'POST', {
            nodeId: state.currentNodeId,
            action: 'uninstallApp',
            params: { AppNames: appNames },
            local: isLocalNode()
        });

        console.log('Uninstall response:', response);

        // Handle different response structures
        const results = response.result?.results ||
            response.results ||
            (response.result ? [response.result] : []);

        if (results.length > 0) {
            results.forEach(result => {
                const appName = result.appName || result.name;
                const row = document.querySelector(`tr[data-app-name="${appName}"]`);
                if (row) {
                    const status = row.querySelector('.action-status');
                    if (result.verified) {
                        status.textContent = 'Uninstalled';
                        status.className = 'action-status verified';
                        setTimeout(() => row.remove(), 2000);
                    } else if (result.status === 'pending_verification') {
                        status.textContent = 'Check Later';
                        status.className = 'action-status verifying';
                        status.title = result.message || 'Uninstall in progress, refresh to verify';
                    } else if (result.status === 'error' || result.status === 'failed') {
                        status.textContent = 'Failed';
                        status.className = 'action-status failed';
                        status.title = result.message || 'Uninstall failed';
                    } else {
                        status.textContent = result.status || 'Unknown';
                        status.className = 'action-status';
                    }
                }
            });
        } else if (!response.success) {
            // Handle error response
            appNames.forEach(name => {
                const row = document.querySelector(`tr[data-app-name="${name}"]`);
                if (row) {
                    const status = row.querySelector('.action-status');
                    status.textContent = 'Error';
                    status.className = 'action-status failed';
                    status.title = response.error || 'Unknown error';
                }
            });
        }

        updateStatus('', 'Complete');
        await logAudit('uninstallApp', { apps: appNames, result: response.result });
    } catch (error) {
        console.error('Uninstall failed:', error);
        updateStatus('error', 'Uninstall failed');

        // Mark all as failed in UI
        appNames.forEach(name => {
            const row = document.querySelector(`tr[data-app-name="${name}"]`);
            if (row) {
                const status = row.querySelector('.action-status');
                status.textContent = 'Error';
                status.className = 'action-status failed';
            }
        });
    }
}

// Internet/Browser Controls
async function controlInternet(action) {
    try {
        updateStatus('pending', `${action}ing internet...`);
        const response = await api('/action', 'POST', {
            nodeId: state.currentNodeId,
            action: action === 'Enable' ? 'enableInternet' : 'disableInternet'
        });

        document.getElementById('internet-status').textContent =
            response.result?.status?.internetEnabled ? 'Enabled' : 'Disabled';

        updateStatus('', 'Complete');
        await logAudit(`${action.toLowerCase()}Internet`, { result: response.result });
    } catch (error) {
        console.error('Internet control failed:', error);
        updateStatus('error', 'Control failed');
    }
}

async function controlBrowsers(action) {
    try {
        updateStatus('pending', `${action}ing browsers...`);
        const response = await api('/action', 'POST', {
            nodeId: state.currentNodeId,
            action: action === 'Enable' ? 'enableBrowsers' : 'disableBrowsers'
        });

        document.getElementById('browser-status').textContent =
            response.result?.status?.browsersBlocked ? 'Blocked' : 'Allowed';

        updateStatus('', 'Complete');
        await logAudit(`${action.toLowerCase()}Browsers`, { result: response.result });
    } catch (error) {
        console.error('Browser control failed:', error);
        updateStatus('error', 'Control failed');
    }
}

// Global Controls - Apply to all PCs
async function globalControl(action) {
    const actionLabels = {
        enableInternet: 'Enabling internet',
        disableInternet: 'Disabling internet',
        enableBrowsers: 'Enabling browsers',
        disableBrowsers: 'Disabling browsers',
        setTime: 'Syncing system time',
        enableWebRestriction: 'Enabling web restriction',
        disableWebRestriction: 'Disabling web restriction'
    };

    const nodes = Array.from(state.nodes.values());

    if (nodes.length === 0) {
        alert('No PCs registered. Add PCs first.');
        return;
    }

    const confirmed = await confirm(
        'Global Control',
        `${actionLabels[action]} on ${nodes.length} PC(s). Continue?`
    );

    if (!confirmed) return;

    updateStatus('pending', `${actionLabels[action]} on all PCs...`);

    let successCount = 0;
    let failCount = 0;

    // Execute on all nodes in parallel
    const promises = nodes.map(async (node) => {
        try {
            const reqBody = {
                nodeId: node.id,
                action: action
            };
            if (action === 'setTime') {
                reqBody.params = { Time: 'AUTO' };
            }

            await api('/action', 'POST', reqBody);
            successCount++;
        } catch (error) {
            console.error(`Failed for ${node.name}:`, error);
            failCount++;
        }
    });

    await Promise.all(promises);

    if (failCount === 0) {
        updateStatus('', `${actionLabels[action]} completed on all ${successCount} PC(s)`);
    } else {
        updateStatus('error', `${successCount} succeeded, ${failCount} failed`);
    }

    await logAudit(`global_${action}`, { total: nodes.length, success: successCount, failed: failCount });
}

// ── Results Modal ───────────────────────────────────────────────────────
function showResultsModal(title, rows) {
    document.getElementById('results-modal-title').textContent = title;
    document.getElementById('results-modal-body').innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
            <thead>
                <tr style="border-bottom:1px solid var(--border-primary);">
                    <th style="text-align:left;padding:6px 8px;color:var(--text-muted)">PC</th>
                    <th style="text-align:left;padding:6px 8px;color:var(--text-muted)">Status</th>
                    <th style="text-align:left;padding:6px 8px;color:var(--text-muted)">Detail</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(r => `
                    <tr style="border-bottom:1px solid var(--border-secondary);">
                        <td style="padding:6px 8px;font-weight:500">${escapeHtml(r.name)}</td>
                        <td style="padding:6px 8px;">
                            <span class="action-status ${r.ok ? 'verified' : 'failed'}">${r.ok ? '✓ Success' : '✗ Failed'}</span>
                        </td>
                        <td style="padding:6px 8px;color:var(--text-secondary);font-size:0.8rem">${escapeHtml(r.detail || '')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <div style="margin-top:12px;padding:8px 12px;background:var(--bg-tertiary);border-radius:var(--radius-md);font-size:0.8rem;color:var(--text-secondary)">
            ✓ ${rows.filter(r => r.ok).length} succeeded &nbsp;|&nbsp; ✗ ${rows.filter(r => !r.ok).length} failed
        </div>
    `;
    openModal('results-modal');
}

// ── Web Access Whitelist ───────────────────────────────────────────────
async function loadUrls() {
    try {
        const response = await fetch('/api/url-whitelist');
        const data = await response.json();
        const urlsTA = document.getElementById('allowed-urls');
        if (urlsTA && data.urls) urlsTA.value = data.urls.join('\n');
    } catch { /* ignore */ }
}

async function handleSaveUrls(e) {
    e.preventDefault();
    const raw = document.getElementById('allowed-urls').value;
    const urls = raw.split('\n').map(s => s.trim()).filter(Boolean);
    try {
        await fetch('/api/url-whitelist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls })
        });
        alert(`✅ Whitelist saved (${urls.length} URL(s))`);
        closeAllModals();
    } catch (err) {
        alert('Failed to save: ' + err.message);
    }
}

async function handleGlobalWebRestriction(action) {
    const nodes = state.nodes;
    if (nodes.length === 0) { alert('No PCs registered.'); return; }

    const msg = action === 'Enable' 
        ? `Block all web access EXCEPT whitelisted URLs on ${nodes.length} PC(s)?`
        : `Restore full web access on ${nodes.length} PC(s)?`;
    
    const confirmed = await confirm('Web Restriction', msg);
    if (!confirmed) return;

    updateStatus('pending', `${action === 'Enable' ? 'Enabling' : 'Disabling'} web restriction...`);

    const rows = await Promise.all(nodes.map(async node => {
        try {
            const r = await api('/action', 'POST', {
                nodeId: node.id,
                action: action === 'Enable' ? 'enableWebRestriction' : 'disableWebRestriction'
            });
            const detail = r.result?.status || r.error || '';
            const ok = r.success && (r.result?.success !== false);
            return { name: node.name, ok, detail };
        } catch (err) {
            return { name: node.name, ok: false, detail: err.message };
        }
    }));

    const failed = rows.filter(r => !r.ok).length;
    updateStatus(failed === 0 ? '' : 'error', `Web restriction: ${rows.length - failed} OK, ${failed} failed`);
    showResultsModal(`${action === 'Enable' ? 'Enable' : 'Disable'} Web Restriction Results`, rows);
    await logAudit(`global_webRestriction_${action}`, { total: nodes.length, success: rows.length - failed });
}




// Audit Logs
async function loadAuditLogs() {
    try {
        const filter = elements.auditFilter.value;
        const params = filter ? `?action=${filter}` : '';
        const response = await api(`/audit${params}`);

        elements.auditTbody.innerHTML = (response.logs || []).map(log => `
            <tr>
                <td>${formatTime(log.timestamp)}</td>
                <td>${escapeHtml(log.nodeId || 'N/A')}</td>
                <td>${escapeHtml(log.action)}</td>
                <td><span class="action-status ${log.status}">${log.status}</span></td>
                <td>${escapeHtml(JSON.stringify(log.details).substring(0, 50))}...</td>
            </tr>
        `).join('') || '<tr><td colspan="5">No audit logs</td></tr>';
    } catch (error) {
        console.error('Failed to load audit logs:', error);
    }
}

async function logAudit(action, details) {
    try {
        await api('/audit', 'POST', {
            nodeId: state.currentNodeId,
            action,
            details
        });
    } catch (error) {
        console.error('Failed to log audit:', error);
    }
}

// Auto Refresh
function startAutoRefresh() {
    state.refreshInterval = setInterval(async () => {
        if (state.nodes.length === 0) return;

        // Active refresh: ping all nodes to check status
        const promises = state.nodes.map(node =>
            api('/metrics', 'POST', {
                nodeId: node.id,
                local: isLocalNodeById(node.id)
            }).catch(err => {
                console.warn(`Failed to ping node ${node.name}:`, err);
            })
        );

        // Wait for pings to complete (status updates in backend)
        await Promise.all(promises);

        // Then reload nodes to get fresh status
        if (document.getElementById('dashboard-view').classList.contains('active')) {
            // Add cache busting timestamp to prevent browser caching
            const response = await api(`/nodes?t=${Date.now()}`);
            if (response.nodes) {
                state.nodes = response.nodes;
                renderNodes();
                updateStats();
            }
        }
    }, 15000); // 15 seconds interval
}

function isLocalNodeById(nodeId) {
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return false;
    const host = (node.hostname || node.ipAddress || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

// Utility Functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString();
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ── App Whitelist ──────────────────────────────────────────────────────────

// In-memory working copy of the whitelist (app names as strings)
let _awApps = [];

/**
 * Open the App Whitelist modal and load current list from server
 */
async function openAppWhitelistModal() {
    try {
        const res = await fetch('/api/app-whitelist');
        const data = await res.json();
        _awApps = data.apps || [];
    } catch (e) {
        _awApps = [];
    }
    awRenderList();
    awSwitchTab('edit');
    openModal('app-whitelist-modal');

    // Wire up controls (safe to call multiple times – they check for existing listeners via replacing element)
    document.getElementById('aw-search').oninput = () => awRenderList();
    document.getElementById('aw-select-all').onchange = (e) => {
        document.querySelectorAll('.aw-checkbox').forEach(cb => cb.checked = e.target.checked);
        awUpdateRemoveButton();
    };
    document.getElementById('aw-remove-selected').onclick = awRemoveSelected;
    document.getElementById('aw-add-btn').onclick = awAddManual;
    document.getElementById('aw-add-input').onkeydown = (e) => { if (e.key === 'Enter') awAddManual(); };
    document.getElementById('aw-scan-btn').onclick = awScanThisPC;
    document.getElementById('aw-save-btn').onclick = awSave;
}

/** Switch between Edit / Preview tabs inside the modal */
function awSwitchTab(tab) {
    document.getElementById('aw-tab-edit').style.display    = tab === 'edit'    ? '' : 'none';
    document.getElementById('aw-tab-preview').style.display = tab === 'preview' ? '' : 'none';
    document.getElementById('aw-tab-edit-btn').classList.toggle('active',    tab === 'edit');
    document.getElementById('aw-tab-preview-btn').classList.toggle('active', tab === 'preview');
    if (tab === 'preview') awRunPreview();
}

/** Render the whitelisted app rows in the Edit tab */
function awRenderList() {
    const search = (document.getElementById('aw-search')?.value || '').toLowerCase();
    const filtered = _awApps.filter(a => a.toLowerCase().includes(search));
    const container = document.getElementById('aw-app-list');

    if (filtered.length === 0) {
        container.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.85rem;">
            ${_awApps.length === 0 ? '📭 No apps in whitelist yet. Click "Scan This PC" to populate.' : '🔍 No results for that search.'}
        </div>`;
    } else {
        container.innerHTML = filtered.map((app, idx) => `
            <div class="aw-app-row" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--border-secondary);">
                <input type="checkbox" class="aw-checkbox" data-app="${escapeHtml(app)}" onchange="awUpdateRemoveButton()">
                <span style="flex:1;font-size:0.85rem;">${escapeHtml(app)}</span>
                <button onclick="awRemoveOne('${escapeHtml(app)}')"
                    style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;line-height:1;" title="Remove">✕</button>
            </div>
        `).join('');
    }

    document.getElementById('aw-app-count').textContent = `${_awApps.length} app${_awApps.length !== 1 ? 's' : ''}`;
    document.getElementById('aw-select-all').checked = false;
    awUpdateRemoveButton();
}

function awUpdateRemoveButton() {
    const anyChecked = document.querySelectorAll('.aw-checkbox:checked').length > 0;
    document.getElementById('aw-remove-selected').disabled = !anyChecked;
}

function awRemoveOne(appName) {
    _awApps = _awApps.filter(a => a !== appName);
    awRenderList();
}

function awRemoveSelected() {
    const toRemove = new Set(
        Array.from(document.querySelectorAll('.aw-checkbox:checked')).map(cb => cb.dataset.app)
    );
    _awApps = _awApps.filter(a => !toRemove.has(a));
    awRenderList();
}

function awAddManual() {
    const input = document.getElementById('aw-add-input');
    const name = input.value.trim();
    if (!name) return;
    if (!_awApps.includes(name)) {
        _awApps.push(name);
        _awApps.sort((a, b) => a.localeCompare(b));
    }
    input.value = '';
    awRenderList();
}

/** Scan this PC's installed apps and add them all to the whitelist */
async function awScanThisPC() {
    const btn = document.getElementById('aw-scan-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Scanning…';
    try {
        const res = await api('/action', 'POST', {
            action: 'listApps',
            local: true
        });
        const apps = res.result?.applications || res.result?.output?.applications || [];
        let added = 0;
        apps.forEach(app => {
            const name = app.Name || app.name;
            if (name && !_awApps.includes(name)) {
                _awApps.push(name);
                added++;
            }
        });
        _awApps.sort((a, b) => a.localeCompare(b));
        awRenderList();
        btn.textContent = `✅ Added ${added} app${added !== 1 ? 's' : ''}`;
        setTimeout(() => { btn.textContent = '🔍 Scan This PC'; btn.disabled = false; }, 2500);
    } catch (err) {
        btn.textContent = '❌ Scan failed';
        setTimeout(() => { btn.textContent = '🔍 Scan This PC'; btn.disabled = false; }, 2000);
    }
}

/** Save the current in-memory list to the server */
async function awSave() {
    try {
        const res = await fetch('/api/app-whitelist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apps: _awApps })
        });
        const data = await res.json();
        if (data.success) {
            const btn = document.getElementById('aw-save-btn');
            btn.textContent = `✅ Saved (${data.appCount} apps)`;
            setTimeout(() => { btn.textContent = '💾 Save Whitelist'; }, 2200);
        } else {
            alert('Save failed: ' + (data.error || 'Unknown error'));
        }
    } catch (err) {
        alert('Save failed: ' + err.message);
    }
}

/** Run a Preview action on this server PC and display results in the Preview tab */
async function awRunPreview() {
    const loading = document.getElementById('aw-preview-loading');
    const results = document.getElementById('aw-preview-results');
    loading.style.display = '';
    results.innerHTML = '';

    // First save current list so PS uses the latest
    try {
        await fetch('/api/app-whitelist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apps: _awApps })
        });
    } catch (_) { /* non-fatal */ }

    try {
        const res = await api('/action', 'POST', {
            action: 'previewAppWhitelist',
            local: true
        });

        const d = res.result || {};
        const toUninstall = d.toUninstall || d.output?.toUninstall || [];
        const whitelisted  = d.whitelisted  || d.output?.whitelisted  || [];

        loading.style.display = 'none';
        results.innerHTML = `
            <div style="display:flex;gap:10px;margin-bottom:12px;">
                <div style="flex:1;padding:10px;background:var(--bg-tertiary);border-radius:var(--radius-md);text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--success)">${whitelisted.length}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">Whitelisted (kept)</div>
                </div>
                <div style="flex:1;padding:10px;background:var(--bg-tertiary);border-radius:var(--radius-md);text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--danger)">${toUninstall.length}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">To be uninstalled</div>
                </div>
            </div>
            ${toUninstall.length === 0
                ? '<p style="color:var(--success);font-size:0.875rem;">✅ All installed apps are whitelisted. Nothing would be uninstalled.</p>'
                : `<p style="color:var(--danger);font-size:0.85rem;margin-bottom:8px;">⚠️ The following apps would be <strong>uninstalled</strong> from this PC when you Enforce:</p>
                   <div style="border:1px solid var(--danger);border-radius:var(--radius-md);overflow:hidden;">
                     ${toUninstall.map(app => `
                       <div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--border-secondary);font-size:0.82rem;">
                           <span>${escapeHtml(app.Name || app.name)}</span>
                           <span style="color:var(--text-muted)">${app.Publisher ? escapeHtml(app.Publisher) : ''}</span>
                       </div>`).join('')}
                   </div>`
            }
        `;
    } catch (err) {
        loading.style.display = 'none';
        results.innerHTML = `<p style="color:var(--danger)">❌ Preview failed: ${escapeHtml(err.message)}</p>`;
    }
}

/** Quick "Preview" button on dashboard – opens modal on the Preview tab */
async function handleGlobalPreviewApps() {
    await openAppWhitelistModal();
    awSwitchTab('preview');
}

/** "Enforce on All" – uninstall non-whitelisted apps on every registered PC */
async function handleGlobalEnforceApps() {
    const nodes = state.nodes;
    if (nodes.length === 0) { alert('No PCs registered.'); return; }

    const confirmed = await confirm(
        '⚠️ Enforce App Whitelist',
        `This will UNINSTALL all applications NOT in the whitelist on ${nodes.length} PC(s). This cannot be undone. Continue?`
    );
    if (!confirmed) return;

    updateStatus('pending', 'Enforcing app whitelist on all PCs…');

    const rows = await Promise.all(nodes.map(async node => {
        try {
            const r = await api('/action', 'POST', {
                nodeId: node.id,
                action: 'enforceAppWhitelist'
            });
            const d = r.result || {};
            const ok = r.success && (d.success !== false);
            const detail = ok
                ? `✓ ${d.successful ?? 0} uninstalled, ${d.failed ?? 0} failed, ${d.pending ?? 0} pending`
                : (r.error || d.error || 'Failed');
            return { name: node.name, ok, detail };
        } catch (err) {
            return { name: node.name, ok: false, detail: err.message };
        }
    }));

    const failed = rows.filter(r => !r.ok).length;
    updateStatus(failed === 0 ? '' : 'error',
        `App whitelist enforced: ${rows.length - failed} OK, ${failed} failed`);
    showResultsModal('App Whitelist Enforcement Results', rows);
    await logAudit('global_enforceAppWhitelist', {
        total: nodes.length,
        success: rows.length - failed,
        failed
    });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

