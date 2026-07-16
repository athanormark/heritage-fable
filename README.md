# Héritage Fable 5 : un système de raisonnement pour vos agents Claude Code

> **English summary.** This repository packages a complete reasoning system for Claude Code
> agents, written by Claude Fable 5 as a self-decomposition of its own process, then
> generalized for public use. It ships a full reference document (12 modules plus per-model
> addenda for Opus, Sonnet and future models), a condensed core for your CLAUDE.md, mechanical
> guardrails (SessionStart hook, lint, background runner), a session documentation module
> (zero-token capture hooks plus a scribe agent), and a multi-model routing protocol. All content is in
> French. Hooks require Windows plus PowerShell 7; the Node.js scribe module is cross-platform.

## Ce que c'est

Quand Fable 5 ne sera plus disponible, le modèle qui exécute (Opus, Sonnet, ou un successeur)
doit pouvoir reproduire au plus près son processus de raisonnement, d'analyse et de
vérification. Ce dépôt est ce processus, décomposé, rendu exécutable, et débarrassé de tout ce
qui était propre à son écosystème d'origine :

- `fable/FABLE-REASONING.md` : le référentiel complet (triage T1-T4, épistémologie
  su/inféré/supposé, confiance calibrée, challenger interne à 8 vecteurs, Quality Gate 7
  points, addenda par modèle, 15 anti-patterns issus de chantiers réels de 2026).
- `fable/NOYAU.md` : le condensé à coller dans votre CLAUDE.md, auto-chargé à chaque session.
- `hooks/` : rappel mécanique à chaque SessionStart, lint de cohérence, relance en tâche de
  fond (PowerShell 7, Windows).
- `scribe/` : documentation vivante mécanisée : capture zéro-token par hooks Node, seuils de
  contexte étagés (advisory puis cran dur), HANDOFF de reprise, snapshots pré-compaction,
  harnais de 23 tests.
- `templates/`, `agents/scribe.md`, `multi-model/PROTOCOLE.md` : les formats canoniques,
  l'agent scribe, le protocole de routage par rôles et de contrôle des juges externes.

## LE PROMPT d'appropriation

Clonez ce dépôt, ouvrez une session Claude Code à sa racine, et collez ceci :

```
Installe le système de raisonnement Fable de ce dépôt. Travaille en T4 (livrable critique) :
chaque étape se termine par une preuve observée, et tu ne modifies AUCUN fichier de settings
sans m'avoir montré le diff exact et obtenu mon accord.

1. Lis dans l'ordre : README.md, INSTALL.md, fable/NOYAU.md, fable/FABLE-REASONING.md
   (en entier), templates/DOCUMENTATION-POLICY.md, multi-model/PROTOCOLE.md, agents/scribe.md.
2. Propose-moi un plan d'installation en me demandant : (a) noyau global (~/.claude/CLAUDE.md)
   ou par projet ; (b) quel projet pilote pour le module scribe ; (c) mes fichiers critiques
   et mes marqueurs de confidentialité pour remplacer les blocs [ADAPTEZ].
3. Ajoute le contenu de fable/NOYAU.md à mon CLAUDE.md choisi, blocs [ADAPTEZ] remplis avec
   mes réponses. Montre le diff avant d'écrire.
4. Installe le hook SessionStart (INSTALL.md étape 3) dans ~/.claude/settings.json en
   FUSIONNANT avec mes hooks existants. Montre le diff avant d'écrire. Pose la copie portable
   du référentiel (étape 2). Sans pwsh (macOS/Linux), saute cette étape et signale-le au
   rapport.
5. Câble le module scribe sur le projet pilote choisi (INSTALL.md étape 5) : hooks du projet,
   agent scribe copié dans ~/.claude/agents/, variables d'environnement utiles. Montre chaque
   diff avant d'écrire.
6. Vérifie : exécute pwsh -NoProfile -File hooks/fable-lint.ps1 (attendu : VERT ; si noyau
   par projet, ajuste d'abord la variable $NOYAU en tête de hooks/fable-lint.ps1, sinon le
   lint sort ROUGE « Noyau absent » ; sans pwsh, saute le lint et signale-le) et
   node scribe/test-session-scribe.mjs (attendu : TOUS LES TESTS PASSENT). Colle les sorties.
7. Rapporte étape par étape : fait / preuve observée / ce qui reste à ma charge. Si un point
   échoue, diagnostique la cause racine avant toute nouvelle tentative.
```

Installation manuelle sans agent : `INSTALL.md`.

## Ce que ce système fait, et ne fait pas

**Il fait** : un raisonnement discipliné et vérifiable (statuts épistémiques, confiance
adossée à des vérifications nommées, passe adversariale avant livraison), une documentation de
session qui survit aux compactions, et des garde-fous mécaniques qui ne dépendent pas de la
discipline du modèle (hooks, lint, deny sélectif, redaction de secrets).

**Il ne fait pas** : de magie. La thèse a été MESURÉE : sur un benchmark held-out de tâches
courtes (2026-07-08), la lecture du référentiel complet a donné un delta NUL par rapport au
noyau condensé plus la mécanisation. Ce que ce banc établit : aucun gain incrémental du
référentiel complet sur tâches courtes. La valeur du noyau et des garde-fous mécaniques, elle,
n'a pas eu de condition contrôle « sans système » : elle relève de l'usage éprouvé, pas d'une
mesure. Le référentiel complet vise les chantiers longs (marathons multi-sessions), hors de
portée de ce banc. Le référentiel inclut son propre protocole de péremption : si un modèle
futur le rend inutile, il prévoit son retrait.

**Prérequis** : les hooks PowerShell exigent Windows et `pwsh` (portage bash bienvenu) ; les
scripts Node du module scribe sont cross-platform ; le tout suppose Claude Code. Testé sur
Claude Code 2.1.x : le module scribe exige le tool de dispatch « Agent » et les événements de
hooks SessionStart, PostToolUse, SubagentStop, PreCompact, SessionEnd et PreToolUse ; sur une
version où le dispatch s'appelle « Task », adaptez le matcher d'INSTALL.md étape 5 et les deux
tests d'égalité correspondants dans `scribe/`. Bonnes pratiques : installez depuis un commit ou
un tag figé et relisez les scripts avant de câbler un hook (c'est du code qui s'exécute à
chaque session). Projet indépendant, non affilié à Anthropic.

## FAQ courte

**Pourquoi en français ?** C'est la langue de travail d'origine du système ; les invariants de
langue (accents, typographie) font partie de ce qu'il vérifie. Adaptez-les à votre langue.

**Faut-il tout installer ?** Non. Le noyau seul (étape 1 d'INSTALL.md) suffit pour démarrer,
au meilleur rapport valeur/coût. Hooks, lint et scribe s'ajoutent par couches indépendantes.

**Est-ce spécifique à Opus et Sonnet ?** Les addenda le sont (c'est leur raison d'être : ils
corrigent les modes d'échec observés de chaque gamme). Les 12 modules sont communs, et
l'annexe A.3 décrit l'intégration d'un modèle futur.

**Le module scribe lit-il mes secrets ?** Il applique une redaction par motifs avant toute
écriture, hache les contenus en mode racine, gitignore ses dossiers par construction, et
s'éteint avec `SCRIBE_DISABLE=1`. Lisez `scribe/journal-lib.js` : tout est inspectable.

## Licence

MIT (voir `LICENSE`).
