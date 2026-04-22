# Lab1 — Windows Monitoring System

A comprehensive Windows-based lab monitoring platform with a Web Dashboard, REST API, PowerShell Engine, and WMI-based remote monitoring capabilities.

## Architecture

```
Windows Controller
 ├─ Web Dashboard (Dark Theme UI)
 ├─ REST API (Express.js)
 ├─ PowerShell Engine
 └─ Credential Manager (AES-256 Encrypted)
        ↓
   WinRM + WMI
        ↓
   Windows Target PCs
```

## Prerequisites

1. **Node.js** (v18 or higher) — [Download here](https://nodejs.org/)
2. **Windows PowerShell 5.1+** (included in Windows 10/11)
3. **WinRM enabled** on target PCs

## Quick Start

### 1. Install Dependencies

```powershell
npm install
```

### 2. Start the Server

```powershell
npm start
```

### 3. Access the Dashboard

Open your browser and navigate to: **http://localhost:3000**

## Project Structure

```
WMI/
├── server/                         # Backend API server
│   ├── index.js                    # Express server entry point
│   ├── routes/                     # API route handlers
│   │   ├── nodes.js                # PC management
│   │   ├── metrics.js              # System metrics
│   │   ├── actions.js              # Remote actions
│   │   ├── audit.js                # Audit logging
│   │   ├── credentials.js          # Credential management
│   │   ├── app-whitelist.js        # Application whitelist management
│   │   └── url-whitelist.js        # URL whitelist management
│   ├── services/                   # Business logic
│   │   ├── credential-manager.js   # AES-256-GCM credential encryption
│   │   └── powershell-engine.js    # PowerShell script executor
│   ├── powershell/                 # PowerShell scripts
│   │   ├── Get-SystemMetrics.ps1   # Collect system metrics
│   │   ├── Manage-Applications.ps1 # Application management
│   │   ├── Manage-Files.ps1        # File management
│   │   ├── Control-Internet.ps1    # Internet enable/disable
│   │   ├── Control-WebAccess.ps1   # Web access control
│   │   ├── Enforce-AppWhitelist.ps1# Application whitelist enforcement
│   │   ├── Set-Time.ps1            # Time synchronization
│   │   └── Test-Scripts.ps1        # Script testing utility
│   └── data/                       # Runtime data (auto-created)
│       ├── nodes.json              # Registered PC list
│       ├── allowed_apps.txt        # Whitelisted applications
│       ├── allowed_urls.txt        # Whitelisted URLs
│       └── exam-allowed-files/     # Exam-mode allowed files
├── dashboard/                      # Frontend web dashboard
│   ├── index.html                  # Main dashboard page
│   ├── css/styles.css              # Stylesheet
│   └── js/app.js                   # Frontend logic
├── Setup-Remote-PC.ps1             # Remote PC WinRM setup script
├── package.json
├── .gitignore
└── README.md
```

## Features

### System Monitoring (WMI)
- CPU, RAM, Disk usage
- System uptime
- Network type (Wi-Fi/Ethernet) and SSID
- Internet connectivity status
- USB device enumeration
- Installed applications list
- Running Store apps

### Application Management
- List all installed applications
- Search applications
- Multi-select uninstall with verification
- Application whitelist enforcement for exam mode

### File Management
- Browse files and folders
- Show hidden files
- Recursive folder view
- Search by name/extension
- Multi-select delete with Test-Path verification

### Internet & Web Control
- Enable/Disable internet via Windows Firewall
- Blocks WAN while keeping LAN + WinRM active
- URL whitelist management for controlled web access

### Browser Control
- Block/Unblock browsers (Chrome, Edge, Firefox, Brave, Opera)
- Uses Windows Firewall application rules

### Exam Mode
- Application whitelisting — only approved apps can run
- URL whitelisting — only approved websites accessible
- Time synchronization across all PCs

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/nodes` | List all PCs |
| GET | `/api/nodes/:id` | Get PC details |
| POST | `/api/nodes` | Register new PC |
| PUT | `/api/nodes/:id` | Update PC |
| DELETE | `/api/nodes/:id` | Remove PC |
| POST | `/api/metrics` | Collect metrics |
| GET | `/api/metrics/:nodeId` | Get cached metrics |
| POST | `/api/action` | Execute action |
| GET | `/api/action/:id` | Get action status |
| POST | `/api/audit` | Log audit event |
| GET | `/api/audit` | Get audit logs |
| POST | `/api/credentials` | Store credentials |
| GET | `/api/credentials/:nodeId` | Check credentials |
| DELETE | `/api/credentials/:nodeId` | Remove credentials |

## UI Features

- **Dark Theme** — Modern dark UI with glassmorphism effects
- **Grid/List Views** — Toggle between card and table layouts
- **Status Indicator** — Top-right corner shows action status
- **Verified Status** — Items remain visible until verification succeeds
- **Responsive Design** — Works on all screen sizes

## Post-Verification UI Rule

Items (files/applications) remain visible in the UI until verification succeeds:
- **Pending** → visible (yellow)
- **Verifying** → visible with spinner (blue)
- **Verified** → removed from list (green)
- **Failed** → visible with error (red)

## Setting Up WinRM on Target PCs

Run these commands as Administrator on each target PC, or use the included `Setup-Remote-PC.ps1` script:

```powershell
# Enable WinRM
Enable-PSRemoting -Force

# Allow remote connections
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force

# Configure firewall
Enable-NetFirewallRule -DisplayGroup "Windows Remote Management"
```

## Security Notes

- Credentials are encrypted using AES-256-GCM
- Encryption key is stored locally in `config/.key`
- Credentials are cached in memory for session duration
- WinRM uses authenticated connections
- `.gitignore` excludes sensitive files (`config/.key`, `credentials.enc`)

## Testing PowerShell Scripts Locally

```powershell
# Test system metrics collection
cd server\powershell
.\Get-SystemMetrics.ps1

# Test application listing
.\Manage-Applications.ps1 -Action List

# Test file listing
.\Manage-Files.ps1 -Action List -Path "C:\"

# Run the built-in test suite
.\Test-Scripts.ps1
```

## License

MIT
