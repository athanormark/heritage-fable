# SECURITY : modèle de menace et signalement

## Ce que vous installez

Ce dépôt fournit des hooks (PowerShell et Node.js) que Claude Code exécute automatiquement :
à chaque démarrage de session, avant et après certains appels d'outils, avant compaction et en
fin de session. Un hook est du code qui tourne sur votre machine avec vos droits, sans
confirmation à chaque exécution. C'est le point central du modèle de menace.

## Règles d'installation

1. **Relisez chaque script avant de le câbler.** Les scripts sont courts, commentés et sans
   dépendance externe (aucun paquet npm, aucune requête réseau). Si un comportement vous
   semble obscur, ne câblez pas.
2. **Installez depuis un commit ou un tag figé** (par exemple `v1.1.0`), jamais depuis la
   tête d'une branche. Vous savez alors exactement quel code vous avez relu, et une mise à
   jour du dépôt ne modifie jamais votre installation à votre insu.
3. **Fusionnez, n'écrasez pas.** Les blocs de hooks proposés dans INSTALL.md se fusionnent
   avec vos settings existants. Montrez-vous le diff (ou faites-le montrer par votre agent)
   avant toute écriture dans un fichier de settings.

## Ce que le module scribe fait de vos données

- **Redaction avant écriture** : toute chaîne externe (sortie git, message d'agent, chemin)
  passe une redaction par motifs de secrets puis une troncature avant d'être écrite dans un
  journal, un snapshot ou le sas de leçons. Motifs supplémentaires : `SCRIBE_REDACTION_EXTRA`.
- **Local uniquement** : aucune donnée ne quitte votre machine. Les écritures vont dans
  `.claude/scribe/` du projet (gitignoré par construction), `tasks/`, et le dossier temp
  système (`claude-scribe-*`).
- **Mode métadonnées seules** : en session racine de monorepo (`SCRIBE_ROOT_DIR`) ou si le
  gitignore ne peut pas être garanti, les snapshots ne contiennent que des chemins hachés,
  jamais de sorties git brutes ni de todos.
- **Projets sensibles** : `SCRIBE_SENSITIVE_MARKERS` force le dépôt local des candidats
  leçons (jamais dans le sas partagé).
- **Kill switch** : `SCRIBE_DISABLE=1` éteint tout, immédiatement, sans désinstaller.

## Limites connues

- La redaction est une défense par motifs : un secret d'un format inconnu peut lui échapper.
  Elle complète une hygiène de secrets (variables d'environnement, fichiers ignorés), elle ne
  la remplace pas.
- Le cran dur du garde de contexte (deny S3) est fail-open avant armement : si le transcript
  est illisible, il n'arme pas. C'est un choix délibéré (ne jamais bloquer une session sur un
  signal absent), documenté en tête de `scribe/context-guard.js`.
- Les hooks PowerShell exigent `pwsh` sur Windows ; ils ne font que lire les fichiers du
  dépôt et écrire leur état dans `~/.claude/fable-lint-state.json`.

## Signaler une vulnérabilité

Ouvrez une issue sur le dépôt GitHub (`https://github.com/athanormark/heritage-fable/issues`)
en décrivant le scénario : fichier concerné, entrée qui déclenche le problème, effet observé.
S'il s'agit d'une fuite de données exploitable, indiquez-le dans le titre ; le correctif sera
priorisé et publié sous un nouveau tag.
