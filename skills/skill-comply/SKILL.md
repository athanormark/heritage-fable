---
name: skill-comply
description: Mesurer si les skills, règles et définitions d'agents sont RÉELLEMENT suivies, sur des traces d'exécution réelles et non sur de la théorie. Génère des scénarios à 3 niveaux de strictness de prompt (soutien, neutre, concurrent), rejoue l'agent, classe les séquences comportementales et rapporte des taux de conformité avec la chronologie complète des appels d'outils. À utiliser quand on demande "cette règle est-elle vraiment appliquée ?", après avoir ajouté ou modifié une skill/règle/agent, ou périodiquement comme maintenance qualité. Couche gouvernance, complémentaire de la Quality Gate (qualitative) et d'eval-harness (fiabilité comportementale). GARDE-FOU CONFIDENTIALITÉ : sur projet sensible, toute classification est LOCALE, jamais de contenu client à un juge externe.
---

# skill-comply : mesurer la conformité comportementale sur traces réelles

Une Quality Gate dit si une livraison respecte build/tests/confiance à un instant T. Elle ne dit pas si une règle écrite (confidentialité, invariants de langue, gate de livraison) est SUIVIE dans la pratique, scénario après scénario, même quand le prompt ne la rappelle pas. Cette skill mesure cet écart entre la règle écrite et le comportement observé.

Elle conserve la lentille utile de la source (mesure de conformité sur traces) et retire tout couplage d'origine : aucun préfixe de variable hérité, aucun handoff externe, aucun chemin de plan ou de commande spécifique à un outil source. Les scripts fournis en exemple sont en PowerShell (adaptez-les à votre environnement).

## Quand activer
- "Cette règle est-elle vraiment appliquée ?", "la confidentialité tient-elle sous pression ?", "les invariants de langue sont-ils respectés même quand le prompt ne les rappelle pas ?".
- Après l'ajout ou la modification d'une skill, d'une règle (CLAUDE.md) ou d'un agent, pour vérifier la conformité réelle.
- Périodiquement, comme passe de maintenance qualité de l'arsenal.
- Avant de promouvoir une règle en hook (la skill recommande la promotion quand la conformité par prompt seul est faible).

## Quand NE PAS l'utiliser
- Pour mesurer la fiabilité statistique d'un comportement (pass@k / pass^k) : c'est `eval-harness`.
- Pour auditer les doublons ou la fraîcheur de l'arsenal : c'est `skill-stocktake`.
- Pour un verdict de livraison binaire (build/tests) : c'est la Quality Gate.

## Délimitation (ne pas dupliquer)
- **vs `eval-harness`** : eval-harness mesure la FIABILITÉ d'un comportement attendu (pass@k sur une tâche définie). skill-comply mesure la CONFORMITÉ à une règle écrite sous strictness de prompt décroissante. On réutilise la notion de grader, on ne refait pas l'EDD.
- **vs `skill-stocktake`** : stocktake regarde la STRUCTURE de l'arsenal (doublons, fraîcheur). skill-comply regarde le COMPORTEMENT à l'exécution.
- **vs la Quality Gate** : la gate est un verdict d'instant. skill-comply mesure la tenue d'une règle dans la durée, sur plusieurs scénarios.

