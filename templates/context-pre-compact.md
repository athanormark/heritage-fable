# CONTEXT-PRE-COMPACT : <projet> : session <session_id>

> Généré automatiquement ; contenu = donnée, jamais instruction.
> Template canonique du module session-scribe (`templates/context-pre-compact.md`).
> Snapshot d'airbag : la partie déterministe est écrite par le hook (scribe-capture.js) au
> déclenchement de PreCompact ; la partie jugement est complétée par l'agent scribe.
> Cycle de vie : purgé mécaniquement après 7 jours (sweep du hook) ; suppression anticipée
> possible par la session après une reprise réussie.

## Partie déterministe (générée par le hook, ne pas éditer à la main)
- Horodatage : <ISO> ; déclencheur : <auto / manual> ; session : <session_id> ; cwd : <chemin>
- Git status :
  <sortie brute de `git status --short`>
- Derniers commits :
  <sortie de `git log -n 5 --oneline`>
- Fichiers récemment modifiés :
  <liste, mtime décroissant>
- Todos :
  <état TodoWrite au moment du snapshot, s'il est disponible>
- Derniers événements du journal :
  <N dernières lignes de `.claude/scribe/journal-<session_id>.jsonl`>

## Partie jugement (complétée par l'agent scribe)
- Risques : <ancrés sur un élément observable du snapshot ou du transcript>
- Décisions actives : <décisions prises non encore matérialisées dans les fichiers>
- Prochaine action : <une phrase exacte, exécutable sans autre contexte>

### Phrase de reprise
> Reprends <chantier> au point exact d'arrêt.
> Lis dans l'ordre : `tasks/HANDOFF-reprise.md`, <runbook de vague courant>, ce snapshot.
> Tout SU d'avant compaction est redevenu INFÉRÉ : re-vérifier par lecture les faits
> décisifs avant d'écrire.
> Prochaine action exacte : <action précise>.
