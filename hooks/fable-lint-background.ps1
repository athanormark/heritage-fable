# fable-lint-background.ps1 : runner détaché du réveil mécanique de fable-lint
# (sans lui, rien ne lance le lint tout seul : la télémétrie de rattrapage
# reposerait sur la discipline qu'elle remplace).
# Lancé par fable-sessionstart.ps1 au plus une fois par 24 h, en processus détaché.
# Écrit l'état du lint en JSON (~/.claude/fable-lint-state.json) ; le hook
# SessionStart injecte le verdict au démarrage suivant UNIQUEMENT s'il est
# ROUGE (silence au vert).

$ErrorActionPreference = 'Continue'
$statePath = Join-Path $env:USERPROFILE '.claude\fable-lint-state.json'
$lintPath  = Join-Path $PSScriptRoot 'fable-lint.ps1'

$verdict = 'INDISPONIBLE'
$failures = @()
try {
    if (Test-Path $lintPath) {
        $out = & pwsh -NoProfile -File $lintPath 2>&1
        $code = $LASTEXITCODE
        $verdict = if ($code -eq 0) { 'VERT' } else { 'ROUGE' }
        foreach ($line in $out) {
            $s = "$line"
            if ($s -match '^\s*(ÉCHEC|ECHEC)') { $failures += $s.Trim() }
        }
        if ($failures.Count -gt 5) { $failures = $failures[0..4] + @("(+ $($failures.Count - 5) autres)") }
    } else {
        $failures = @("fable-lint.ps1 introuvable : $lintPath")
        $verdict = 'ROUGE'
    }
} catch {
    $verdict = 'ROUGE'
    $failures = @("runner en échec : $($_.Exception.Message)")
}

$state = @{
    lastRunIso = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    verdict    = $verdict
    failures   = $failures
}
try {
    $tmp = "$statePath.tmp"
    $state | ConvertTo-Json -Depth 3 | Set-Content -Path $tmp -Encoding UTF8
    Move-Item -Path $tmp -Destination $statePath -Force
} catch {
    # dernier recours : écrire directement (le hook tolère un état illisible)
    try { $state | ConvertTo-Json -Depth 3 | Set-Content -Path $statePath -Encoding UTF8 } catch {}
}
