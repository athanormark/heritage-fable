---
name: context-budget
description: Audit du budget de contexte Claude Code (agents, skills, MCP, règles, chaîne CLAUDE.md) ET guide de compaction stratégique. À utiliser quand on veut savoir ce qui consomme la fenêtre de contexte, réduire l'overhead de démarrage, décider QUAND lancer /compact (aux frontières de phase plutôt qu'au réflexe de l'auto-compact), ou comprendre ce qui survit à une compaction. Produit un rapport d'overhead chiffré en tokens (total, % de la fenêtre, top 3 optimisations) et une table de décision compaction. Lecture LOCALE uniquement, sans appel réseau. À mobiliser après tout ajout d'agent / skill / serveur MCP, et à chaque frontière de phase d'un chantier long. Inclut un hook PreToolUse advisory (suggest-compact.js) qui surface la pression de fenêtre sans jamais compacter.
---

# context-budget : auditer le budget de contexte et compacter au bon moment

Cette skill couvre deux faces du même problème, la fenêtre de contexte comme ressource finie :

1. **Audit du budget** : ce qui est chargé à chaque session ou à chaque Task (agents, skills, MCP, règles, chaîne CLAUDE.md), chiffré en tokens, pour réduire l'overhead.
2. **Compaction stratégique** : quand déclencher `/compact` délibérément, aux frontières logiques, plutôt que de subir l'auto-compact natif à un moment arbitraire.

L'audit ne lit que du LOCAL, ce qui le rend compatible avec les projets confidentiels ou air-gap.

## Quand l'utiliser

- Après avoir ajouté un agent, une skill ou un serveur MCP : mesurer l'overhead introduit.
- Quand le démarrage de session ou chaque Task semble lourd, ou que la fenêtre se remplit vite.
- À une frontière de phase d'un chantier long (recherche terminée, planification finie, debug fini) : décider si on compacte.
- Pour comprendre ce qui survit à une compaction avant d'en lancer une.

## Quand NE PAS l'utiliser

