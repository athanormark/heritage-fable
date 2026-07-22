---
name: skill-stocktake
description: Auditer l'arsenal (skills, commandes, plugins, agents) pour la qualité et surtout les DOUBLONS et recouvrements. Détecte les skills qui se recouvrent (par exemple deux plugins qui couvrent le même terrain), produit un verdict par fichier (Garder / Améliorer / Mettre à jour / Retirer / Fusionner dans X) avec une raison autoportante et décisionnelle. Deux modes : Scan rapide (seulement les fichiers changés depuis le dernier run) et Inventaire complet (revue exhaustive par lots). À utiliser quand l'arsenal grossit, après l'import de nouveaux plugins/skills, ou périodiquement comme maintenance qualité. Couche gouvernance, complémentaire de skill-comply (conformité comportementale) et rules-distill (distillation de règles).
---

# skill-stocktake : auditer les doublons et la qualité de l'arsenal

Un arsenal accumule des skills, commandes, plugins et agents au fil des imports. Sans passe de rangement, deux skills finissent par couvrir le même terrain, une skill devient obsolète, ou un contenu se duplique avec un CLAUDE.md. Cette skill fait l'inventaire et tranche, fichier par fichier.

Elle conserve la lentille utile de la source (audit qualité + jugement holistique) et retire tout couplage d'origine : aucun préfixe de variable hérité, aucun chemin de plan ou de commande spécifique à un outil source, aucun handoff externe.

