# HANDOFF-reprise : <projet>

> Template canonique du module session-scribe (`templates/handoff-session.md`).
> UN seul fichier par projet (`tasks/HANDOFF-reprise.md`), versionné git, REMPLACÉ par fusion
> de sections : jamais dupliqué en versions datées.
>
> NOTE D'ÉCRITURE : écrivain canonique = l'agent scribe. Protocole : Read intégral, noter le
> mtime, fusionner SA section chantier seulement, Write, puis RE-LECTURE de contrôle du fichier
> écrit ; écart détecté (une autre session a écrit entre-temps) = écrire `HANDOFF-conflit-<ts>.md`
> à côté et le SIGNALER dans le rapport (la session tranche, arbitrage final : l'utilisateur).
> Fallback documenté : la session écrit elle-même selon le même protocole si le scribe est
> indisponible (kill switch, échec de dispatch) et le note dans la méta de la section.
> Projet avec système de planification propre : l'état de reprise vit dans `.planning/` (ou
> équivalent) ; le RÉFÉRENCER ici, jamais le dupliquer.
>
> CONTRAT DE REPRISE : un agent froid disposant du dépôt, de ce fichier et du snapshot doit
> identifier SANS AMBIGUÏTÉ : objectif, décisions actives, fait / en cours / bloqué, preuves,
> prochaine action exacte. Un HANDOFF qui ne le permet pas est un HANDOFF cassé.

## Reprise prioritaire
- Chantier : <nom du chantier le plus récent>
- Session : <session_id> ; date : <AAAA-MM-JJTHH:MM, ISO>
- PROCHAINE ACTION EXACTE : <une phrase actionnable sans aucun contexte supplémentaire>

## Chantier : <nom>
- Méta : session_id <sid> ; maj <ISO> ; état <actif / bloqué> ; écrit par <scribe / session (fallback)>
- Objectif : <une phrase>
- Décisions actives : <décisions qui contraignent la suite, ou pointeur vers leur source>
- Fait : <réalisé, chaque item avec sa preuve>
- En cours : <où l'on en est exactement, dernier geste posé>
- Bloqué : <quoi, pourquoi, qui ou quoi débloque ; ou « rien »>
- Preuves : <commits hash7, sorties de tests observées, chemins de livrables>
- Fichiers : <chemins des fichiers du chantier>

<répéter la section « ## Chantier : <nom> » pour chaque chantier actif du projet>

## Chantiers dormants
- <nom> : <une ligne : dernier état daté, pointeur vers son runbook ou sa note>
