# INSTALL : installation manuelle pas à pas

> Alternative au prompt d'appropriation du README (qui fait faire ces étapes par votre agent).
> Prérequis : Claude Code (testé sur 2.1.x : tool de dispatch « Agent », événements de hooks
> SessionStart, PostToolUse, SubagentStop, PreCompact, SessionEnd, PreToolUse) ; PowerShell 7+
> (`pwsh`) pour les hooks Fable (Windows) ; Node.js 18+ pour le module scribe (cross-platform).
> Dans tout ce qui suit, `<REPO>` désigne le chemin absolu où vous avez cloné ce dépôt.

## Étape 1 : le noyau (indispensable, 5 minutes)

1. Ouvrez `<REPO>/fable/NOYAU.md`.
2. Collez son contenu dans votre `~/.claude/CLAUDE.md` (toutes sessions) ou dans le
   `CLAUDE.md` d'un projet (ce projet seul).
3. Remplacez les trois blocs `[ADAPTEZ : ...]` : le chemin du référentiel, votre liste de
   fichiers critiques, et la section 6 (exemples de règles projet, dont vos marqueurs de
   confidentialité).

Le noyau seul suffit pour l'essentiel de la valeur mesurée. Les étapes suivantes ajoutent le
rappel mécanique, le lint et la documentation vivante.

## Étape 2 : le référentiel et sa copie portable

1. Le référentiel vit dans `<REPO>/fable/FABLE-REASONING.md` (la « source »).
2. Copie portable (recommandée, lisible depuis tout projet) :
   `Copy-Item "<REPO>\fable\FABLE-REASONING.md" "$env:USERPROFILE\.claude\methodology\FABLE-REASONING.md"`
   (créez le dossier au besoin). Si vous n'en voulez pas : mettez `$REF_PORTABLE = ''` en tête
   de `hooks/fable-lint.ps1`.

## Étape 3 : le hook SessionStart (rappel mécanique)

Dans `~/.claude/settings.json`, ajoutez (fusionnez avec vos hooks existants, n'écrasez rien) :

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "pwsh -NoProfile -File \"<REPO>\\hooks\\fable-sessionstart.ps1\""
          }
        ]
      }
    ]
  }
}
```

Ce hook injecte à chaque session : la version courante du référentiel, la consigne de
chargement T3+, la carte des 10 règles, et le dernier verdict du lint s'il est ROUGE. Il
relance aussi le lint en tâche de fond au plus une fois par 24 h (état JSON dans
`~/.claude/fable-lint-state.json`).

## Étape 4 : vérifier avec le lint

```powershell
pwsh -NoProfile -File "<REPO>\hooks\fable-lint.ps1"
```

Attendu : `FABLE-LINT : VERT`. Le lint vérifie : existence et synchronisation (hash) des deux
copies du référentiel, version citée dans le noyau, invariants de forme, hook déclaré et
script présent sur disque.

Si vous avez collé le noyau dans le `CLAUDE.md` d'un projet (et non `~/.claude/CLAUDE.md`),
ajustez d'abord la variable `$NOYAU` en tête de `hooks/fable-lint.ps1` : sans cela, le lint
sort ROUGE (« Noyau absent »).

## Étape 5 : le module scribe sur un projet pilote (facultatif)

Choisissez UN projet pilote. Dans `<projet>/.claude/settings.json` (ou `settings.local.json`) :

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node \"<REPO>\\scribe\\scribe-capture.js\"" } ] }
    ],
    "PostToolUse": [
      { "matcher": "Agent", "hooks": [ { "type": "command", "command": "node \"<REPO>\\scribe\\scribe-capture.js\"" } ] }
    ],
    "SubagentStop": [
      { "hooks": [ { "type": "command", "command": "node \"<REPO>\\scribe\\scribe-capture.js\"" } ] }
    ],
    "PreCompact": [
      { "hooks": [ { "type": "command", "command": "node \"<REPO>\\scribe\\scribe-capture.js\"" } ] }
    ],
    "SessionEnd": [
      { "hooks": [ { "type": "command", "command": "node \"<REPO>\\scribe\\scribe-capture.js\"" } ] }
    ],
    "PreToolUse": [
      { "hooks": [ { "type": "command", "command": "node \"<REPO>\\scribe\\context-guard.js\"" } ] }
    ]
  }
}
```

Exemple POSIX (macOS/Linux) : mêmes événements, commande
`node "/chemin/vers/heritage-fable/scribe/scribe-capture.js"`. Note : la normalisation interne
des chemins ignore la casse (conçue pour Windows) ; sur un système de fichiers sensible à la
casse, gardez une casse cohérente dans vos configurations.

Installez l'agent scribe : copiez `<REPO>/agents/scribe.md` vers `~/.claude/agents/scribe.md`.

Variables d'environnement (toutes facultatives, définies au niveau du projet ou de la machine) :

| Variable | Rôle | Défaut |
|---|---|---|
| `SCRIBE_ROOT_DIR` | racine de votre monorepo (sessions racine = métadonnées seules) | non défini (mode jamais actif) |
| `SCRIBE_SAS_DIR` | sas partagé des candidats leçons | `<racine>/shared/tasks/instincts`, sinon local au projet |
| `SCRIBE_SENSITIVE_MARKERS` | marqueurs (virgules) des projets confidentiels : dépôt local seul | vide |
| `SCRIBE_WINDOW_TOKENS` | fenêtre de contexte prouvée de votre compte | inférée, deny jamais armé sur un défaut |
| `SCRIBE_S1` / `S2` / `S3` | seuils de contexte | 550k / 700k / 900k (fenêtre 1M) |
| `SCRIBE_PILOT_AGENTS` | agents dont les rapports sont greppés pour INSTINCT-CANDIDAT | `debugger,qa,challenger` |
| `SCRIBE_AGENT_NAME` | nom de votre agent scribe | `scribe` |
| `SCRIBE_REDACTION_EXTRA` | préfixes de secrets supplémentaires à neutraliser | vide |
| `SCRIBE_DISABLE=1` | kill switch global | non défini |

Vérification du module :

```powershell
node "<REPO>\scribe\test-session-scribe.mjs"
```

Attendu : `TOUS LES TESTS PASSENT`. Politique documentaire, formats et cycles de vie :
`templates/DOCUMENTATION-POLICY.md`.

## Étape 6 : le protocole multi-modèles (facultatif)

Lisez `multi-model/PROTOCOLE.md`. Si vous disposez d'un CLI de modèle tiers couvert par un
abonnement, écrivez le petit wrapper décrit en section 7 (lecture de la config, sandbox,
grep-refus de confidentialité, journal d'audit), et référencez-le depuis vos CLAUDE.md.

## Désinstallation

Retirez les blocs de hooks de vos settings, supprimez le bloc noyau de votre CLAUDE.md,
supprimez `~/.claude/fable-lint-state.json`, la copie portable
`~/.claude/methodology/FABLE-REASONING.md`, l'agent `~/.claude/agents/scribe.md`, les dossiers
`.claude/scribe/` des projets pilotes, le sas de candidats leçons si vous l'aviez configuré
(`SCRIBE_SAS_DIR`) et les fichiers temporaires `claude-scribe-*` du dossier temp système.
Kill switch immédiat sans désinstaller : `SCRIBE_DISABLE=1`.
