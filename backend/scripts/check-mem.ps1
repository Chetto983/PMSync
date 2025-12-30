# Quick memory check for Node processes
Write-Host "========== NODE PROCESS MEMORY ==========`n" -ForegroundColor Cyan
Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object {
    $ramMB = [math]::Round($_.WorkingSet64/1MB, 2)
    $color = if ($ramMB -gt 1000) { "Red" } elseif ($ramMB -gt 500) { "Yellow" } else { "Green" }
    Write-Host "PID: $($_.Id) | RAM: $ramMB MB | Handles: $($_.HandleCount)" -ForegroundColor $color
}

# System total
$os = Get-CimInstance Win32_OperatingSystem
$totalGB = [math]::Round($os.TotalVisibleMemorySize/1MB, 2)
$freeGB = [math]::Round($os.FreePhysicalMemory/1MB, 2)
$usedGB = [math]::Round($totalGB - $freeGB, 2)
$usedPct = [math]::Round(($usedGB / $totalGB) * 100, 1)

Write-Host "`n========== SYSTEM MEMORY ==========`n" -ForegroundColor Cyan
Write-Host "Total: $totalGB GB | Used: $usedGB GB ($usedPct%) | Free: $freeGB GB" -ForegroundColor $(if ($usedPct -gt 85) { "Red" } elseif ($usedPct -gt 70) { "Yellow" } else { "Green" })
