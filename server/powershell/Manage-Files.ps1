# Manage-Files.ps1
# List, search, and delete files/folders with verification
# Returns JSON formatted output

param(
    [string]$Action = "List",
    [string]$Path = "C:\",
    [string]$Recursive = "false",
    [string]$IncludeHidden = "false",
    [string]$SearchTerm = "",
    [string]$Extension = "",
    [string[]]$FilesToDelete = @()
)

# Convert string parameters to boolean
$RecursiveBool = $Recursive -eq "true" -or $Recursive -eq "True" -or $Recursive -eq $true
$IncludeHiddenBool = $IncludeHidden -eq "true" -or $IncludeHidden -eq "True" -or $IncludeHidden -eq $true

$ErrorActionPreference = "SilentlyContinue"

function Get-FileList {
    param(
        [string]$FolderPath,
        [bool]$IncludeRecursive,
        [bool]$ShowHidden
    )
    
    $result = @{
        path         = $FolderPath
        exists       = $false
        items        = @()
        totalFiles   = 0
        totalFolders = 0
        totalSize    = 0
    }
    
    if (-not (Test-Path -Path $FolderPath)) {
        $result.error = "Path does not exist"
        return $result
    }
    
    $result.exists = $true
    
    $getParams = @{
        Path  = $FolderPath
        Force = $ShowHidden
    }
    
    if ($IncludeRecursive) {
        $getParams.Recurse = $true
    }
    
    try {
        $items = Get-ChildItem @getParams | Select-Object -First 500
        
        foreach ($item in $items) {
            $fileInfo = @{
                name          = $item.Name
                path          = $item.FullName
                type          = if ($item.PSIsContainer) { "folder" } else { "file" }
                size          = if ($item.PSIsContainer) { 0 } else { $item.Length }
                sizeFormatted = ""
                createdAt     = $item.CreationTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
                modifiedAt    = $item.LastWriteTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
                isHidden      = $item.Attributes -match "Hidden"
                isReadOnly    = $item.Attributes -match "ReadOnly"
                isSystem      = $item.Attributes -match "System"
                extension     = $item.Extension
            }
            
            # Format size
            if ($fileInfo.type -eq "file") {
                if ($fileInfo.size -gt 1GB) {
                    $fileInfo.sizeFormatted = "{0:N2} GB" -f ($fileInfo.size / 1GB)
                }
                elseif ($fileInfo.size -gt 1MB) {
                    $fileInfo.sizeFormatted = "{0:N2} MB" -f ($fileInfo.size / 1MB)
                }
                elseif ($fileInfo.size -gt 1KB) {
                    $fileInfo.sizeFormatted = "{0:N2} KB" -f ($fileInfo.size / 1KB)
                }
                else {
                    $fileInfo.sizeFormatted = "$($fileInfo.size) B"
                }
                $result.totalFiles++
                $result.totalSize += $fileInfo.size
            }
            else {
                $result.totalFolders++
            }
            
            $result.items += $fileInfo
        }
    }
    catch {
        $result.error = $_.Exception.Message
    }
    
    return $result
}

function Search-Files {
    param(
        [string]$StartPath,
        [string]$Name,
        [string]$Ext,
        [bool]$ShowHidden
    )
    
    $result = @{
        searchPath = $StartPath
        searchTerm = $Name
        extension  = $Ext
        matches    = @()
        count      = 0
    }
    
    if (-not (Test-Path -Path $StartPath)) {
        $result.error = "Search path does not exist"
        return $result
    }
    
    try {
        $filter = if ($Name) { "*$Name*" } else { "*" }
        
        $searchParams = @{
            Path        = $StartPath
            Filter      = $filter
            Recurse     = $true
            Force       = $ShowHidden
            ErrorAction = "SilentlyContinue"
        }
        
        $files = Get-ChildItem @searchParams | Select-Object -First 200
        
        # Filter by extension if specified
        if ($Ext) {
            $files = $files | Where-Object { $_.Extension -like "*$Ext*" }
        }
        
        foreach ($file in $files) {
            $result.matches += @{
                name       = $file.Name
                path       = $file.FullName
                type       = if ($file.PSIsContainer) { "folder" } else { "file" }
                size       = if ($file.PSIsContainer) { 0 } else { $file.Length }
                modifiedAt = $file.LastWriteTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
                extension  = $file.Extension
            }
        }
        
        $result.count = $result.matches.Count
    }
    catch {
        $result.error = $_.Exception.Message
    }
    
    return $result
}

function Remove-FilesWithVerification {
    param([string[]]$Paths)
    
    $results = @()
    $successCount = 0
    $failedCount = 0
    
    foreach ($filePath in $Paths) {
        $deleteResult = @{
            path     = $filePath
            status   = "pending"
            verified = $false
            message  = ""
        }
        
        # Verify file exists before deletion
        if (-not (Test-Path -Path $filePath)) {
            $deleteResult.status = "not_found"
            $deleteResult.message = "File or folder does not exist"
            $results += $deleteResult
            continue
        }
        
        $isFolder = (Get-Item $filePath).PSIsContainer
        $deleteResult.type = if ($isFolder) { "folder" } else { "file" }
        
        try {
            # Attempt deletion
            if ($isFolder) {
                Remove-Item -Path $filePath -Recurse -Force -ErrorAction Stop
            }
            else {
                Remove-Item -Path $filePath -Force -ErrorAction Stop
            }
            
            # Verify deletion
            Start-Sleep -Milliseconds 500
            
            if (-not (Test-Path -Path $filePath)) {
                $deleteResult.status = "verified"
                $deleteResult.verified = $true
                $deleteResult.message = "Successfully deleted and verified"
                $successCount++
            }
            else {
                $deleteResult.status = "failed"
                $deleteResult.message = "Delete command succeeded but item still exists"
                $failedCount++
            }
        }
        catch {
            $deleteResult.status = "error"
            $deleteResult.message = $_.Exception.Message
            $failedCount++
        }
        
        $results += $deleteResult
    }
    
    return @{
        success    = $failedCount -eq 0
        totalItems = $Paths.Count
        successful = $successCount
        failed     = $failedCount
        results    = $results
    }
}

# Main execution
switch ($Action) {
    "List" {
        $listResult = Get-FileList -FolderPath $Path -IncludeRecursive $RecursiveBool -ShowHidden $IncludeHiddenBool
        @{
            success = $listResult.exists
            data    = $listResult
        } | ConvertTo-Json -Depth 5 -Compress
    }
    "Search" {
        $searchResult = Search-Files -StartPath $Path -Name $SearchTerm -Ext $Extension -ShowHidden $IncludeHiddenBool
        @{
            success = -not $searchResult.error
            data    = $searchResult
        } | ConvertTo-Json -Depth 5 -Compress
    }
    "Delete" {
        if ($FilesToDelete.Count -eq 0) {
            @{
                success = $false
                error   = "FilesToDelete array is required for Delete action"
            } | ConvertTo-Json -Compress
        }
        else {
            Remove-FilesWithVerification -Paths $FilesToDelete | ConvertTo-Json -Depth 5 -Compress
        }
    }
    default {
        @{
            success = $false
            error   = "Invalid action. Valid actions: List, Search, Delete"
        } | ConvertTo-Json -Compress
    }
}
