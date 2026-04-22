# Control-Internet.ps1
# Enable/Disable internet while keeping LAN and WinRM active
# Uses Windows Firewall rules

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Enable", "Disable", "Status")]
    [string]$Action
)

$ErrorActionPreference = "Stop"

$ruleName = "WMI_Monitor_Block_Internet"

function Get-InternetStatus {
    $rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    
    $result = @{
        internetEnabled    = $true
        firewallRuleExists = $false
        ruleEnabled        = $false
    }
    
    if ($rule) {
        $result.firewallRuleExists = $true
        $result.ruleEnabled = $rule.Enabled -eq "True"
        $result.internetEnabled = -not $result.ruleEnabled
    }
    
    # Also check actual connectivity
    try {
        $ping = Test-Connection -ComputerName "8.8.8.8" -Count 1 -Quiet
        $result.actualConnectivity = $ping
    }
    catch {
        $result.actualConnectivity = $false
    }
    
    return $result
}

function Disable-Internet {
    # Remove existing rules
    Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName "${ruleName}_Allow_WinRM" -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName "${ruleName}_Allow_LAN" -ErrorAction SilentlyContinue
    
    # Get all local IPv4 address and their subnets to allow them
    $adapters = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -ne "WellKnown" }
    $allowedRanges = @("127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
    
    foreach ($ip in $adapters) {
        $octets = $ip.IPAddress.Split('.')
        if ($octets.Count -eq 4) {
            $allowedRanges += "$($octets[0]).$($octets[1]).0.0/16"
            $allowedRanges += "$($octets[0]).0.0.0/8"
        }
    }
    $allowedRanges = $allowedRanges | Select-Object -Unique

    # Create surgical block rule: Block everything EXCEPT local/private ranges
    # This prevents the PC from locking itself out of the management network
    New-NetFirewallRule -DisplayName $ruleName `
        -Description "WMI Monitor: Block Internet (LAN/WinRM Exempt)" `
        -Direction Outbound `
        -Action Block `
        -RemoteAddress Any `
        -ExceptRemoteAddress $allowedRanges `
        -Enabled True | Out-Null
    
    $status = Get-InternetStatus
    
    return @{
        success = -not $status.internetEnabled
        action  = "disable"
        message = if (-not $status.internetEnabled) { "Internet disabled. LAN access preserved." } else { "Failed to disable internet." }
        status  = $status
    }
}

function Enable-Internet {
    # Remove all rules related to our internet control
    Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName "${ruleName}_Allow_WinRM" -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName "${ruleName}_Allow_LAN" -ErrorAction SilentlyContinue
    
    $status = Get-InternetStatus
    
    return @{
        success = $status.internetEnabled
        action  = "enable"
        message = if ($status.internetEnabled) { "Internet enabled successfully." } else { "Successfully removed rules, verifying connectivity..." }
        status  = $status
    }
}

# Main execution
try {
    switch ($Action) {
        "Enable" {
            Enable-Internet | ConvertTo-Json -Depth 3 -Compress
        }
        "Disable" {
            Disable-Internet | ConvertTo-Json -Depth 3 -Compress
        }
        "Status" {
            @{
                success = $true
                status  = Get-InternetStatus
            } | ConvertTo-Json -Depth 3 -Compress
        }
    }
}
catch {
    @{
        success = $false
        error   = $_.Exception.Message
        action  = $Action
    } | ConvertTo-Json -Compress
}
