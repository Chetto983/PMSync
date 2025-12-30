# Identify Memory-Leaking Process
# Usage: powershell -ExecutionPolicy Bypass -File identify-leak.ps1

Write-Host "========== IDENTIFYING MEMORY-LEAKING PROCESS ==========" -ForegroundColor Cyan

# Target PIDs to investigate
$targetPids = @(14492, 9516, 16320)

foreach ($pid in $targetPids) {
    Write-Host "`n--- Process PID: $pid ---" -ForegroundColor Yellow
    try {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $pid"
        if ($process) {
            Write-Host "Name: $($process.Name)"
            Write-Host "CommandLine: $($process.CommandLine)"
            Write-Host "CreationDate: $($process.CreationDate)"
            Write-Host "ParentPID: $($process.ParentProcessId)"

            # Get memory info
            $memInfo = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($memInfo) {
                $ramMB = [math]::Round($memInfo.WorkingSet64/1MB, 2)
                $handleCount = $memInfo.HandleCount
                Write-Host "RAM: $ramMB MB" -ForegroundColor $(if ($ramMB -gt 1000) { "Red" } else { "Green" })
                Write-Host "Handles: $handleCount" -ForegroundColor $(if ($handleCount -gt 1000) { "Red" } else { "Green" })
            }
        } else {
            Write-Host "Process not found" -ForegroundColor Gray
        }
    } catch {
        Write-Host "Error getting process info: $_" -ForegroundColor Red
    }
}

Write-Host "`n========== ALL NODE PROCESSES WITH COMMAND LINE ==========" -ForegroundColor Cyan
$nodeProcesses = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' }
foreach ($proc in $nodeProcesses) {
    $memInfo = Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue
    $ramMB = if ($memInfo) { [math]::Round($memInfo.WorkingSet64/1MB, 2) } else { "N/A" }

    $color = "White"
    if ($ramMB -gt 1000) { $color = "Red" }
    elseif ($ramMB -gt 500) { $color = "Yellow" }

    Write-Host "`nPID: $($proc.ProcessId) | RAM: $ramMB MB" -ForegroundColor $color
    Write-Host "Command: $($proc.CommandLine)" -ForegroundColor Gray
}
