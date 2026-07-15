# Runbook de vague : <projet> / <vague-phase> : <titre court>

> Template canonique du module session-scribe (`templates/runbook-phase.md`).
> Écrit par l'agent scribe à chaque frontière de vague (fallback : la session).
> Cycle de vie : distillé en note durable par le curateur mémoire à la clôture du chantier,
> puis archivé.
> Discipline : remplir Pré-requis, Agents/outils et Actions si interruption AVANT de commencer ;
> le reste au fil de l'eau ; phrase de reprise mise à jour avant de clore la vague.
> Statut épistémique porté sur chaque fait : SU (observé dans cette session) ou
> INFÉRÉ (rapport d'agent, déduction). Un fait sans statut se lit comme SUPPOSÉ.

## /goal
<critère de succès chiffré et vérifiable, une phrase>

## Agents et outils mobilisés
- Agent : <nom> (modèle résolu : <resolved_model>, durée ~<m> min)
- Skills : <liste, ou aucune>
- MCP / CLI : <liste, ou aucun>

## Pré-requis (état au démarrage)
- Branche git : <branche> (SU : `git status` observé)
- Tests verts : <N tests, commande exécutée> (SU : sortie observée)
- Working tree : <propre / N fichiers non suivis, lesquels>
- Phases prérequises : <liste, faite ou non, preuve>
- Fichiers clés à lire avant d'agir : <liste>

## Actions menées (chronologique, au fil de l'eau)
1. <action, résultat observé, statut SU ou INFÉRÉ>
2. <...>

## Actions à mener si interruption (À REMPLIR AVANT de commencer)
1. <point de reprise exact : fichier, état attendu>
2. <vérification à refaire avant d'écrire (tout SU d'avant interruption redevient INFÉRÉ)>

## Fichiers créés / modifiés
| Chemin | Lignes | Description |
|---|---|---|
| <chemin> | <N> | <quoi et pourquoi> |

## Tests
| Fichier::test ou commande | Résultat observé |
|---|---|
| <...> | <vert / rouge, extrait de sortie> (SU) |

## Commits
| Hash | Sujet |
|---|---|
| <hash7> | <sujet conventionnel> |

## État final, risques résiduels et phrase de reprise
- [ ] Critère /goal atteint : <mesure> (SU)
- [ ] Tests : <N> verts (SU : sortie observée)
- [ ] Working tree : <état attendu>
- [ ] Invariants de langue et d'encodage : contrôle passé (SU)
- Confiance de la vague : <0,XX> (appuis : <vérifications nommées>)
- Risques résiduels : <ancrés sur un élément observable, ou « aucun identifié »>

### Phrase de reprise (si interruption)
> Reprends <projet / chantier> au point exact d'arrêt.
> Lis dans l'ordre : <tasks/HANDOFF-reprise.md>, ce runbook, <snapshot CONTEXT-PRE-COMPACT s'il existe>.
> État : <X> actions sur <Y> menées, prochaine action exacte = <action précise>.
> Branche <branche>, dernier commit <hash7>, tests <N> verts.
