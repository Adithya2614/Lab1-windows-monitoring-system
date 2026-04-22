# Manage-Applications.ps1
# List, search, and uninstall applications with verification
# Returns JSON formatted output

param(
    [string]$Action = "List",
    [string]$SearchTerm = "",
    [string]$AppName = "",
    [string]$UninstallString = "",
    [string[]]$AppNames = @()
)

$ErrorActionPreference = "SilentlyContinue"


function Get-InstalledApps {
    $apps = @()
    
    # Get traditional registry-based apps
    $regPaths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    
    foreach ($path in $regPaths) {
        $apps += Get-ItemProperty $path -ErrorAction SilentlyContinue | 
        Where-Object { $_.DisplayName } |
        Select-Object @{N = 'Name'; E = { $_.DisplayName } }, 
        @{N = 'Version'; E = { $_.DisplayVersion } }, 
        Publisher, 
        InstallDate, 
        @{N = 'SizeMB'; E = { if ($_.EstimatedSize) { [math]::Round($_.EstimatedSize / 1024, 2) } else { 0 } } },
        UninstallString,
        @{N = 'QuietUninstallString'; E = { $_.QuietUninstallString } },
        @{N = 'RegistryPath'; E = { $_.PSPath } },
        @{N = 'AppType'; E = { 'Win32' } },
        @{N = 'PackageFullName'; E = { $null } }
    }
    
    # Get Microsoft Store apps (AppX packages)
    try {
        $appxPackages = Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue
        foreach ($pkg in $appxPackages) {
            # Skip system apps and framework packages
            if ($pkg.IsFramework -or $pkg.SignatureKind -eq 'System') {
                continue
            }
            
            $apps += [PSCustomObject]@{
                Name                 = $pkg.Name
                Version              = $pkg.Version
                Publisher            = $pkg.Publisher
                InstallDate          = $pkg.InstallDate
                SizeMB               = 0
                UninstallString      = $null
                QuietUninstallString = $null
                RegistryPath         = $null
                AppType              = 'Store'
                PackageFullName      = $pkg.PackageFullName
            }
        }
    }
    catch {
        # AppX cmdlets might not be available in some environments
        Write-Warning "Could not retrieve Store apps: $($_.Exception.Message)"
    }
    
    return $apps | Sort-Object Name -Unique
}

function Search-Apps {
    param([string]$Term)
    
    $allApps = Get-InstalledApps
    $filtered = $allApps | Where-Object { 
        $_.Name -like "*$Term*" -or 
        $_.Publisher -like "*$Term*" 
    }
    
    return $filtered
}

