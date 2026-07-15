# DOCUMENTATION-POLICY : politique de documentation vivante

> Source canonique de la documentation vivante du module session-scribe (édition publique).
> Le référentiel (`fable/FABLE-REASONING.md`, D.2bis, D.3) POINTE ici.
> Les CHIFFRES (seuils, TTL, caps) vivent ici et dans le code ; calibrez-les sur votre usage réel.
> Templates canoniques : ce dossier (runbook-phase.md, handoff-session.md, context-pre-compact.md).
> Contraintes non négociables : confidentialité des projets sensibles, fail-soft toujours visible,
> anti-surcharge, périmètre du scribe (il ne décide rien, n'écrit jamais la mémoire durable).

## a. Quand documenter quoi (matrice)
| Quoi | Quand | Qui écrit |
|---|---|---|
| tasks/todo.md | à chaque changement d'état d'une tâche | session (curateur mémoire en consolidation) |
| INSTINCT-CANDIDAT (leçon) | dès la découverte, EN travaillant | agents pilotes (debugger, qa, challenger par défaut) ; défauts majeurs confirmés des challengers |
| Runbook de vague | à chaque frontière de vague | agent scribe (fallback session) |
| HANDOFF-reprise.md | clôture de session + franchissement du cran dur (S3) | agent scribe (fallback session) |
| Mémoire durable (notes, leçons consolidées) | clôture de chantier, dispatché si le sas est non vide | votre curateur mémoire seul |

## b. Cycles de vie (remplacer, jamais accumuler)
| Note | Créée par | Vit | Remplacée ou purgée par (exécutant mécanique) |
|---|---|---|---|
| Journal JSONL (`.claude/scribe/`) | hooks (scribe-capture.js) | la session, puis 14 j | TTL 14 j : sweep du hook ; cap 5 Mo avec rotation préservant la fin |
| CONTEXT-PRE-COMPACT | hook + scribe | jusqu'à la reprise réussie | sweep TTL 7 j du hook (le scribe n'a pas Bash, il ne supprime rien) ; purge anticipée possible par la session après reprise réussie |
| HANDOFF-reprise.md (UN par projet) | scribe (fallback session) | permanent, versionné git | remplacé par fusion à chaque clôture (scribe) ; commit en gate de vague |
| Runbook de vague | scribe + session | le temps du chantier | distillé en note durable puis archivé (curateur mémoire, à la clôture) |
| Candidat leçon (sas) | agents pilotes | transit seulement | jugé PUIS purgé (curateur mémoire) |
| tasks/todo.md | session / curateur mémoire | permanent | purgé des tâches closes à chaque clôture (session) |
| leçons / notes durables | curateur mémoire | permanent, borné | consolidation périodique à taille bornée ; clos = historique |

