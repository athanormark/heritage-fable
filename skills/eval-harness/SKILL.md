---
name: eval-harness
description: Cadre d'évaluation piloté par les evals (EDD, eval-driven development) : définir des critères de réussite mesurables AVANT le code, puis mesurer la fiabilité statistique par pass@k et pass^k. À utiliser dès qu'une feature, un agent, un prompt ou un pipeline à fort enjeu doit être fiabilisé par la MESURE et pas seulement validé qualitativement : "ce comportement est-il fiable à 90 % ?", "ajoute des evals", "mesure la régression", "pass@k", "EDD". Complète la Quality Gate (qualitative et binaire) par une mesure statistique de fiabilité. À mobiliser avant de déclarer fiable un comportement non capturable par un simple test unitaire.
---

# eval-harness : piloter le développement par les evals

La Quality Gate (fable/FABLE-REASONING) est qualitative et binaire : build vert, tests verts, confiance >= 0,95. Elle ne dit pas "ce comportement est-il fiable à 90 % sur 10 essais ?". Cette skill ajoute la mesure statistique manquante : on traite les evals comme les tests unitaires du développement assisté par IA.

## Quand activer
- Mettre en place l'EDD pour un comportement à fort enjeu (génération LLM, agent, prompt, pipeline de rédaction).
- Définir des critères de réussite pass/fail pour une tâche.
- Mesurer la fiabilité d'un agent par pass@k.
- Constituer une suite de régression pour un changement de prompt ou d'agent.

## Délimitation (ne pas dupliquer)
- **vs `anthropic-skills:skill-creator`** : skill-creator ÉVALUE la qualité d'une skill (son déclenchement, ses sorties). eval-harness PILOTE le développement d'un comportement par des evals écrites avant le code. On réutilise son grader, on ne refait pas son rôle.
- **vs la Quality Gate** : la gate est un verdict binaire de livraison (build/tests/confiance). eval-harness produit une mesure de fiabilité (pass@k) en amont du verdict. La gate reste la porte finale ; les evals l'alimentent.
- **vs un analyseur de couverture de PR** : lui analyse la couverture de tests d'une PR. eval-harness mesure la réussite comportementale, pas la couverture.

## Philosophie EDD
Définir le comportement attendu AVANT l'implémentation ; lancer les evals en continu ; suivre les régressions à chaque changement ; mesurer la fiabilité par pass@k.

## Deux types d'evals
- **Capability eval** : teste si le système sait faire quelque chose de nouveau. Format : tâche + critères de succès à cocher + sortie attendue.
- **Regression eval** : garantit qu'un changement ne casse pas l'existant. Format : baseline (SHA ou checkpoint) + liste de tests PASS/FAIL + résultat X/Y (vs Y/Y avant).

## Quatre graders
1. **Grader code (déterministe)** : vérifications par code (grep d'un pattern attendu, tests qui passent, build qui réussit). À privilégier : déterministe > probabiliste.
2. **Grader règle (regex / schéma)** : contraintes de forme vérifiables (format de sortie, schéma JSON, présence/absence de motifs).
3. **Grader modèle (LLM-as-judge)** : note 1 à 5 sur une rubrique pour les sorties ouvertes. **GARDE-FOU CONFIDENTIALITÉ NON NÉGOCIABLE** : sur un projet sensible ou tout contenu client furtif, le grader modèle est LOCAL uniquement (juge NLI/déterminisme local), JAMAIS un juge cloud. On n'envoie jamais de contenu client à un modèle externe. **Isolation réseau, pas seulement de modèle** : l'évaluation d'un contenu client sensible tourne avec un toolset SANS accès réseau ou MCP sortant (pas de WebFetch, pas de juge cloud, pas de CLI de recherche), pour empêcher l'exfiltration via un paramètre d'outil ou une prompt-injection présente dans le contenu évalué. Enfin, un grader modèle, même local, n'est jamais le SEUL gate d'un chemin critique : exiger un seuil de stabilité (pass^k sur le juge lui-même) ou une adjudication humaine en cas de score limite, sinon le juge probabiliste fragilise une porte binaire.
4. **Grader humain** : adjudication manuelle pour les sorties ambiguës ou les enjeux sécurité. Ne jamais automatiser entièrement un contrôle de sécurité.

## Métriques
- **pass@k** : "au moins un succès en k essais". pass@1 = fiabilité directe ; pass@3 = fiabilité pratique sous quelques retries.
- **pass^k** : "les k essais réussissent tous". Barre plus haute, pour les chemins critiques. pass^3 = 3 réussites consécutives.

**Seuils recommandés** :
- Capability evals : `pass@3 >= 0,90`.
- Regression evals : `pass^3 = 1,00` pour les chemins critiques de release.

## Workflow
1. **Définir (avant de coder)** : écrire les capability evals et les regression evals + les seuils dans `.claude/evals/<feature>.md`. Cela force à clarifier les critères de succès.
2. **Implémenter** : écrire le code/prompt pour passer les evals définies.
3. **Évaluer** : lancer chaque eval (grader adapté), enregistrer PASS/FAIL et le nombre d'essais.
4. **Rapporter** : produire l'EVAL REPORT.

## EVAL REPORT
```
EVAL REPORT : <feature>
Capability evals :
  <eval-1> : PASS (pass@1)
  <eval-2> : PASS (pass@2)
  Total    : N/N
Regression evals :
  <eval-a> : PASS
  Total    : M/M
Metriques : pass@3 = 0,XX | pass^3 = X,XX
Statut : SHIP IT | NOT READY
```
`SHIP IT` seulement si les seuils sont atteints (pass@3 >= 0,90 capability ET pass^3 = 1,00 regression critique). Sinon `NOT READY` : retravailler, ne pas livrer. Ce statut alimente la Quality Gate, il ne la remplace pas.

## Stockage
```
.claude/evals/
  <feature>.md      definition des evals
  <feature>.log     historique des runs
  baseline.json     baselines de regression
docs/releases/<version>/eval-summary.md   instantane de release
```

## Anti-patterns à éviter
- Surajuster les prompts aux exemples d'eval connus (overfitting).
- Ne mesurer que les sorties du happy-path.
- Ignorer la dérive de coût et de latence en courant après le taux de réussite.
- Laisser un grader instable (flaky) dans une porte de release.

## Routage modèle (rôles)
Un modèle rapide pour la lecture/collecte des résultats d'eval, le meilleur modèle disponible pour la conception des evals et l'analyse des échecs. Jamais le plus petit modèle de la gamme. Le grader modèle local (contenu sensible) tourne sur votre modèle local.
