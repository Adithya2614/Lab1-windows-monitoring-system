# Setup-Remote-PC.ps1
# Run this script as Administrator on the TARGET PC you want to monitor

Write-Host "Configuring generic Windows Remote Management (WinRM)..." -ForegroundColor Cyan

# 1. Enable WinRM
Write-Host "Enabling WinRM..."
Enable-PSRemoting -Force -SkipNetworkProfileCheck -ErrorAction SilentlyContinue

# 2. Configure TrustedHosts (Allow connection from the Monitor Server)
# We set it to "*" to allow any server on the local network to check it.
# For stricter security, change "*" to the IP address of your Monitor Server.
Write-Host "Configuring TrustedHosts to allow connections..."
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force

# 3. Enable CredSSP (Optional, but helps with some remote commands)
Write-Host "Enabling CredSSP..."
Enable-WSManCredSSP -Role Server -Force -ErrorAction SilentlyContinue

# 4. Configure Firewall (Allow WinRM ports)
Write-Host "Checking Firewall rules..."
# Usually enabled by Enable-PSRemoting, but valid double-check:
NetSh Advfirewall firewall add rule name="WinRM-HTTP" dir=in localport=5985 protocol=TCP action=allow
NetSh Advfirewall firewall add rule name="WinRM-HTTPS" dir=in localport=5986 protocol=TCP action=allow

# 4.5 Enable Remote Local Admin Access (Fixes "Access Denied" for local accounts over WinRM)
Write-Host "Setting LocalAccountTokenFilterPolicy to allow remote local admin access..."
New-ItemProperty -Name LocalAccountTokenFilterPolicy -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System -PropertyType DWord -Value 1 -Force -ErrorAction SilentlyContinue

# 5. Start and Set WinRM Service to Automatic
Write-Host "Configuring WinRM Service..."
Set-Service WinRM -StartupType Automatic
Start-Service WinRM

# 6. Verify Configuration
Write-Host "`n--- Configuration Complete ---" -ForegroundColor Green
Write-Host "Host Name: $env:COMPUTERNAME"
Write-Host "IP Address(es):"
Get-NetIPAddress | Where-Object { $_.AddressFamily -eq 'IPv4' -and $_.InterfaceAlias -notlike '*Loopback*' } | Select-Object -ExpandProperty IPAddress

Write-Host "`nYOU CAN NOW ADD THIS PC TO THE MONITOR DASHBOARD." -ForegroundColor Yellow
Write-Host "Note: You will need the Administrator Username and Password of this PC."
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