## c. Format strict du bloc INSTINCT-CANDIDAT
Déposé dans le RAPPORT FINAL des agents pilotes (liste par défaut : debugger, qa, challenger ;
configurable via `SCRIBE_PILOT_AGENTS`). Marqueur ancré en DÉBUT DE LIGNE, format strict (un
marqueur cité dans un bloc de code ou une citation n'est pas extrait) :

```
INSTINCT-CANDIDAT:
declencheur: <situation qui doit rappeler la leçon>
action: <geste à faire ou à éviter>
confiance: <0.3 à 0.9>
preuve: <élément observé qui fonde la leçon>
```

- Invariant grep-able en FIN de rapport, toujours présent : « Instincts : N déposés » ou
  « Instincts : aucun (justifié) ».
- Extraction MÉCANIQUE (zéro token) : scribe-capture.js, à SubagentStop des types pilotes,
  greppe le marqueur dans `last_assistant_message`, applique la REDACTION (jeu de motifs
  partagé) au bloc AVANT dépôt, puis dépose dans le sas :
  `<sas>/<projet>/AAAAMMJJ-<agent>-<slug>.md`, frontmatter 7 champs
  (declencheur, action, confiance, preuve, agent, session, sensibilite).
- Le sas est GITIGNORÉ (file de transit, purgée après jugement). Confinement : projets
  sensibles (marqueurs `SCRIBE_SENSITIVE_MARKERS`) = dépôt local au projet uniquement ;
  le curateur mémoire est le SEUL promoteur vers la mémoire durable.
- Canal filet : le scribe extrait aussi du transcript PRINCIPAL seulement.

## d. Les 10 maillons comportementaux (liste FERMÉE) et leur signal mécanique
Ce qui n'est pas sur cette liste sera oublié ; ce qui y est sans signal sera la prochaine
« discipline non exécutée ».

| # | Maillon (reste comportemental) | Signal mécanique de rattrapage |
|---|---|---|
| 1 | Dispatcher le scribe à S1/S2 | threshold journalisé + fichier d'état `scribe-due-<sid>` injecté au SessionStart suivant |
| 2 | Documenter sous cran dur | deny mécanique |
| 3 | Scribe PUIS curateur mémoire si sas non vide | compteur du sas injecté au SessionStart |
| 4 | Intégrer le rapport du scribe | spot-check par la session : contrôle de langue + relecture |
| 5 | Commit du HANDOFF en clôture | gate de vague |
| 6 | Qualité du HANDOFF (le deny force l'arrêt, pas la fidélité) | test de reprise à froid périodique |
| 7 | Dépôt de candidats des pilotes | grep de l'invariant « Instincts : » à SubagentStop |
| 8 | Routage multi-modèles | `resolved_model` journalisé à chaque dispatch (traçabilité) |
| 9 | Consolidation mémoire durable | revue périodique du sas (fixez un SLA, 7 j est un bon défaut) |
| 10 | HUMAIN assumé : GO/NO-GO de généralisation, arbitrages de conflit HANDOFF | aucun (l'utilisateur, non mécanisable) |

11e signal (canary INDÉPENDANT des hooks) : le témoin de vie de scribe-capture.js compare la
fraîcheur des journaux à l'activité git récente. Le témoin de vie seul ne détecte pas sa propre
mort : ajoutez si possible un contrôle externe (lint, tâche planifiée) qui vérifie la présence
du câblage dans les settings de vos projets pilotes.

## e. Seuils de contexte : sens et effet
| Seuil | Sens | Effet mécanique |
|---|---|---|
| S1 | PRÉVOIR la frontière | advisory (additionalContext, high-water-mark réarmable) : clore le sous-problème en cours, planifier le dispatch du scribe |
| S2 | DISPATCHER le scribe | advisory + dette documentaire posée : fichier d'état `scribe-due-<sid>`, injecté au SessionStart suivant s'il n'est pas soldé |
| S3 | Cran dur : documenter ou rien | DENY SÉLECTIF en PreToolUse, message fixe (jamais d'écho du payload) |

Valeurs (constantes env-overridables, `SCRIBE_WINDOW_TOKENS` par projet ; calibration due
contre le point RÉEL d'auto-compact de votre compte) : fenêtre 1M : S1 = 550k, S2 = 700k,
S3 = 900k ; fenêtre 200k : S1 = 110k, S2 = 140k, S3 = 160k. Plancher absolu : S3 garantit au
moins 40k de tokens restants pour écrire ; premier franchissement observé déjà au-delà du
plancher : le deny s'applique quand même (un HANDOFF court tient dans 25k).

- Liste blanche FERMÉE sous deny : Read, Grep, Glob, TodoWrite, AskUserQuestion, Write/Edit
  vers les chemins de documentation du projet (`tasks/`, `docs/marathon/`, `.claude/scribe/`,
  `.planning/`), Agent restreint au `subagent_type` de votre scribe.
- Levée du deny : PREUVE POSITIVE uniquement : tokens relus sous S1 (compaction faite) OU
  HANDOFF/snapshot à mtime postérieur à l'armement. Jamais de levée sur erreur de lecture.
- Sûreté d'armement : le deny ne s'arme JAMAIS sur une fenêtre inférée par défaut
  (fenêtre non prouvée = advisory + `enforcement_degraded` journalisé).
- Disjoncteur : 10 denies consécutifs sans progrès = repli advisory + `enforcement_degraded`
  + témoin visible.
- Kill switch : `SCRIBE_DISABLE=1`, respecté par tous les hooks.

## f. HORS PÉRIMÈTRE (nommé, pour ne pas passer pour couvert)
- Transcripts en clair dans `~/.claude/projects` : surface PRÉEXISTANTE de Claude Code,
  NON couverte par ce dispositif.
- Sessions hors dossier projet (bureau, headless hors projet) : angle mort ASSUMÉ ;
  câblage individuel possible plus tard, sur besoin.
- Projets avec leur propre système de planification (`.planning/` ou équivalent) : l'état de
  reprise vit là-bas ; le HANDOFF le RÉFÉRENCE sans jamais le dupliquer (pas de double
  convention).
