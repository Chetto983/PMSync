# Find NestJS backend processes
Write-Host "========== FINDING NESTJS PROCESSES ==========" -ForegroundColor Cyan

$nodeProcs = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' }

foreach ($proc in $nodeProcs) {
    if ($proc.CommandLine -match 'nest' -or $proc.CommandLine -match 'MailAgent.*backend') {
        $mem = Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue
        $ramMB = if ($mem) { [math]::Round($mem.WorkingSet64/1MB, 2) } else { "N/A" }

        Write-Host "`nPID: $($proc.ProcessId) | RAM: $ramMB MB" -ForegroundColor $(if ($ramMB -gt 500) { "Red" } else { "Green" })
        Write-Host "Command: $($proc.CommandLine)" -ForegroundColor Gray
    }
}
