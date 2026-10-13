# PowerShell script to archive old migration/fix scripts
# Run this to clean up the root directory

Write-Host "🧹 Archiving migration scripts..." -ForegroundColor Cyan

# Create archive directory
$archiveDir = "scripts\archive\migrations"
if (-not (Test-Path $archiveDir)) {
    New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
    Write-Host "Created archive directory: $archiveDir" -ForegroundColor Green
}

# List of script patterns to archive
$patterns = @(
    "add-*.js",
    "fix-*.js",
    "update-*.js",
    "cleanup-*.js",
    "refactor-*.js",
    "remove-*.js",
    "reorder-*.js",
    "replace-*.js",
    "revert-*.js",
    "setup-*.js",
    "strip-*.js",
    "merge-*.js",
    "history-*.js"
)

$movedCount = 0

foreach ($pattern in $patterns) {
    $files = Get-ChildItem -Path . -Filter $pattern -File -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        try {
            Move-Item -Path $file.FullName -Destination $archiveDir -Force
            Write-Host "  Moved: $($file.Name)" -ForegroundColor Gray
            $movedCount++
        }
        catch {
            Write-Host "  Failed to move: $($file.Name)" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "Archived $movedCount migration scripts" -ForegroundColor Green
Write-Host "Location: $archiveDir" -ForegroundColor Cyan

# Update .gitignore
$gitignorePath = ".gitignore"
if (Test-Path $gitignorePath) {
    $gitignoreContent = Get-Content $gitignorePath -Raw
    if ($gitignoreContent -notlike "*scripts/archive/*") {
        Add-Content -Path $gitignorePath -Value "`n# Migration scripts archive`nscripts/archive/"
        Write-Host "Updated .gitignore" -ForegroundColor Green
    }
    else {
        Write-Host ".gitignore already configured" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Cleanup complete! Your root directory is now clean." -ForegroundColor Green
