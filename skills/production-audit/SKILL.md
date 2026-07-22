---
name: production-audit
description: Audit de readiness production sur PREUVES LOCALES, sans jamais envoyer le dépôt à un service externe. À utiliser quand on demande si une app est prête à livrer, ce qui peut casser en prod, ce qu'on a oublié, avant un lancement, une démo, un rollout client ou une présentation, ou quand la CI est verte mais qu'on veut le risque prod et pas seulement le statut des tests. Produit un score 0-100 (Bloqué / Risqué / Livrable avec réserves / Solide) avec cap automatique à 69 sur les risques critiques (auth manquante sur donnée sensible, webhooks paiement non idempotents, migration de base unsafe, secret dans le bundle client). À mobiliser avant tout déploiement, même si le mot "audit" n'est pas prononcé.
---

# production-audit : vérifier la readiness production sur preuves locales

Cette skill garde la lentille utile de readiness production et retire le partage de données à un tiers : on construit l'audit à partir de preuves LOCALES et autorisées par l'utilisateur, jamais en téléversant le contenu du dépôt à un scanner externe. C'est un bon candidat pour être l'étape 0 de votre pipeline de déploiement.

## Quand l'utiliser
- "Est-ce prêt à livrer ?", "qu'est-ce qui casserait en prod ?", "qu'a-t-on oublié ?", "prêt à déployer ?".
- Une feature a été mergée et demande une passe de risque avant déploiement.
- Un lancement public, une démo, un rollout client ou une présentation approche.
- La CI est verte mais on veut le risque production, pas seulement le statut des tests.

## Quand NE PAS l'utiliser
- Pendant l'implémentation active : utiliser d'abord une revue de sécurité ligne à ligne.
- Pour une pure librairie, un template ou un dépôt de docs, sauf si on veut la readiness de packaging ou de release.
- Pour un audit de conformité formel (légal, financier, médical, réglementaire) : cette skill est du triage d'ingénierie, pas une certification.
- Quand la seule preuve est une idée de produit sans dépôt, déploiement, CI ni surface runtime.

## Délimitation (ne pas dupliquer)
- **vs une checklist de déploiement** : une checklist déroule les étapes d'un déploiement. production-audit produit un VERDICT de risque chiffré AVANT, en étape 0. On référence la checklist, on ne refait pas sa liste.
- **vs une revue de sécurité** : la revue de sécurité est ligne à ligne pendant le code ; production-audit est une vue d'ensemble de readiness.
- **vs la Quality Gate** (fable/FABLE-REASONING) : la gate est binaire (build, tests, encodage). production-audit ajoute la lentille "risque de prod" (auth, idempotence, migration, rollback) que la gate ne couvre pas.

## Méthode
Preuves LOCALES uniquement. Ne pas exécuter de code distant non épinglé, ne pas téléverser le dépôt à un service tiers, ne pas appeler de scanner externe sans accord explicite sur l'outil ET le flux de données (sur projet confidentiel ou air-gap, ce principe est natif : tout reste local).

Ordre :
1. Établir la surface de release.
2. Lire les changements récents et l'état de la branche.
3. Inspecter les frontières qui existent réellement : runtime, auth, données, paiement, tâches de fond, IA, déploiement.
4. Vérifier CI, tests, migrations, documentation d'environnement, chemin de rollback.
5. Produire une recommandation livrer/bloquer avec des correctifs précis.

## Checklist de preuves
Commencer par les signaux locaux peu coûteux :
```
git status --short --branch
git log --oneline --decorate -20
git diff --stat origin/main...HEAD
```
Puis inspecter la surface du projet : scripts de package, workflows CI, scripts de release, Dockerfiles, manifestes de déploiement ; routes d'API, webhooks, middleware d'auth, workers, cron, migrations ; documentation des variables d'environnement et vérifications au démarrage ; observabilité, rapport d'erreurs, logs, health checks ; instructions de rollback, seed, migration, backfill ; couverture E2E des parcours qui comptent. Si une URL déployée est dans le périmètre, n'y faire que des vérifications non authentifiées, sauf compte de test fourni.

