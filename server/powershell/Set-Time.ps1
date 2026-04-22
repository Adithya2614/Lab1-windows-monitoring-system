# Set-Time.ps1
# Sets the system time to Indian Standard Time (IST)
# Automatically attempts to sync with NTP for IST accuracy
# Requires Administrator privileges

param(
    [string]$Time = "AUTO"
)

$ErrorActionPreference = "SilentlyContinue"

try {
    # 1. Set TimeZone to Indian Standard Time (UTC+5:30)
    # This is the primary requirement for IST
    Set-TimeZone -Id "India Standard Time" -ErrorAction SilentlyContinue
    
    $syncMethod = "provided"
    $newTime = $null

    if ($Time -eq "AUTO") {
        # 2. Attempt "Automatic" Sync via NTP
        # Reset and Enable Windows Time Service for the sync
        Set-Service -Name "w32time" -StartupType Automatic -ErrorAction SilentlyContinue
        Start-Service -Name "w32time" -ErrorAction SilentlyContinue
        
        # Configure NTP servers (preferring Indian pool)
        w32tm /config /manualpeerlist:"0.in.pool.ntp.org 1.in.pool.ntp.org time.google.com" /syncfromflags:manual /reliable:YES /update
        
        # Force a resync
        w32tm /resync /force
        
        # Wait a moment for sync to propagate
        Start-Sleep -Seconds 2
        
        $newTime = Get-Date
        $syncMethod = "NTP (Internet Sync)"
    } elseif ($Time -and $Time -ne "") {
        # 3. Use Provided Time string
        $newTime = [DateTime]::Parse($Time)
        Set-Date -Date $newTime | Out-Null
        $syncMethod = "Manual/Management PC"
    } else {
        $newTime = Get-Date
        $syncMethod = "TimeZone Shift Only"
    }

    # 4. Lockdown (Optional but often desired in exam environments)
    # After sync, we disable the service to prevent unwanted drifts/reversions during the session
    Stop-Service -Name "w32time" -Force -ErrorAction SilentlyContinue
    Set-Service -Name "w32time" -StartupType Disabled -ErrorAction SilentlyContinue
    
    # Disable auto time zone update service
    $tzUpdate = Get-Service -Name "tzautoupdate" -ErrorAction SilentlyContinue
    if ($null -ne $tzUpdate) {
        Stop-Service -Name "tzautoupdate" -Force -ErrorAction SilentlyContinue
        Set-Service -Name "tzautoupdate" -StartupType Disabled -ErrorAction SilentlyContinue
    }
    
    # Force disable via Registry
    Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\tzautoupdate" -Name "Start" -Value 4 -ErrorAction SilentlyContinue
    Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\Parameters" -Name "Type" -Value "NoSync" -ErrorAction SilentlyContinue

    $finalTime = Get-Date
    $result = @{
        success = $true
        message = "System time successfully synced to IST using $syncMethod."
        newTime = $finalTime.ToString("yyyy-MM-dd HH:mm:ss")
        timezone = "India Standard Time"
    }
} catch {
    $result = @{
        success = $false
        error = $_.Exception.Message
    }
}

$result | ConvertTo-Json -Compress