## Quand activer
- L'arsenal grossit et on soupçonne des recouvrements (par exemple plusieurs plugins SEO).
- Après l'import d'un nouveau plugin ou d'un lot de skills, pour vérifier qu'il n'y a pas de doublon avec l'existant.
- Périodiquement (mensuel, ou après un gros sprint d'upgrade arsenal) comme maintenance qualité.
- Avant une refonte de la doc d'arsenal : l'inventaire alimente la décision, il ne touche pas la doc.

## Quand NE PAS l'utiliser
- Pour mesurer si une règle est suivie à l'exécution : c'est `skill-comply`.
- Pour distiller des règles répétées en une règle unique : c'est `rules-distill`.
- Pour auditer un dépôt de code produit (readiness prod) : c'est `production-audit`.

## Délimitation (ne pas dupliquer)
- **vs `skill-comply`** : comply mesure le COMPORTEMENT (la règle est-elle suivie). stocktake regarde la STRUCTURE (la skill est-elle utile, unique, fraîche).
- **vs `rules-distill`** : distill remonte des principes récurrents vers des règles. stocktake tranche le sort de chaque skill (garder/fusionner/retirer).
- **vs votre doc d'arsenal** : cette doc DÉCRIT l'arsenal. stocktake produit des VERDICTS qui alimentent sa mise à jour par l'orchestrateur. La skill ne modifie jamais cette doc elle-même.

## Périmètre scanné
Chemins cibles typiques (à adapter à votre arborescence) :

| Chemin | Description |
|---|---|
| `skills/**/SKILL.md`, `~/.claude/skills/**/SKILL.md` | Skills (source de vérité) |
| `.claude/commands/**/*.md` | Commandes slash |
| `~/.claude/agents/*.md` | Agents actifs |
| Plugins installés | Recouvrements inter-plugins et avec les skills maison |

Au début de la phase d'inventaire, lister explicitement les chemins trouvés et scannés.

## Le cas du recouvrement (exemple à trancher)
Exemple concret de recouvrement : deux plugins SEO peuvent couvrir largement le même terrain SEO/GEO, et chevaucher en plus une skill maison. Le verdict attendu n'est pas "supprimer au hasard" mais : nommer les zones de recouvrement, identifier ce que chaque outil apporte d'unique, recommander lequel garder comme entrée principale et lequel fusionner ou cantonner à un sous-cas. La raison doit être autoportante (un lecteur décide sans relire les deux plugins).

## Deux modes

| Mode | Déclencheur | Durée indicative |
|---|---|---|
| Scan rapide | `results.json` existe (défaut) | 5 à 10 min |
| Inventaire complet | `results.json` absent, ou run explicite "complet" | 20 à 30 min |

Cache des résultats : `results.json` à côté de ce fichier (généré à l'exécution, hors versionnement si souhaité).

## Flux Scan rapide
Ne ré-évaluer que les fichiers changés depuis le dernier run.
1. Lire le `results.json` précédent.
2. Lancer le script de diff (compare les mtimes des fichiers contre `evaluated_at`).
3. Si la sortie est vide : rapporter "Aucun changement depuis le dernier run." et s'arrêter.
4. Ré-évaluer uniquement les fichiers changés avec les mêmes critères que la phase 2.
5. Reporter les skills inchangées depuis les résultats précédents.
6. Sortir seulement le diff, puis sauvegarder les résultats fusionnés.

## Flux Inventaire complet

### Phase 1 : Inventaire
Lancer le script de scan : il énumère les fichiers, extrait le frontmatter (name/description) et collecte les mtimes UTC. Présenter le résumé et la table d'inventaire.

```
Scan :
  ok  skills/**          (N fichiers)
  ok  .claude/commands/**  (M fichiers)
  ok  plugins installes   (P fichiers)
```

### Phase 2 : Évaluation qualité
Lancer un sous-agent (general-purpose) avec l'inventaire complet et la checklist. Pour chaque fichier, il rend un JSON :

`{ "verdict": "Garder"|"Ameliorer"|"Mettre a jour"|"Retirer"|"Fusionner dans X", "reason": "..." }`

**Découpage** : environ 20 fichiers par invocation de sous-agent pour garder le contexte gérable. Sauvegarder les résultats intermédiaires après chaque lot (`status: "in_progress"`). Reprise : si un `status: "in_progress"` est trouvé au démarrage, reprendre au premier fichier non évalué.

Checklist par fichier :
- [ ] Recouvrement de contenu avec d'autres skills/plugins vérifié.
- [ ] Recouvrement avec CLAUDE.md / mémoire vérifié.
- [ ] Fraîcheur des références techniques vérifiée (noms d'outils, flags CLI, APIs). Pour un contenu sans donnée client, un CLI de recherche live est toléré pour vérifier la fraîcheur ; sur projet sensible, rester local.
- [ ] Fréquence d'usage prise en compte.

Critères de verdict :

| Verdict | Sens |
|---|---|
| Garder | Utile et à jour |
| Améliorer | Vaut le coup, mais améliorations précises à faire |
| Mettre à jour | La techno référencée est obsolète (vérifier) |
| Retirer | Faible qualité, périmée, ou coût asymétrique |
| Fusionner dans X | Recouvrement substantiel avec une autre skill ; nommer la cible |

L'évaluation est un jugement holistique, pas un score numérique. Dimensions guides : actionnabilité (exemples, commandes, étapes utilisables tout de suite), adéquation de périmètre (name/trigger/contenu alignés), unicité (valeur non remplaçable par un autre fichier ou un CLAUDE.md), actualité (les références fonctionnent dans l'environnement courant).

**Qualité de la raison** (le champ `reason` doit être autoportant et décisionnel) :
- Ne jamais écrire "inchangé" seul : toujours redonner l'évidence centrale.
- Pour **Retirer** : (1) quel défaut précis, (2) qu'est-ce qui couvre le même besoin à la place.
  - Mauvais : "Superflu".
  - Bon : "Recouvre entièrement seo-schema d'un autre plugin ; generate-schema y couvre les mêmes types JSON-LD plus la validation. Aucun contenu unique restant."
- Pour **Fusionner** : nommer la cible et décrire le contenu à intégrer.
  - Bon : "Contenu mince (42 lignes) ; l'étape 4 de audit-page couvre déjà ce flux. Intégrer l'astuce d'angle éditorial comme note dans cette skill."
- Pour **Améliorer** : décrire le changement précis (quelle section, quelle action, taille cible si pertinent).
- Pour **Garder** (changement de mtime seul en Scan rapide) : redonner la raison du verdict initial, ne pas écrire "inchangé".

### Phase 3 : Table de synthèse

| Fichier | Usage | Verdict | Raison |
|---|---|---|---|

### Phase 4 : Consolidation
1. **Retirer / Fusionner** : présenter une justification détaillée par fichier AVANT toute confirmation (problème trouvé, alternative qui couvre le besoin, impact de la suppression sur les skills/docs dépendantes).
2. **Améliorer** : présenter des suggestions précises avec rationale ; l'utilisateur décide.
3. **Mettre à jour** : présenter le contenu mis à jour avec les sources vérifiées.
4. Vérifier la taille de votre fichier mémoire ; proposer une compression si elle dépasse votre limite documentée.

**Toute opération de retrait, fusion ou archivage exige une confirmation explicite de l'utilisateur.** La skill ne supprime ni ne modifie aucun fichier d'elle-même, et ne touche jamais la doc partagée.

## Scripts (exemple PowerShell)
Les scripts vivent dans `scripts/` à côté de ce fichier ; ils ne nomment aucune société (ils pourraient tourner en CI client sensible). Ils énumèrent les `*.md`, extraient le frontmatter, calculent les mtimes UTC, et comparent contre `evaluated_at` pour le mode rapide. STATUT : esquisses à implémenter, PAS fournies ; les créer avant le premier usage réel. `Get-SkillInventory.ps1` est partagé avec rules-distill : à mutualiser à l'implémentation.

- `Get-SkillInventory.ps1 [-Roots <chemins>]` : énumère et extrait le frontmatter ; sortie JSON.
- `Get-ChangedSkills.ps1 -Results <results.json>` : liste les fichiers nouveaux ou modifiés depuis `evaluated_at`.
- `Save-StocktakeResults.ps1 -Results <results.json>` : fusionne les verdicts évalués, fixe `evaluated_at` à l'heure UTC courante.

Pour l'horodatage, utiliser l'heure UTC réelle à la seconde (`(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')`), jamais une approximation à la journée.

## Schéma du fichier de résultats
`evaluated_at` doit être l'heure UTC réelle de fin d'évaluation.

```json
{
  "evaluated_at": "2026-06-21T10:00:00Z",
  "mode": "full",
  "batch_progress": { "total": 80, "evaluated": 80, "status": "completed" },
  "skills": {
    "nom-skill": {
      "path": "skills/.../SKILL.md",
      "verdict": "Garder",
      "reason": "Valeur concrete, actionnable, unique pour le flux X",
      "mtime": "2026-06-15T08:30:00Z"
    }
  }
}
```

## Routage modèle (rôles)
Un modèle rapide pour l'inventaire et la lecture des fichiers, le meilleur modèle disponible pour le jugement de verdict et l'analyse des recouvrements. Jamais le plus petit modèle de la gamme.

## Notes
- L'évaluation est aveugle à l'origine : la même checklist s'applique à tout (skill maison, plugin importé). Pas de branchement de verdict par origine.
- Aucune suppression sans confirmation explicite. La skill ne modifie aucun fichier ni aucune doc partagée.

## Anti-patterns
- Supprimer une skill sans nommer ce qui couvre son besoin à la place.
- Trancher un recouvrement sans avoir lu les deux outils concernés.
- Écrire une raison non autoportante ("inchangé", "superflu").
- Modifier la doc partagée ou supprimer un fichier sans accord de l'utilisateur.

## Articulation avec le reste du système
stocktake audite la STRUCTURE de l'arsenal ; `skill-comply` mesure la CONFORMITÉ comportementale ; `rules-distill` remonte les principes récurrents vers les règles. Les verdicts alimentent la mise à jour de votre doc d'arsenal par l'orchestrateur (la skill ne touche jamais ces docs).
