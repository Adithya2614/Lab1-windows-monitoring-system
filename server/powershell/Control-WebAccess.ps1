param (
    [Parameter(Mandatory=$true)]
    [ValidateSet("Enable", "Disable")]
    [string]$Action,

    [Parameter(Mandatory=$false)]
    [string[]]$AllowedUrls = @()
)

$ErrorActionPreference = "Stop"

function Set-RegistryPolicy {
    param($Path, $Name, $Value, $Type = "String")
    if (!(Test-Path $Path)) {
        New-Item -Path $Path -Force | Out-Null
    }
    Set-ItemProperty -Path $Path -Name $Name -Value $Value -Type $Type -Force | Out-Null
}

function Remove-RegistryPolicy {
    param($Path, $Name)
    if (Test-Path $Path) {
        Remove-ItemProperty -Path $Path -Name $Name -ErrorAction SilentlyContinue | Out-Null
    }
}

function Clear-RegistryKey {
    param($Path)
    if (Test-Path $Path) {
        Remove-Item -Path $Path -Recurse -Force -ErrorAction SilentlyContinue | Out-Null
    }
}

$RegistryPaths = @(
    "HKLM:\SOFTWARE\Policies\Google\Chrome",
    "HKLM:\SOFTWARE\Policies\Microsoft\Edge"
)

$results = @{
    success = $true
    action = $Action
    affectedBrowsers = @("Chrome", "Edge")
}

try {
    if ($Action -eq "Enable") {
        # Enable URL Whitelisting
        foreach ($basePath in $RegistryPaths) {
            # 1. Set Blocklist to *
            $blocklistPath = "$basePath\URLBlocklist"
            Set-RegistryPolicy -Path $blocklistPath -Name "1" -Value "*"
            
            # 2. Set Allowlist
            $allowlistPath = "$basePath\URLAllowlist"
            Clear-RegistryKey -Path $allowlistPath
            
            # Always allow local access if needed, or just follow the provided list
            # We add a counter for indexed entries
            $i = 1
            foreach ($url in $AllowedUrls) {
                if ($url -ne "") {
                    Set-RegistryPolicy -Path $allowlistPath -Name [string]$i -Value $url
                    $i++
                }
            }
        }
        $results.status = "Whitelisting enabled"
        $results.allowedCount = $AllowedUrls.Count
    }
    else {
        # Disable URL Whitelisting (Restore full access)
        foreach ($basePath in $RegistryPaths) {
            Clear-RegistryKey -Path "$basePath\URLBlocklist"
            Clear-RegistryKey -Path "$basePath\URLAllowlist"
        }
        $results.status = "Whitelisting disabled (Full access restored)"
    }
    
    # Force policy refresh (not always needed for these keys but helpful)
    # gpupdate /force is too slow/heavy for WinRM often, these registry keys are applied immediately on refresh or next navigation
}
catch {
    $results.success = $false
    $results.error = $_.Exception.Message
}

$results | ConvertTo-Json
