# Get-SystemMetrics.ps1
# Collects comprehensive system metrics via WMI
# Returns JSON formatted output

param(
    [switch]$StoreAppsOnly
)

# Force JSON output
$ErrorActionPreference = "SilentlyContinue"

function Get-SystemMetrics {
    $metrics = @{}
    
    # OS Information
    $os = Get-WmiObject -Class Win32_OperatingSystem
    $metrics.os = @{
        name = $os.Caption
        version = $os.Version
        architecture = $os.OSArchitecture
        buildNumber = $os.BuildNumber
    }
    
    # System Uptime
    $bootTime = $os.ConvertToDateTime($os.LastBootUpTime)
    $uptime = (Get-Date) - $bootTime
    $metrics.uptime = @{
        days = [math]::Floor($uptime.TotalDays)
        hours = $uptime.Hours
        minutes = $uptime.Minutes
        totalSeconds = [math]::Floor($uptime.TotalSeconds)
        lastBootTime = $bootTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
    
    # RAM Usage
    $totalRAM = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
    $freeRAM = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
    $usedRAM = [math]::Round($totalRAM - $freeRAM, 2)
    $ramPercent = [math]::Round(($usedRAM / $totalRAM) * 100, 1)
    
    $metrics.ram = @{
        totalGB = $totalRAM
        usedGB = $usedRAM
        freeGB = $freeRAM
        usagePercent = $ramPercent
    }
    
    # CPU Usage
    $cpu = Get-WmiObject -Class Win32_Processor
    $cpuLoad = (Get-WmiObject -Class Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
    
    $metrics.cpu = @{
        name = $cpu.Name
        cores = $cpu.NumberOfCores
        logicalProcessors = $cpu.NumberOfLogicalProcessors
        usagePercent = [int]$cpuLoad
        maxClockSpeed = $cpu.MaxClockSpeed
    }
    
    # Disk Usage
    $disks = Get-WmiObject -Class Win32_LogicalDisk -Filter "DriveType=3"
    $metrics.disks = @()
    
    foreach ($disk in $disks) {
        $totalSize = [math]::Round($disk.Size / 1GB, 2)
        $freeSpace = [math]::Round($disk.FreeSpace / 1GB, 2)
        $usedSpace = [math]::Round($totalSize - $freeSpace, 2)
        $usedPercent = [math]::Round(($usedSpace / $totalSize) * 100, 1)
        
        $metrics.disks += @{
            drive = $disk.DeviceID
            label = $disk.VolumeName
            totalGB = $totalSize
            usedGB = $usedSpace
            freeGB = $freeSpace
            usagePercent = $usedPercent
            fileSystem = $disk.FileSystem
        }
    }
    
    # Network Information
    $adapters = Get-WmiObject -Class Win32_NetworkAdapterConfiguration -Filter "IPEnabled=TRUE"
    $metrics.network = @{
        adapters = @()
        type = "Unknown"
        ssid = ""
    }
    
    foreach ($adapter in $adapters) {
        $adapterInfo = Get-WmiObject -Class Win32_NetworkAdapter -Filter "Index=$($adapter.Index)"
        $isWifi = $adapterInfo.Name -match "Wi-Fi|Wireless|802\.11"
        
        $metrics.network.adapters += @{
            name = $adapterInfo.Name
            mac = $adapter.MACAddress
            ip = $adapter.IPAddress[0]
            subnet = $adapter.IPSubnet[0]
            gateway = $adapter.DefaultIPGateway[0]
            type = if ($isWifi) { "Wi-Fi" } else { "Ethernet" }
        }
        
        if ($isWifi -and $metrics.network.type -ne "Wi-Fi") {
            $metrics.network.type = "Wi-Fi"
            # Try to get SSID
            try {
                $wlan = netsh wlan show interfaces | Select-String -Pattern "^\s+SSID\s+:\s(.+)$"
                if ($wlan) {
                    $metrics.network.ssid = $wlan.Matches[0].Groups[1].Value.Trim()
                }
            } catch {}
        } elseif ($metrics.network.type -eq "Unknown") {
            $metrics.network.type = "Ethernet"
        }
    }
    
    # Internet Connectivity
    try {
        $pingResult = Test-Connection -ComputerName "8.8.8.8" -Count 1 -Quiet
        $metrics.internet = @{
            connected = $pingResult
            checkedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        }
    } catch {
        $metrics.internet = @{
            connected = $false
            checkedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        }
    }
    
    # USB Devices
    $usbDevices = Get-WmiObject -Class Win32_USBControllerDevice | ForEach-Object {
        [wmi]($_.Dependent)
    } | Where-Object { $_.Name }
    
    $metrics.usb = @{
        count = ($usbDevices | Measure-Object).Count
        devices = @()
    }
    
    foreach ($device in $usbDevices | Select-Object -First 20) {
        $metrics.usb.devices += @{
            name = $device.Name
            deviceId = $device.DeviceID
            status = $device.Status
        }
    }
    
    # Installed Applications (from Registry - faster than Win32_Product)
    $apps = @()
    $regPaths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    
    foreach ($path in $regPaths) {
        $apps += Get-ItemProperty $path -ErrorAction SilentlyContinue | 
            Where-Object { $_.DisplayName } |
            Select-Object DisplayName, DisplayVersion, Publisher, InstallDate, EstimatedSize, UninstallString
    }
    
    $metrics.applications = @{
        count = $apps.Count
        list = @()
    }
    
    foreach ($app in $apps | Sort-Object DisplayName -Unique) {
        $metrics.applications.list += @{
            name = $app.DisplayName
            version = $app.DisplayVersion
            publisher = $app.Publisher
            installDate = $app.InstallDate
            sizeMB = if ($app.EstimatedSize) { [math]::Round($app.EstimatedSize / 1024, 2) } else { 0 }
            uninstallString = $app.UninstallString
        }
    }
    
    # Running Store Apps (UWP)
    try {
        $storeApps = Get-AppxPackage | Where-Object { $_.IsFramework -eq $false }
        $metrics.storeApps = @{
            count = $storeApps.Count
            list = @()
        }
        
        foreach ($storeApp in $storeApps) {
            $metrics.storeApps.list += @{
                name = $storeApp.Name
                version = $storeApp.Version
                publisher = $storeApp.Publisher
                installLocation = $storeApp.InstallLocation
                packageFullName = $storeApp.PackageFullName
            }
        }
    } catch {
        $metrics.storeApps = @{
            count = 0
            list = @()
            error = $_.Exception.Message
        }
    }
    
    # Computer Name and Domain
    $computer = Get-WmiObject -Class Win32_ComputerSystem
    $metrics.computer = @{
        name = $computer.Name
        domain = $computer.Domain
        manufacturer = $computer.Manufacturer
        model = $computer.Model
        totalMemoryGB = [math]::Round($computer.TotalPhysicalMemory / 1GB, 2)
    }
    
    $metrics.timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    $metrics.success = $true
    
    return $metrics
}

# Execute and return
if ($StoreAppsOnly) {
    $result = @{
        success = $true
        storeApps = (Get-AppxPackage | Where-Object { $_.IsFramework -eq $false } | ForEach-Object {
            @{
                name = $_.Name
                version = $_.Version
                publisher = $_.Publisher
                packageFullName = $_.PackageFullName
            }
        })
    }
    $result | ConvertTo-Json -Depth 10 -Compress
} else {
    Get-SystemMetrics | ConvertTo-Json -Depth 10 -Compress
}
