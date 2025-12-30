# Memory Monitor Script for MailAgent Backend
# Usage: powershell -ExecutionPolicy Bypass -File monitor-memory.ps1

Write-Host "`n========== SYSTEM MEMORY STATUS ==========" -ForegroundColor Cyan
$os = Get-CimInstance Win32_OperatingSystem
$totalRAM = [math]::Round($os.TotalVisibleMemorySize/1MB, 2)
$freeRAM = [math]::Round($os.FreePhysicalMemory/1MB, 2)
$usedRAM = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory)/1MB, 2)
$usedPercent = [math]::Round(($usedRAM / $totalRAM) * 100, 1)

Write-Host "Total RAM:  $totalRAM GB"
Write-Host "Used RAM:   $usedRAM GB ($usedPercent%)"
Write-Host "Free RAM:   $freeRAM GB"

if ($usedPercent -gt 90) {
    Write-Host "WARNING: Memory usage is CRITICAL!" -ForegroundColor Red
} elseif ($usedPercent -gt 80) {
    Write-Host "WARNING: Memory usage is HIGH!" -ForegroundColor Yellow
}

Write-Host "`n========== NODE.JS PROCESSES ==========" -ForegroundColor Cyan
$nodeProcesses = Get-Process | Where-Object { $_.ProcessName -match 'node' }

if ($nodeProcesses) {
    foreach ($proc in $nodeProcesses) {
        $ramMB = [math]::Round($proc.WorkingSet64/1MB, 2)
        $virtualGB = [math]::Round($proc.VirtualMemorySize64/1GB, 2)
        Write-Host "`nPID: $($proc.Id)" -ForegroundColor Green
        Write-Host "  Name:        $($proc.ProcessName)"
        Write-Host "  RAM:         $ramMB MB"
        Write-Host "  Virtual:     $virtualGB GB"
        Write-Host "  Handles:     $($proc.HandleCount)"
        Write-Host "  Threads:     $($proc.Threads.Count)"
        Write-Host "  CPU Time:    $($proc.TotalProcessorTime)"

        if ($ramMB -gt 2000) {
            Write-Host "  STATUS: HIGH MEMORY USAGE!" -ForegroundColor Red
        } elseif ($ramMB -gt 1000) {
            Write-Host "  STATUS: Elevated memory" -ForegroundColor Yellow
        } else {
            Write-Host "  STATUS: Normal" -ForegroundColor Green
        }
    }
} else {
    Write-Host "No Node.js processes found!" -ForegroundColor Yellow
}

Write-Host "`n========== TOP 15 PROCESSES BY RAM ==========" -ForegroundColor Cyan
Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 | ForEach-Object {
    $ramMB = [math]::Round($_.WorkingSet64/1MB, 2)
    Write-Host "$($_.Id.ToString().PadLeft(8)) | $($_.ProcessName.PadRight(25)) | $($ramMB.ToString().PadLeft(10)) MB"
}

Write-Host "`n========== CHILD PROCESSES OF PID 27020 ==========" -ForegroundColor Cyan
try {
    $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq 27020 }
    if ($children) {
        foreach ($child in $children) {
            $ramMB = [math]::Round($child.WorkingSetSize/1MB, 2)
            Write-Host "PID: $($child.ProcessId) | $($child.Name) | $ramMB MB"
        }
    } else {
        Write-Host "No child processes found for PID 27020"
    }
} catch {
    Write-Host "Could not query child processes: $_" -ForegroundColor Yellow
}

Write-Host "`n========== MEMORY LEAK INDICATORS ==========" -ForegroundColor Cyan
Write-Host "To detect memory leaks, run this script multiple times and compare:"
Write-Host "  - Steadily increasing RAM usage"
Write-Host "  - Growing handle count"
Write-Host "  - Increasing thread count"
Write-Host "`nFor continuous monitoring, use: watch-memory.ps1"
