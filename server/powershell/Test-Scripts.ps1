# Test-Scripts.ps1
# Test script to verify PowerShell components work correctly

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "========================================"
Write-Host "Windows Monitoring System - Script Test"
Write-Host "========================================"
Write-Host ""

# Test 1: System Metrics
Write-Host "TEST 1: Get-SystemMetrics.ps1" -ForegroundColor Yellow
Write-Host "Collecting system metrics via WMI..."
try {
    $metricsResult = & "$ScriptDir\Get-SystemMetrics.ps1" | ConvertFrom-Json
    if ($metricsResult.success) {
        Write-Host "  OK - CPU: $($metricsResult.cpu.usagePercent)%" -ForegroundColor Green
        Write-Host "  OK - RAM: $($metricsResult.ram.usedGB)/$($metricsResult.ram.totalGB) GB" -ForegroundColor Green
        Write-Host "  OK - Disk C: $($metricsResult.disks[0].usedGB)/$($metricsResult.disks[0].totalGB) GB" -ForegroundColor Green
        Write-Host "  OK - Network: $($metricsResult.network.type)" -ForegroundColor Green
        Write-Host "  OK - Internet: $(if($metricsResult.internet.connected){'Connected'}else{'Disconnected'})" -ForegroundColor Green
        Write-Host "  OK - USB Devices: $($metricsResult.usb.count)" -ForegroundColor Green
        Write-Host "  OK - Applications: $($metricsResult.applications.count)" -ForegroundColor Green
        Write-Host "  PASSED" -ForegroundColor Green
    }
    else {
        Write-Host "  FAILED: Metrics returned success=false" -ForegroundColor Red
    }
}
catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Application Management - List
Write-Host "TEST 2: Manage-Applications.ps1 -Action List" -ForegroundColor Yellow
Write-Host "Listing installed applications..."
try {
    $appsResult = & "$ScriptDir\Manage-Applications.ps1" -Action List | ConvertFrom-Json
    if ($appsResult.success) {
        Write-Host "  OK - Found $($appsResult.count) applications" -ForegroundColor Green
        Write-Host "  PASSED" -ForegroundColor Green
    }
    else {
        Write-Host "  FAILED: $($appsResult.error)" -ForegroundColor Red
    }
}
catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Application Management - Search
Write-Host "TEST 3: Manage-Applications.ps1 -Action Search" -ForegroundColor Yellow
Write-Host "Searching applications..."
try {
    $searchResult = & "$ScriptDir\Manage-Applications.ps1" -Action Search -SearchTerm "Windows" | ConvertFrom-Json
    if ($searchResult.success) {
        Write-Host "  OK - Found $($searchResult.count) matching applications" -ForegroundColor Green
        Write-Host "  PASSED" -ForegroundColor Green
    }
    else {
        Write-Host "  FAILED: $($searchResult.error)" -ForegroundColor Red
    }
}
catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: File Management - List
Write-Host "TEST 4: Manage-Files.ps1 -Action List" -ForegroundColor Yellow
Write-Host "Listing files..."
try {
    $filesResult = & "$ScriptDir\Manage-Files.ps1" -Action List -Path "C:\" | ConvertFrom-Json
    if ($filesResult.success) {
        Write-Host "  OK - Path exists: $($filesResult.data.exists)" -ForegroundColor Green
        Write-Host "  OK - Files: $($filesResult.data.totalFiles), Folders: $($filesResult.data.totalFolders)" -ForegroundColor Green
        Write-Host "  PASSED" -ForegroundColor Green
    }
    else {
        Write-Host "  FAILED: Path not accessible" -ForegroundColor Red
    }
}
catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: File Management - Search
Write-Host "TEST 5: Manage-Files.ps1 -Action Search" -ForegroundColor Yellow
Write-Host "Searching files..."
try {
    $searchFilesResult = & "$ScriptDir\Manage-Files.ps1" -Action Search -Path "C:\Windows" -SearchTerm "notepad" | ConvertFrom-Json
    if ($searchFilesResult.success) {
        Write-Host "  OK - Found $($searchFilesResult.data.count) matches" -ForegroundColor Green
        Write-Host "  PASSED" -ForegroundColor Green
    }
    else {
        Write-Host "  FAILED: $($searchFilesResult.data.error)" -ForegroundColor Red
    }
}
catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 6: Internet Control - Status
Write-Host "TEST 6: Control-Internet.ps1 -Action Status" -ForegroundColor Yellow
Write-Host "Checking internet control status..."
try {
    $internetResult = & "$ScriptDir\Control-Internet.ps1" -Action Status | ConvertFrom-Json
    if ($internetResult.success) {
        Write-Host "  OK - Internet Enabled: $($internetResult.status.internetEnabled)" -ForegroundColor Green
        Write-Host "  OK - Actual Connectivity: $($internetResult.status.actualConnectivity)" -ForegroundColor Green
        Write-Host "  PASSED" -ForegroundColor Green
    }
    else {
        Write-Host "  FAILED: $($internetResult.error)" -ForegroundColor Red
    }
}
catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 7: Browser Control - Status
Write-Host "TEST 7: Control-Browsers.ps1 -Action Status" -ForegroundColor Yellow
Write-Host "Checking browser control status..."
try {
    $browserResult = & "$ScriptDir\Control-Browsers.ps1" -Action Status | ConvertFrom-Json
    if ($browserResult.success) {
        Write-Host "  OK - Browsers Blocked: $($browserResult.status.browsersBlocked)" -ForegroundColor Green
        Write-Host "  OK - Installed Browsers: $($browserResult.status.installedBrowsers.Count)" -ForegroundColor Green
        Write-Host "  PASSED" -ForegroundColor Green
    }
    else {
        Write-Host "  FAILED: $($browserResult.error)" -ForegroundColor Red
    }
}
catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "========================================"
Write-Host "All PowerShell script tests completed!"
Write-Host "========================================"
Write-Host ""
Write-Host "To run the full system, install Node.js and run:"
Write-Host "  cd c:\WMI"
Write-Host "  npm install"
Write-Host "  npm start"
Write-Host ""
Write-Host "Then open http://localhost:3000 in your browser"
