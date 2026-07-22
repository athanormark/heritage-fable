---
name: rules-distill
description: Distiller les principes transverses qui se répètent dans plusieurs skills/agents en une règle unique. Scanne l'arsenal, extrait les principes présents dans 2+ fichiers, et propose de les ajouter, réviser ou créer dans les règles (CLAUDE.md global/projet, mémoire perso). Squelette de gouvernance basse priorité : collecte déterministe par script, jugement par LLM, validation humaine obligatoire avant toute écriture de règle. À utiliser en maintenance périodique des règles, ou après un skill-stocktake qui révèle des patterns à promouvoir.
---

# rules-distill : distiller les principes répétés en règles

Quand le même principe (par exemple "bannir le cadratin dans tout texte destiné à autrui", "ne jamais envoyer de contenu confidentiel à un juge externe") apparaît dans plusieurs skills ou agents, il devrait vivre une seule fois, dans une règle, et être référencé depuis les skills. Cette skill remonte ces principes transverses et propose de les centraliser.

Squelette basse priorité : la mécanique est volontairement légère. Elle conserve le principe de la source (collecte déterministe + jugement LLM) et retire tout couplage d'origine : aucun préfixe de variable hérité, aucun chemin de plan ou de commande spécifique à un outil source, aucun handoff externe. Vos règles vivent dans vos `CLAUDE.md` (global, projet) et votre mémoire perso, pas dans un dossier de règles hérité d'un autre outil.