## Lentilles de risque
- **Sécurité et auth** : séparation routes publiques/admin ; auth et autorisation côté serveur ; secrets hors bundle client, logs, exemples, fichiers commités ; rate limits, CSRF, CORS, validation d'upload ; défense de la surface IA/agent contre l'injection de prompt et le passage de contenu non fiable vers une action privilégiée.
- **Intégrité des données** : migrations qui passent en avant proprement et ont un rollback ; migrations destructives et backfills mis en scène sans risque ; politiques et grants (RLS, rôles de service) alignés sur le modèle de tenance ; écritures, jobs et webhooks idempotents.
- **Paiements et webhooks** : signature vérifiée AVANT de lire les champs de payload ; chaque webhook de paiement, d'abonnement ou de fulfillment idempotent (un fournisseur de paiement livre souvent at-least-once : un événement peut passer la signature ET arriver deux fois ; sans idempotence, double provisioning) ; rejeu, doublon et hors-ordre gérés ; identifiants test et live séparés.
- **Opérations** : démarrage depuis un checkout propre avec des commandes documentées ; variables d'environnement nommées, validées, fail-fast ; health check prouvant que les dépendances sont joignables ; chemins de déploiement, rollback et responsable d'incident documentés ; logs utiles sans fuite de secret ni de donnée personnelle.
- **Expérience utilisateur** : parcours critiques couverts desktop et mobile ; formulaires utilisables sur mobile ; états chargement/vide/erreur/permission-refusée explicites ; chemin de support ou de récupération quand une opération critique échoue.

## Scoring
Les scores forcent la priorisation, ils n'impliquent pas une certitude mathématique.

| Bande | Score | Sens |
|---|---|---|
| Bloqué | 0-49 | Ne pas livrer tant que les risques majeurs ne sont pas corrigés |
| Risqué | 50-69 | Livrer seulement derrière un petit rollout ou une bêta interne |
| Livrable avec réserves | 70-84 | Livrer si les responsables acceptent les risques listés |
| Solide | 85-100 | Aucun bloqueur évident d'après les preuves disponibles |

**Cap automatique à 69** si l'un de ces points est vrai :
- Authentification ou autorisation manquante sur une donnée sensible.
- Webhooks de paiement ou de fulfillment non idempotents.
- Migration de base requise non exécutable en sécurité (pas de rollback).
- Secret exposé dans le bundle client, les logs ou un fichier commité.

**Cap automatique à 84** si la CI n'est pas verte ou si le parcours critique n'a pas été testé de bout en bout.

## Format de sortie
Une phrase d'abord :
```
Audit production : 76/100, livrable avec réserves, idempotence des webhooks et docs de rollback comme deux risques à corriger avant le lancement public.
```
Puis lister : `Bloqueurs` (à corriger avant déploiement) ; `Correctifs à forte valeur` (les suivants pour améliorer le score) ; `Preuves vérifiées` (fichiers, commandes, CI, URL, PR inspectés) ; `Preuves manquantes` (ce qui changerait la confiance) ; `Action suivante` (un correctif ou une vérification concrète). Garder les points forts courts : la réponse utile est le risque restant et l'action suivante.

## Anti-patterns
- Lancer `npx <package>@latest` ou un scanner distant comme chemin d'audit par défaut.
- Téléverser source, secrets, données client ou topologie privée à un service externe sans accord explicite.
- Produire un score sans nommer les preuves vérifiées.
- Traiter une CI verte comme une readiness production.
- Terminer par un générique "dis-moi ce que tu veux faire".

## Articulation avec le reste du système
Les invariants idempotence-webhooks et migration-safety de cette skill se rattachent aux revues de paiement, de backend et de sécurité de votre écosystème. Voir aussi `eval-harness` (fiabilité statistique d'un comportement), `test-coverage` (couverture chiffrée), et votre checklist de déploiement.
