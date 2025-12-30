# Continuous Memory Watcher for Node.js Backend
# Usage: powershell -ExecutionPolicy Bypass -File watch-memory.ps1
# Press Ctrl+C to stop

param(
    [int]$IntervalSeconds = 5,
    [int]$DurationMinutes = 60,
    [string]$LogFile = "memory-log.csv"
)

$startTime = Get-Date
$endTime = $startTime.AddMinutes($DurationMinutes)
$logPath = Join-Path $PSScriptRoot $LogFile

Write-Host "========== MEMORY LEAK DETECTOR ==========" -ForegroundColor Cyan
Write-Host "Interval: $IntervalSeconds seconds"
Write-Host "Duration: $DurationMinutes minutes"
Write-Host "Log file: $logPath"
Write-Host "Press Ctrl+C to stop`n"

# Initialize CSV
"Timestamp,PID,ProcessName,RAM_MB,Virtual_GB,Handles,Threads,SystemUsedPercent" | Out-File $logPath

$previousRAM = @{}

while ((Get-Date) -lt $endTime) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $os = Get-CimInstance Win32_OperatingSystem
    $systemUsedPercent = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 1)

    Clear-Host
    Write-Host "========== LIVE MEMORY MONITOR ==========" -ForegroundColor Cyan
    Write-Host "Time: $timestamp | System RAM: $systemUsedPercent% used"
    Write-Host "-" * 70

    $nodeProcesses = Get-Process | Where-Object { $_.ProcessName -match 'node' }

    if ($nodeProcesses) {
        Write-Host "`nPID".PadRight(10) + "Process".PadRight(20) + "RAM (MB)".PadRight(15) + "Delta".PadRight(12) + "Handles".PadRight(10) + "Status"
        Write-Host "-" * 70

        foreach ($proc in $nodeProcesses) {
            $ramMB = [math]::Round($proc.WorkingSet64/1MB, 2)
            $virtualGB = [math]::Round($proc.VirtualMemorySize64/1GB, 2)

            # Calculate delta
            $delta = ""
            $status = "OK"
            $color = "Green"

            if ($previousRAM.ContainsKey($proc.Id)) {
                $diff = $ramMB - $previousRAM[$proc.Id]
                if ($diff -gt 0) {
                    $delta = "+$([math]::Round($diff, 1)) MB"
                    if ($diff -gt 50) {
                        $status = "LEAK?"
                        $color = "Red"
                    } elseif ($diff -gt 10) {
                        $status = "Growing"
                        $color = "Yellow"
                    }
                } elseif ($diff -lt 0) {
                    $delta = "$([math]::Round($diff, 1)) MB"
                    $status = "GC"
                    $color = "Cyan"
                } else {
                    $delta = "0"
                }
            }

            $previousRAM[$proc.Id] = $ramMB

            $line = "$($proc.Id.ToString().PadRight(10))$($proc.ProcessName.PadRight(20))$($ramMB.ToString().PadRight(15))$($delta.PadRight(12))$($proc.HandleCount.ToString().PadRight(10))$status"
            Write-Host $line -ForegroundColor $color

            # Log to CSV
            "$timestamp,$($proc.Id),$($proc.ProcessName),$ramMB,$virtualGB,$($proc.HandleCount),$($proc.Threads.Count),$systemUsedPercent" | Out-File $logPath -Append
        }

        # Memory warning
        $totalNodeRAM = ($nodeProcesses | Measure-Object -Property WorkingSet64 -Sum).Sum / 1MB
        Write-Host "`nTotal Node.js RAM: $([math]::Round($totalNodeRAM, 2)) MB" -ForegroundColor Cyan

        if ($totalNodeRAM -gt 4000) {
            Write-Host "CRITICAL: Node.js using over 4GB RAM!" -ForegroundColor Red
        } elseif ($totalNodeRAM -gt 2000) {
            Write-Host "WARNING: Node.js using over 2GB RAM!" -ForegroundColor Yellow
        }
    } else {
        Write-Host "No Node.js processes found!" -ForegroundColor Yellow
    }

    Write-Host "`n[Log: $logPath] [Remaining: $([math]::Round(($endTime - (Get-Date)).TotalMinutes, 1)) min]"

    Start-Sleep -Seconds $IntervalSeconds
}

Write-Host "`n========== MONITORING COMPLETE ==========" -ForegroundColor Green
Write-Host "Log saved to: $logPath"
Write-Host "Analyze with: Import-Csv $logPath | Group-Object PID | ForEach-Object { `$_.Group | Select-Object -Last 1 }"
