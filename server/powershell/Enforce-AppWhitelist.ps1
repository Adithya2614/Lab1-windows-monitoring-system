# Enforce-AppWhitelist.ps1
# Lists all installed applications, compares against whitelist, and uninstalls non-whitelisted apps.
# Returns JSON formatted output.

param(
    [string]$Action = "Preview",    # Preview | Enforce
    [string[]]$WhitelistedApps = @(),
    [switch]$DryRun = $false
)

$ErrorActionPreference = "SilentlyContinue"

function Get-InstalledWin32Apps {
    $apps = @()
    $regPaths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    foreach ($path in $regPaths) {
        $apps += Get-ItemProperty $path -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName } |
            Select-Object @{N='Name';E={$_.DisplayName}},
                          @{N='Version';E={$_.DisplayVersion}},
                          Publisher,
                          @{N='SizeMB';E={if($_.EstimatedSize){[math]::Round($_.EstimatedSize/1024,2)}else{0}}},
                          UninstallString,
                          @{N='QuietUninstallString';E={$_.QuietUninstallString}},
                          @{N='AppType';E={'Win32'}},
                          @{N='PackageFullName';E={$null}}
    }
    return $apps | Sort-Object Name -Unique
}

function Test-IsWhitelisted {
    param([string]$AppName, [string[]]$Whitelist)
    foreach ($entry in $Whitelist) {
        $entry = $entry.Trim()
        if ($entry -eq "" -or $entry.StartsWith("#")) { continue }
        if ($AppName -like "*$entry*" -or $entry -like "*$AppName*") {
            return $true
        }
    }
    return $false
}

function Uninstall-App {
    param(
        [string]$Name,
        [string]$UninstallCmd,
        [string]$QuietCmd,
        [string]$AppType,
        [string]$PackageFullName
    )

    $result = @{
        appName  = $Name
        status   = "pending"
        exitCode = $null
        message  = ""
        verified = $false
    }

    try {
        if ($AppType -eq 'Store' -and $PackageFullName) {
            Remove-AppxPackage -Package $PackageFullName -AllUsers -ErrorAction Stop
            $result.status   = "verified"
            $result.verified = $true
            $result.message  = "Store app removed"
            return $result
        }

        $cmd = if ($QuietCmd) { $QuietCmd } elseif ($UninstallCmd) { $UninstallCmd } else { $null }
        if (-not $cmd) {
            $result.status  = "error"
            $result.message = "No uninstall command found"
            return $result
        }

        if (-not $QuietCmd) {
            if ($cmd -match "msiexec") {
                $cmd = $cmd -replace "/I", "/X"
                if ($cmd -notmatch "/quiet|/qn") { $cmd += " /quiet /norestart" }
            } elseif ($cmd -match "\.exe") {
                $cmd += " /S /silent /quiet /SILENT /VERYSILENT /norestart"
            }
        }

        $process   = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd -PassThru -WindowStyle Hidden -ErrorAction Stop
        $completed = $process.WaitForExit(30000)

        if ($completed) {
            $result.exitCode = $process.ExitCode
        } else {
            $result.exitCode = -1
            $result.status   = "pending_verification"
            $result.message  = "Uninstall started but still running"
        }

        Start-Sleep -Seconds 2

        # Verify removal
        $stillExists = Get-InstalledWin32Apps | Where-Object { $_.Name -eq $Name }
        if (-not $stillExists) {
            $result.status   = "verified"
            $result.verified = $true
            $result.message  = "Uninstalled and verified"
        } elseif ($result.exitCode -eq 0) {
            $result.status   = "pending_verification"
            $result.message  = "Command ran OK but app still present; may need restart"
        } else {
            $result.status   = "failed"
            $result.message  = "Uninstall failed (exit $($result.exitCode))"
        }
    } catch {
        $result.status  = "error"
        $result.message = $_.Exception.Message
    }

    return $result
}

# ── Main ──────────────────────────────────────────────────────────────────────

$allApps = Get-InstalledWin32Apps

# Separate whitelisted vs non-whitelisted
$whitelisted    = @()
$notWhitelisted = @()

foreach ($app in $allApps) {
    if (Test-IsWhitelisted -AppName $app.Name -Whitelist $WhitelistedApps) {
        $whitelisted += $app
    } else {
        $notWhitelisted += $app
    }
}

if ($Action -eq "Preview") {
    # Return what WOULD be uninstalled without actually doing it
    @{
        success           = $true
        action            = "Preview"
        totalInstalled    = $allApps.Count
        whitelistedCount  = $whitelisted.Count
        toUninstallCount  = $notWhitelisted.Count
        whitelisted       = @($whitelisted | Select-Object Name, Version, Publisher, SizeMB)
        toUninstall       = @($notWhitelisted | Select-Object Name, Version, Publisher, SizeMB)
    } | ConvertTo-Json -Depth 5 -Compress
}
elseif ($Action -eq "Enforce") {
    $results = @()

    foreach ($app in $notWhitelisted) {
        if ($DryRun) {
            $results += @{
                appName  = $app.Name
                status   = "dry_run"
                verified = $false
                message  = "DryRun – would have uninstalled"
            }
        } else {
            $r = Uninstall-App -Name $app.Name `
                               -UninstallCmd $app.UninstallString `
                               -QuietCmd $app.QuietUninstallString `
                               -AppType $app.AppType `
                               -PackageFullName $app.PackageFullName
            $results += $r
        }
    }

    $successful = ($results | Where-Object { $_.verified }).Count
    $failed     = ($results | Where-Object { $_.status -eq "failed" -or $_.status -eq "error" }).Count
    $pending    = ($results | Where-Object { $_.status -eq "pending_verification" }).Count

    @{
        success    = $true
        action     = "Enforce"
        total      = $results.Count
        successful = $successful
        failed     = $failed
        pending    = $pending
        results    = $results
    } | ConvertTo-Json -Depth 5 -Compress
}
else {
    @{
        success = $false
        error   = "Invalid Action. Use 'Preview' or 'Enforce'."
    } | ConvertTo-Json -Compress
}