function Uninstall-Application {
    param(
        [string]$Name,
        [string]$UninstallCmd,
        [string]$RegistryPath
    )
    
    $result = @{
        appName  = $Name
        status   = "pending"
        exitCode = $null
        message  = ""
        verified = $false
    }
    
    # First verify the app exists
    $appExists = Get-InstalledApps | Where-Object { $_.Name -eq $Name }
    if (-not $appExists) {
        $result.status = "error"
        $result.message = "Application not found"
        return $result
    }
    
    $result.status = "uninstalling"
    
    try {
        # Check if it's a Store app
        if ($appExists.AppType -eq 'Store' -and $appExists.PackageFullName) {
            # Uninstall Store app using Remove-AppxPackage
            try {
                Remove-AppxPackage -Package $appExists.PackageFullName -AllUsers -ErrorAction Stop
                $result.exitCode = 0
                $result.verified = $true
                $result.status = "verified"
                $result.message = "Store app uninstalled successfully"
                return $result
            }
            catch {
                $result.status = "error"
                $result.exitCode = 1
                $result.message = "Failed to uninstall Store app: $($_.Exception.Message)"
                return $result
            }
        }
        
        # Handle traditional Win32 apps
        # Determine uninstall command
        $cmd = if ($UninstallCmd) { $UninstallCmd } else { $appExists.UninstallString }
        $quietCmd = $appExists.QuietUninstallString
        
        if (-not $cmd) {
            $result.status = "error"
            $result.message = "No uninstall command found"
            return $result
        }
        
        # Try quiet uninstall first
        if ($quietCmd) {
            $cmd = $quietCmd
        }
        else {
            # Add silent flags for common installers
            if ($cmd -match "msiexec") {
                $cmd = $cmd -replace "/I", "/X"
                if ($cmd -notmatch "/quiet|/qn") {
                    $cmd += " /quiet /norestart"
                }
            }
            elseif ($cmd -match "\.exe") {
                # Common silent uninstall flags
                $cmd += " /S /silent /quiet /SILENT /VERYSILENT /norestart"
            }
        }
        
        # Execute uninstall with timeout (max 30 seconds wait)
        $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd -PassThru -WindowStyle Hidden -ErrorAction Stop
        
        # Wait up to 30 seconds for process to complete
        $completed = $process.WaitForExit(30000)
        
        if ($completed) {
            $result.exitCode = $process.ExitCode
        }
        else {
            # Process still running - it's doing background uninstall
            $result.exitCode = -1
            $result.status = "pending_verification"
            $result.message = "Uninstall started but taking longer than expected. Check back later."
        }
        
        # Brief wait for registry to update
        Start-Sleep -Seconds 2
        
        # Verify uninstall by checking registry
        $stillExists = Get-InstalledApps | Where-Object { $_.Name -eq $Name }
        
        if (-not $stillExists) {
            $result.status = "verified"
            $result.verified = $true
            $result.message = "Application successfully uninstalled and verified"
        }
        elseif ($result.exitCode -eq 0) {
            $result.status = "pending_verification"
            $result.message = "Uninstall command completed but app still found in registry. May require restart."
        }
        else {
            $result.status = "failed"
            $result.message = "Uninstall failed with exit code: $($result.exitCode)"
        }
    }
    catch {
        $result.status = "error"
        $result.message = $_.Exception.Message
    }
    
    return $result
}

function Uninstall-MultipleApps {
    param([string[]]$Names)
    
    $results = @()
    
    foreach ($name in $Names) {
        $results += Uninstall-Application -Name $name
    }
    
    return @{
        success    = ($results | Where-Object { $_.verified }).Count -eq $results.Count
        totalApps  = $results.Count
        successful = ($results | Where-Object { $_.verified }).Count
        failed     = ($results | Where-Object { $_.status -eq "failed" -or $_.status -eq "error" }).Count
        pending    = ($results | Where-Object { $_.status -eq "pending_verification" }).Count
        results    = $results
    }
}

# Main execution
switch ($Action) {
    "List" {
        $apps = Get-InstalledApps
        @{
            success      = $true
            count        = $apps.Count
            applications = $apps
        } | ConvertTo-Json -Depth 5 -Compress
    }
    "Search" {
        if (-not $SearchTerm) {
            @{
                success = $false
                error   = "SearchTerm is required for Search action"
            } | ConvertTo-Json -Compress
        }
        else {
            $apps = Search-Apps -Term $SearchTerm
            @{
                success      = $true
                searchTerm   = $SearchTerm
                count        = $apps.Count
                applications = $apps
            } | ConvertTo-Json -Depth 5 -Compress
        }
    }
    "Uninstall" {
        if ($AppNames.Count -gt 0) {
            Uninstall-MultipleApps -Names $AppNames | ConvertTo-Json -Depth 5 -Compress
        }
        elseif ($AppName) {
            $result = Uninstall-Application -Name $AppName -UninstallCmd $UninstallString
            @{
                success = $result.verified
                result  = $result
            } | ConvertTo-Json -Depth 5 -Compress
        }
        else {
            @{
                success = $false
                error   = "AppName or AppNames is required for Uninstall action"
            } | ConvertTo-Json -Compress
        }
    }
    default {
        @{
            success = $false
            error   = "Invalid action. Valid actions: List, Search, Uninstall"
        } | ConvertTo-Json -Compress
    }
}
