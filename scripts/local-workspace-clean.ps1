param(
    [switch]$Apply
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$targets = @(
    "tsconfig.tsbuildinfo",
    "rag_list.txt",
    "last_two_feedback.json",
    "test_ref.ts",
    "test-scenarios.ts"
)

$patterns = @(
    "vector-export-*.json"
)

$resolved = New-Object System.Collections.Generic.List[string]

foreach ($target in $targets) {
    if (Test-Path -LiteralPath $target) {
        $resolved.Add((Resolve-Path -LiteralPath $target).Path)
    }
}

foreach ($pattern in $patterns) {
    Get-ChildItem -Path . -Filter $pattern -File -ErrorAction SilentlyContinue | ForEach-Object {
        $resolved.Add($_.FullName)
    }
}

if ($resolved.Count -eq 0) {
    Write-Host "No local cleanup targets found."
    exit 0
}

Write-Host "Local cleanup targets:"
$resolved | Sort-Object -Unique | ForEach-Object { Write-Host " - $($_)" }

if (-not $Apply) {
    Write-Host "Preview mode only. Re-run with -Apply to delete these files."
    exit 0
}

$resolved | Sort-Object -Unique | ForEach-Object {
    Remove-Item -LiteralPath $_ -Force
}

Write-Host "Cleanup complete."