- Pendant l'implémentation active au milieu d'une fonction : ne pas compacter (cf. table de décision).
- Pour optimiser le code applicatif (ce n'est pas du profiling runtime) : c'est l'overhead de l'outil Claude Code qu'on mesure, pas la perf du produit.

## Délimitation (ne pas dupliquer)

- **vs le module scribe de ce dépôt** : sur les projets CÂBLÉS avec le module `scribe/` (voir `scribe/context-guard.js` et `templates/DOCUMENTATION-POLICY.md`), `context-guard.js` SUPERSÈDE `suggest-compact.js` (3 seuils étagés S1/S2/S3, cran dur en deny sélectif, journal de capture, kill switch `SCRIBE_DISABLE=1`). Ne JAMAIS câbler les deux hooks sur le même projet (double injection). `suggest-compact.js` reste valable tel quel sur les projets non câblés ; l'audit de budget de cette skill reste pertinent partout.
- **vs la discipline de chantier** (fable/FABLE-REASONING, module VII et X) : le référentiel fixe la DISCIPLINE (compact délibéré aux frontières + phrase de reprise). Cette skill fournit l'OUTILLAGE de mesure (audit chiffré) et un hook advisory qui surface la pression de fenêtre. La porte de décision reste la discipline ; le hook ne fait que rappeler, il ne compacte jamais. Pas de double compaction.
- **vs `production-audit`** : production-audit évalue la readiness PRODUCTION d'un dépôt. context-budget évalue l'overhead de CONTEXTE de l'outil. Deux audits, deux lentilles.
- **vs l'auto-compact natif de Claude Code** : l'auto-compact se déclenche tout seul près de la limite, à un moment souvent mauvais (au milieu d'une tâche). Cette skill aide à compacter AVANT, à une frontière choisie, pour ne pas subir une coupe arbitraire.

## Ce que ça ne fait pas

- Ne remplace pas l'auto-compact natif : il reste le filet de sécurité de dernière ligne.
- Ne compacte rien tout seul : le hook est purement advisory (il écrit un message dans le contexte via additionalContext, c'est tout).
- N'envoie rien sur le réseau : audit et hook sont 100 % locaux. Aucune donnée ne sort.

---

# Partie 1 : audit du budget de contexte

## Comptage des tokens (approximation)

- **Prose / Markdown** : nombre de mots x 1,3.
- **Code** : nombre de caractères / 4.

Ces ratios suffisent pour un ordre de grandeur. On cherche les gros postes, pas une mesure au token près.

## Inventaire

| Composant | Où le lire | Coût typique | Signal de bloat |
|---|---|---|---|
| Agents | `~/.claude/agents/*.md` et `<projet>/.claude/agents/` | variable | fichier > 200 lignes = agent lourd ; `description` du frontmatter > 30 mots = bloat (chargée à CHAQUE Task, même sans dispatch) |
| Skills | `<projet>/skills/*/SKILL.md` et `~/.claude/skills/` | variable | `SKILL.md` > 400 lignes |
| Commandes | `.claude/commands/` | faible | rarement un problème |
| MCP | `~/.claude.json` (scope user) + `.mcp.json` (projet) | environ 500 tokens / outil | **le plus gros levier** : serveur > 20 outils, ou serveur qui wrappe un CLI déjà dispo (gh / git / npm) |
| Chaîne CLAUDE.md | global `~/.claude/CLAUDE.md` + `CLAUDE.md` de projet | variable | chaîne cumulée > 300 lignes |

**Lecture LOCALE uniquement.** L'audit lit ces fichiers sur le disque, ne téléverse rien, n'appelle aucun scanner externe. Sur un projet confidentiel ou air-gap, c'est natif : tout reste local.

## Classer chaque poste

- **Always needed** : chargé à chaque session (chaîne CLAUDE.md, descriptions d'agents, outils MCP toujours connectés).
- **Sometimes** : chargé selon la tâche (corps d'un agent dispatché, SKILL.md d'une skill activée).
- **Rarely** : presque jamais utilisé (un serveur MCP branché mais quasi jamais appelé, un agent dormant).

Le poste **Always needed** est le plus rentable à dégraisser : il se paie à chaque tour.

## Détecter les surcoûts

1. **Descriptions d'agents en bloat** : la `description` du frontmatter est chargée à chaque Task, même si l'agent n'est pas appelé. La garder dense et < 30 mots de substance utile (le déclencheur, pas un mini-manuel).
2. **Agents lourds** : corps > 200 lignes. Découper ce qui peut être chargé à la demande (docs référencées), garder le frontmatter mince.
3. **Redondances** : même consigne répétée dans plusieurs agents / skills / règles. Centraliser, référencer.
4. **Sur-abonnement MCP** : c'est le plus gros levier. Un serveur à 30 outils coûte environ 15 000 tokens en permanence. Désactiver par-projet les serveurs non utilisés ; éviter de brancher un MCP qui wrappe un CLI déjà accessible en Bash.
5. **CLAUDE.md bloat** : chaîne cumulée > 300 lignes. Pousser le détail rare vers des docs chargés à la demande.

## Rapport d'audit

```
AUDIT BUDGET DE CONTEXTE

Total overhead estime : <N> tokens (<P> % de la fenetre <1M|200k>)

Breakdown :
- Chaine CLAUDE.md      : <n> tokens
- Descriptions agents   : <n> tokens (x N agents, toujours chargees)
- Outils MCP            : <n> tokens (x N outils)
- Skills (frontmatters) : <n> tokens
- Commandes             : <n> tokens

Top 3 optimisations (chiffrees) :
1. <action> -> economie environ <n> tokens
2. <action> -> economie environ <n> tokens
3. <action> -> economie environ <n> tokens
```

## Best practices d'audit

- Le MCP est le plus gros levier : commencer par là.
- Les descriptions d'agents sont TOUJOURS chargées : les soigner en priorité après le MCP.
- Auditer après chaque ajout (agent, skill, serveur MCP), pas une fois par an.

---

# Partie 2 : compaction stratégique

L'objectif : compacter à une frontière LOGIQUE choisie, pas subir l'auto-compact natif à un moment arbitraire (souvent au milieu d'une tâche, ce qui perd du contexte utile au pire moment).

## Table de décision : compacter maintenant ?

| Transition | Compacter ? |
|---|---|
| Recherche -> Planification | OUI |
| Planification -> Implémentation | OUI |
| Implémentation -> Tests | PEUT-ÊTRE (si l'implémentation est stabilisée) |
| Debug -> feature suivante | OUI |
| Au milieu d'une implémentation | NON |
| Juste après un échec (avant d'avoir compris) | OUI (repartir propre) |

## Ce qui survit à une compaction

| PERSISTE (survit) | PERDU (à reconstruire) |
|---|---|
| CLAUDE.md (rechargé) | raisonnement intermédiaire |
| TodoWrite | contenus lus (fichiers ouverts) |
| Fichiers mémoire | contexte multi-tours |
| État git (branche, commits) | historique des tool calls |
| Fichiers sur disque | préférences exprimées verbalement dans la conversation |

**Corollaire** : ce qui doit survivre et n'est dans aucune colonne de gauche doit être ÉCRIT sur disque (mini-runbook, todo, fichier mémoire) AVANT de compacter.

## Best practices de compaction

- Compacter après la planification et après le debug, jamais au milieu d'une implémentation.
- Écrire l'état important AVANT de compacter (mini-runbook, TodoWrite, fichier mémoire).
- Lancer `/compact` avec un résumé explicite de ce qu'on garde, plutôt qu'un compact nu.
- Respecter la discipline du référentiel : compact délibéré aux frontières + phrase de reprise post-compact.

---

# Partie 3 : le hook advisory (suggest-compact.js)

`suggest-compact.js` est un hook PreToolUse (matcher `Edit|Write`) autonome, sans aucune dépendance externe. Il ne bloque jamais un appel d'outil et ne compacte jamais. Il se contente de SUGGÉRER `/compact` quand la pression de fenêtre devient réelle, via le mécanisme `additionalContext`.

## Deux signaux

- **PRIMAIRE (taille de contexte)** : lit le transcript de session (`transcript_path` du payload stdin), trouve le DERNIER enregistrement `usage` et somme `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` = vraie taille du contexte du tour. Suggère à un seuil scalé par fenêtre, re-rappelle après chaque intervalle de croissance.
- **SECONDAIRE (nombre de tool calls)** : compteur par-session, 1er rappel au seuil (défaut 50) puis tous les 25. Sert de filet quand le transcript n'est pas lisible.

## Calibration par fenêtre (rationnel)

Sur une fenêtre 1M, suggérer à 250k (25 %) serait trop tôt : on compacterait par réflexe alors qu'il reste les trois quarts de la fenêtre. On compacte quand la pression est RÉELLE, autour de 65 %.

Défauts (tout reste configurable par env) :

| Paramètre | Fenêtre 1M | Fenêtre 200k | Env |
|---|---|---|---|
| Seuil de suggestion contexte | 650 000 (65 %) | 160 000 (80 %) | `COMPACT_CONTEXT_THRESHOLD` (0 désactive) |
| Intervalle de re-rappel | 100 000 | 60 000 | `COMPACT_CONTEXT_INTERVAL` |
| Seuil tool-count (1er rappel) | 50 | 50 | `COMPACT_THRESHOLD` |

Détection de fenêtre : marqueur `[1m]` dans l'id du modèle -> 1M ; sinon, famille `opus-4` -> 1M (le transcript de session enregistre l'id SANS le marqueur, vérifié sur pièce : `claude-opus-4-8` ; sans cette règle, une session 1M encore sous 200k serait prise pour une fenêtre 200k et déclencherait une suggestion bien trop tôt) ; sinon, si on observe plus de 200k tokens -> on infère 1M ; sinon 200k par défaut. Adaptez cette heuristique à votre modèle si vous n'êtes pas sur cette famille.

## Hook Setup (scope PROJET, JAMAIS user)

Installer le hook UNIQUEMENT par-projet, dans le `.claude/settings.json` du PROJET (par exemple un worktree de chantier long). Exemple :

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/scripts/suggest-compact.js\""
          }
        ]
      }
    ]
  }
}
```

Copiez `suggest-compact.js` (fourni à côté de ce fichier) dans le `.claude/scripts/` du projet et référencez cette copie.

**Avertissement : NE PAS installer ce hook au scope user (`~/.claude/settings.json`).** Au scope user, il s'exécuterait sur TOUS les projets (bruit inutile sur les petites tâches) et pourrait entrer en collision avec d'autres hooks user-scoped. Installation par-projet uniquement, sur les worktrees où la pression de fenêtre est un vrai sujet (chantiers multi-vagues).

## Neutralité et encodage du hook

Le `.js` ne contient aucun nom propre et aucun cadratin : il peut tourner en CI ou dans un worktree client sans rien révéler de son origine. Ses messages sont en clair, neutres. Toute erreur (transcript illisible, état corrompu, stdin malformé) est avalée et le hook reste exit 0.

## Articulation avec le compact délibéré

Le hook ne remplace pas la discipline. Il surface seulement la pression de fenêtre pour qu'on ne la DÉPASSE pas par inadvertance. La décision de compacter reste prise à une frontière de phase (table de décision ci-dessus + discipline du référentiel). Il n'y a jamais de double compaction : le hook suggère, l'humain (ou l'agent) décide, le `/compact` est manuel.
