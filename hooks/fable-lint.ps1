# fable-lint.ps1 : lint du système de raisonnement Fable (édition publique)
# Vérifie la synchronisation des copies, la version citée dans le noyau,
# les invariants de forme du référentiel et la présence du hook SessionStart.
# Sortie rouge/verte ; code retour 0 = conforme, 1 = non conforme.
# Usage : pwsh -NoProfile -File hooks\fable-lint.ps1
#
# ------------------------- PARAMÈTRES (à adapter) ---------------------------
# $REF_SOURCE   : votre copie principale du référentiel (par défaut : celle du dépôt cloné).
# $REF_PORTABLE : copie portable ('' pour désactiver le contrôle de synchronisation).
# $NOYAU        : le fichier CLAUDE.md dans lequel vous avez collé fable/NOYAU.md.
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$failures = @()
$warnings = @()

$REF_SOURCE   = Join-Path (Split-Path $PSScriptRoot -Parent) 'fable\FABLE-REASONING.md'
$REF_PORTABLE = Join-Path $env:USERPROFILE '.claude\methodology\FABLE-REASONING.md'
$NOYAU        = Join-Path $env:USERPROFILE '.claude\CLAUDE.md'
$settings     = Join-Path $env:USERPROFILE '.claude\settings.json'

# 1. Existence des copies
if (-not (Test-Path $REF_SOURCE)) { $failures += "Source absente : $REF_SOURCE" }
if ($REF_PORTABLE -and -not (Test-Path $REF_PORTABLE)) {
    $failures += "Copie portable absente : $REF_PORTABLE (copiez la source, ou mettez `$REF_PORTABLE = '' pour désactiver ce contrôle)."
}

if (Test-Path $REF_SOURCE) {
    # 2. Synchronisation par hash (si la copie portable est activée)
    if ($REF_PORTABLE -and (Test-Path $REF_PORTABLE)) {
        $hSrc = (Get-FileHash $REF_SOURCE).Hash
        $hPor = (Get-FileHash $REF_PORTABLE).Hash
        if ($hSrc -ne $hPor) { $failures += "DÉSYNCHRONISATION source/portable (hash différents). Resynchroniser : Copy-Item source -> portable." }
    }

    # 3. Version de la source vs version citée dans le noyau
    $srcHead = Get-Content $REF_SOURCE -TotalCount 5 -Encoding UTF8
    $srcVersion = ($srcHead | Select-String -Pattern 'Version\*\* : (v[\d.]+)').Matches.Groups[1].Value
    if (-not $srcVersion) { $failures += "Version introuvable dans l'en-tête de la source." }
    elseif (Test-Path $NOYAU) {
        $noyauTxt = Get-Content $NOYAU -Raw -Encoding UTF8
        if ($noyauTxt -notmatch [regex]::Escape("FABLE-REASONING.md`` $srcVersion")) {
            $failures += "Le noyau ($NOYAU) ne cite pas la version courante $srcVersion : realigner (obligation D.4 du référentiel)."
        }
        # Invariant du noyau lui-même : le mojibake n'est jamais légitime.
        if ($noyauTxt -match 'Ã©|Ã¨|Ã |â€') { $warnings += "Mojibake suspecté dans le noyau $NOYAU (motifs Ã/â€ détectés) : vérifier l'encodage UTF-8." }
    }
    else { $failures += "Noyau absent : $NOYAU (le système Fable n'est plus auto-chargé nulle part)." }

    # 4. Invariants de forme sur la source (exemples : adaptez à vos invariants) :
    #    zéro cadratin, zéro échappement \u00 (encodage accentué violé).
    $srcTxt = Get-Content $REF_SOURCE -Raw -Encoding UTF8
    $emdash = ([regex]::Matches($srcTxt, ([char]0x2014))).Count
    if ($emdash -gt 0) { $failures += "$emdash cadratin(s) dans FABLE-REASONING.md (invariant de forme violé)." }
    $u00 = ([regex]::Matches($srcTxt, '\\u00[0-9a-fA-F]{2}')).Count
    if ($u00 -gt 0) { $failures += "$u00 échappement(s) \u00 dans FABLE-REASONING.md (encodage accentué violé)." }
}

# 5. Hook SessionStart présent dans les settings utilisateur
if (Test-Path $settings) {
    try {
        $cfg = Get-Content $settings -Raw -Encoding UTF8 | ConvertFrom-Json
        $hasHook = $false
        $hookCmd = $null
        foreach ($entry in @($cfg.hooks.SessionStart)) {
            foreach ($h in @($entry.hooks)) {
                if ($h.command -match 'fable-sessionstart') { $hasHook = $true; $hookCmd = $h.command }
            }
        }
        if (-not $hasHook) { $failures += "Hook SessionStart fable-sessionstart absent du settings.json utilisateur ($settings)." }
        # Chemin RÉEL du script, extrait de la commande du hook (repli sur le chemin du dépôt si l'extraction échoue)
        $hookScript = Join-Path $PSScriptRoot 'fable-sessionstart.ps1'
        if ($hookCmd -and $hookCmd -match '-File\s+"([^"]+\.ps1)"') { $hookScript = $Matches[1] }
        elseif ($hookCmd -and $hookCmd -match '-File\s+(\S+\.ps1)') { $hookScript = $Matches[1] }
        if ($hasHook -and -not (Test-Path $hookScript)) { $failures += "Le hook est déclaré mais son script est ABSENT du disque : $hookScript (chaque SessionStart planterait au runtime)." }
    } catch { $failures += "settings.json utilisateur illisible ou JSON invalide (toutes les settings du fichier sont ignorées !)." }
} else {
    $failures += "$settings absent : le hook SessionStart n'est pas installé."
}

# Bilan
Write-Host ''
foreach ($w in $warnings) { Write-Host "AVERTISSEMENT : $w" -ForegroundColor Yellow }
if ($failures.Count -eq 0) {
    Write-Host "FABLE-LINT : VERT (source $srcVersion, sync OK, invariants OK, hook OK)" -ForegroundColor Green
    exit 0
} else {
    foreach ($f in $failures) { Write-Host "ÉCHEC : $f" -ForegroundColor Red }
    Write-Host "FABLE-LINT : ROUGE ($($failures.Count) échec(s))" -ForegroundColor Red
    exit 1
}