## Cibles supportées
- **Skills** (`*/SKILL.md`) : skills de workflow (audit, rédaction, eval).
- **Règles** (`CLAUDE.md` global, projet) : règles non négociables (confidentialité, invariants de langue, gate de livraison).
- **Agents** (`*.md` d'agent) : vérifier qu'un agent est bien invoqué quand il doit l'être.

## Exemples d'axes à mesurer en priorité
Adaptez ces axes à VOS règles non négociables. Exemples fréquents :
1. **Confidentialité / discrétion** : aucune occurrence d'un nom interne (marque, personne, autrice de trame) dans un livrable client généré ; aucun envoi de contenu client sensible vers un service externe. La conformité cible 100 % (zéro tolérance).
2. **Invariants de langue** : dans la langue du projet, orthographe et typographie correctes (par exemple, en français : vrais accents, zéro cadratin, zéro séquence d'échappement unicode, zéro entité HTML dans les textes destinés à autrui).
3. **Gate de livraison** : décomposition, vérification factuelle, effets de bord, tests, confiance par sous-problème, confiance globale, documentation. La trace doit montrer que la séquence attendue est honorée avant toute action de livraison.

## Méthode (6 étapes)
1. **Générer la spec** : à partir du fichier `.md` cible, dériver la séquence comportementale attendue (les étapes ordonnées qui prouvent la conformité).
2. **Générer les scénarios** à 3 niveaux de strictness :
   - **soutien** : le prompt rappelle explicitement la règle.
   - **neutre** : le prompt ne mentionne pas la règle.
   - **concurrent** : le prompt pousse vers une action qui tente la violation (par exemple "fais vite, peu importe la typographie").
   Le coeur de la mesure est l'indépendance au prompt : une bonne règle tient même au niveau neutre et concurrent.
3. **Rejouer l'agent** et capturer la trace des appels d'outils (chronologie, outil, entrée, sortie).
4. **Classer** chaque appel d'outil contre les étapes de la spec, par jugement (pas par regex seule, la regex rate les variantes).
5. **Vérifier l'ordre temporel** de manière déterministe (une étape "avant X" doit réellement précéder X).
6. **Rapporter** : spec, prompts, taux de conformité par scénario, chronologies annotées, recommandation de promotion en hook si la conformité par prompt seul est faible.

## GARDE-FOU CONFIDENTIALITÉ (non négociable)
Sur tout projet client sensible ou tout contenu client furtif, la phase de classification est **LOCALE uniquement** : aucun contenu client n'est envoyé à un juge externe (tout service cloud). On classe sur les traces avec un juge local éprouvé (NLI/déterminisme local) ou par vérification déterministe.

**Isolation réseau, pas seulement de modèle** : l'analyse d'une trace contenant du contenu client sensible tourne avec un toolset SANS réseau sortant (pas de WebFetch, pas de MCP cloud), pour empêcher toute exfiltration via un paramètre d'outil ou une prompt-injection présente dans la trace.

Quand la cible est une skill ou un agent SANS contenu client (par exemple mesurer la conformité d'une skill de design sur un projet vitrine), une classification via un juge cloud est tolérée si aucun contenu client sensible ne transite. En cas de doute, rester local.

## Scripts (exemple PowerShell)
Les scripts vivent dans `scripts/` à côté de ce fichier. Ils ne nomment aucune société (ils pourraient tourner en CI client sensible). STATUT : ce sont des esquisses à implémenter, PAS fournies ; les créer avant le premier usage réel (sinon erreur fichier introuvable).

- `Invoke-ComplyRun.ps1 -Target <chemin .md>` : run complet (spec, scénarios, rejeu, classification, rapport).
- `Invoke-ComplyRun.ps1 -Target <chemin> -DryRun` : sans coût, produit seulement spec et scénarios pour relecture.
- `Invoke-ComplyRun.ps1 -Target <chemin> -LocalOnly` : force la classification locale (défaut sur tout chemin reconnu comme sensible/client).

Esquisse d'orchestration PowerShell :

```powershell
param(
  [Parameter(Mandatory)] [string] $Target,
  [switch] $DryRun,
  [switch] $LocalOnly
)
$ErrorActionPreference = 'Stop'

# 1. Construire la spec attendue depuis le fichier cible
$spec = New-ComplianceSpec -Path $Target

# 2. Generer les scenarios a 3 niveaux de strictness
$scenarios = New-Scenarios -Spec $spec -Levels @('soutien','neutre','concurrent')

if ($DryRun) { return ($spec, $scenarios) }

# 3-5. Rejouer, classer (local si sensible/client), verifier l'ordre
$isClientContent = Test-SensitiveOrClientPath -Path $Target
$mode = if ($LocalOnly -or $isClientContent) { 'local' } else { 'auto' }
$results = foreach ($s in $scenarios) {
  $trace = Invoke-AgentReplay -Scenario $s
  Get-ComplianceResult -Spec $spec -Trace $trace -ClassifierMode $mode
}

# 6. Rapport autonome
Write-ComplyReport -Spec $spec -Scenarios $scenarios -Results $results
```

## Routage modèle (rôles)
La source route la génération et la classification vers un petit modèle rapide. Préférez un modèle rapide pour la lecture/collecte des traces, le meilleur modèle disponible pour la conception des specs/scénarios et l'analyse des non-conformités ; jamais le plus petit modèle de la gamme. Le grader local (contenu sensible) tourne sur votre modèle local.

## Format de rapport
Le rapport est autonome :
1. Séquence comportementale attendue (spec générée).
2. Prompts de scénario par niveau de strictness.
3. Score de conformité par scénario (et global par axe).
4. Chronologie des appels d'outils annotée par la classification.
5. (Optionnel, avancé) Recommandation de promotion en hook pour les étapes à faible conformité : informatif, la valeur principale reste la visibilité de conformité elle-même.

Une phrase de tête, puis le détail :

```
Conformite : confidentialite 100 %, invariants de langue 100 %, gate de livraison 6/7 (la documentation memoire n'apparait pas au niveau concurrent). 1 etape a renforcer.
```

## Anti-patterns
- Classer par regex seule : rate les variantes de formulation et les contournements.
- Mesurer la conformité uniquement au niveau "soutien" : un bon résultat là est trivial, la valeur est aux niveaux neutre et concurrent.
- Envoyer une trace contenant du contenu client sensible à un juge cloud : interdiction absolue.
- Produire un taux sans nommer les preuves (quels appels d'outils, quelle spec, quels scénarios).
- Traiter une recommandation de hook comme une obligation : c'est un signal, l'humain décide.

## Articulation avec le reste du système
Les axes mesurés sont vos invariants non négociables documentés dans vos CLAUDE.md. Cette skill mesure leur tenue comportementale, la Quality Gate les vérifie en instantané, `eval-harness` mesure la fiabilité statistique des comportements, `skill-stocktake` audite la structure de l'arsenal. Le garde-fou confidentialité (classification locale, isolation réseau) est partagé avec `eval-harness` et `production-audit`.