## Quand activer
- Maintenance périodique des règles (mensuelle, ou après l'import de nouveaux plugins/skills).
- Après un `skill-stocktake` qui révèle des patterns récurrents à promouvoir en règle.
- Quand les règles paraissent incomplètes par rapport aux skills réellement utilisées.

## Quand NE PAS l'utiliser
- Pour trancher le sort d'une skill (garder/fusionner/retirer) : c'est `skill-stocktake`.
- Pour mesurer si une règle est suivie : c'est `skill-comply`.
- Pour un principe présent dans une seule skill : il reste dans cette skill (règle des 2+ fichiers).

## Exemple de pilote conceptuel
Un agent de rédaction porte souvent plusieurs principes de langue qui se retrouvent éparpillés dans d'autres skills et agents (zéro cadratin dans les textes destinés à autrui, vrais accents, ton adapté à certains destinataires, pas de tableau dans un e-mail). rules-distill est le mécanisme qui détecte ces répétitions et propose de les graver une fois dans le CLAUDE.md (section rédaction), puis de référencer cette règle depuis les skills concernées plutôt que de la recopier.

## Principe : collecte déterministe, jugement LLM
Les scripts collectent les faits de manière exhaustive (inventaire des skills, index des règles existantes) ; le LLM relit l'ensemble et produit des verdicts. Le script garantit l'exhaustivité, le LLM garantit la compréhension contextuelle.

## Trois phases

### Phase 1 : Inventaire (collecte déterministe)
Un script énumère les skills/agents (frontmatter + headings) et un autre indexe les règles existantes (CLAUDE.md global/projet, entrées mémoire). Présenter le résumé :

```
Distillation de regles - Phase 1 : Inventaire
Skills/agents : {N} fichiers scannes
Regles : {M} fichiers ({K} sections indexees)
```

Scripts (sans nom propre) à placer dans `scripts/` à côté de ce fichier (STATUT : esquisses à implémenter, non fournies ; `Get-SkillInventory.ps1` est partagé avec skill-stocktake, à mutualiser) :
- `Get-SkillInventory.ps1` : inventaire des skills/agents.
- `Get-RulesIndex.ps1` : index des sections de règles existantes.

### Phase 2 : Relecture croisée, appariement, verdict (jugement LLM)
Extraction et appariement en une passe. Les règles tiennent dans le contexte (texte intégral fourni au LLM, pas de pré-filtrage grep). Grouper les skills en clusters thématiques, analyser chaque cluster dans un sous-agent avec le texte intégral des règles, puis fusionner les candidats entre lots (dédupliquer, re-vérifier la règle des 2+ skills sur l'ensemble des lots).

Critères d'inclusion d'un candidat (TOUS requis) :
1. **Présent dans 2+ skills/agents** : un principe d'un seul fichier reste dans ce fichier.
2. **Changement de comportement actionnable** : formulable en "faire X" ou "ne pas faire Y", pas "X est important".
3. **Risque de violation clair** : ce qui casse si le principe est ignoré (1 phrase).
4. **Pas déjà dans les règles** : vérifier le texte intégral, y compris les concepts exprimés autrement.

Verdicts possibles : **Ajouter** (à une section existante), **Réviser** (corriger un contenu inexact ou insuffisant), **Nouvelle section**, **Nouveau fichier de règle**, **Déjà couvert**, **Trop spécifique** (reste au niveau skill).

Format de sortie par candidat :

```json
{
  "principle": "1-2 phrases en forme 'faire X' / 'ne pas faire Y'",
  "evidence": ["nom-skill: section", "nom-agent: section"],
  "violation_risk": "1 phrase",
  "verdict": "Ajouter | Reviser | Nouvelle section | Nouveau fichier | Deja couvert | Trop specifique",
  "target_rule": "fichier section, ou 'nouveau'",
  "confidence": "haute | moyenne | basse",
  "draft": "Texte propose pour Ajouter/Nouvelle section/Nouveau fichier",
  "revision": { "reason": "...", "before": "...", "after": "..." }
}
```

Exclure : les principes évidents déjà dans les règles ; les connaissances spécifiques à un langage/framework (vont dans des règles/skills dédiées) ; les exemples de code et commandes (restent dans les skills).

### Phase 3 : Revue utilisateur et exécution
Présenter une table de synthèse (candidat, verdict, cible, confiance) puis le détail par candidat (evidence, risque, brouillon). L'utilisateur répond par numéro : **Approuver** (appliquer le brouillon tel quel), **Modifier** (éditer avant d'appliquer), **Ignorer**.

**Ne jamais modifier une règle automatiquement. Toujours exiger l'approbation utilisateur.** Ne jamais éditer une doc partagée ni les CLAUDE.md sans accord explicite ; l'orchestrateur applique les règles validées.

Sauvegarder dans `results.json` (horodatage UTC à la seconde, id de candidat en kebab-case dérivé du principe).

## Principes de conception
- **Quoi, pas comment** : extraire des principes (territoire des règles). Exemples de code et commandes restent dans les skills.
- **Lien retour** : le brouillon inclut une référence "voir skill : [nom]" pour retrouver le comment détaillé.
- **Garde-fou anti-abstraction** : le triple filtre (2+ skills, test d'actionnabilité, risque de violation) empêche les principes trop abstraits d'entrer dans les règles.
- **Validation humaine** : aucune écriture de règle sans approbation ; aucune modification de la doc partagée.

## Routage modèle (rôles)
Un modèle rapide pour l'inventaire/collecte, le meilleur modèle disponible pour le jugement de distillation et la rédaction des brouillons de règles. Jamais le plus petit modèle de la gamme.

## Anti-patterns
- Promouvoir un principe présent dans une seule skill (viole la règle des 2+).
- Écrire une règle automatiquement sans validation utilisateur.
- Recopier un principe dans plusieurs skills au lieu de le centraliser et le référencer.
- Distiller un détail de code/commande (territoire skill, pas règle).

## Articulation avec le reste du système
rules-distill ferme la boucle de gouvernance : `skill-stocktake` audite la structure (doublons), `skill-comply` mesure la conformité comportementale, rules-distill remonte les principes récurrents vers les règles uniques (CLAUDE.md, mémoire perso). Les règles validées sont appliquées par l'orchestrateur ; la skill ne touche jamais la doc partagée ni les CLAUDE.md sans accord.
