---
name: test-coverage
description: Mesure la couverture de tests, classe les fichiers sous le seuil et génère les tests manquants par priorité jusqu'à >= 80 %. À utiliser quand l'utilisateur dit "la couverture est faible", "génère les tests manquants", "quels fichiers sont mal testés", "monte la couverture", ou avant une release pour fiabiliser un module peu testé. Détecte le framework (pytest, vitest, jest, cargo llvm-cov, go, jacoco), parse le rapport, liste les fichiers par couverture croissante, et génère les tests par priorité (happy path, erreurs, cas limites, branches). Couche qualité. À mobiliser dès qu'il faut transformer une couverture floue en plan de test priorisé et chiffré.
---

# test-coverage : mesurer la couverture et combler les trous

## Quand utiliser
- Avant une release : fiabiliser un module dont la couverture est inconnue ou faible.
- Après une feature : vérifier que le nouveau code est testé, pas seulement le happy-path.
- Sur un projet repris : établir une baseline de couverture et un plan de rattrapage.

## Delta (ne pas dupliquer un analyseur de tests de PR)
Un analyseur de tests de PR évalue qualitativement si une PR a des tests pertinents. Cette skill apporte ce qu'il n'a pas : **la MESURE chiffrée** (pourcentage par fichier) et **le RANKING** (les fichiers triés du moins couvert au mieux couvert, avec un plan de génération priorisé). On mesure et on classe ; lui juge la pertinence.

## Étape 1 : détecter le framework

| Indice présent | Commande de couverture |
|---|---|
| `pytest.ini` ou `pyproject.toml` (pytest) | `pytest --cov=src --cov-report=json` |
| `vitest.config.*` | `npx vitest run --coverage` |
| `jest.config.*` ou `package.json` (jest) | `npx jest --coverage --coverageReporters=json-summary` |
| `Cargo.toml` (Rust) | `cargo llvm-cov --json` |
| `go.mod` | `go test -coverprofile=coverage.out ./...` |
| `pom.xml` + JaCoCo | `mvn test jacoco:report` |

## Étape 2 : analyser le rapport
1. Lancer la commande de couverture.
2. Parser la sortie (résumé JSON ou terminal).
3. Lister les fichiers **sous 80 %**, triés du pire au meilleur.
4. Pour chaque fichier sous-couvert, identifier : fonctions ou méthodes non testées ; branches manquantes (if/else, switch, chemins d'erreur) ; code mort qui gonfle le dénominateur.

## Étape 3 : générer les tests manquants
Pour chaque fichier sous-couvert, générer les tests dans cet ordre de priorité :
1. **Happy path** : fonctionnalité principale avec entrées valides.
2. **Gestion d'erreur** : entrées invalides, données manquantes, pannes réseau.
3. **Cas limites** : tableaux vides, null/undefined, valeurs aux bornes (0, -1, MAX).
4. **Couverture de branche** : chaque if/else, case, ternaire.

Règles de génération :
- Placer les tests selon la convention du projet (`foo.ts` -> `foo.test.ts`, `test_foo.py`...).
- Réutiliser les patterns de test existants (style d'import, librairie d'assertion, approche de mock).
- Mocker les dépendances externes (base de données, API, système de fichiers).
- Chaque test indépendant, aucun état mutable partagé.
- Nommer les tests de façon descriptive (`test_create_user_with_duplicate_email_returns_409`).
- **Assertions significatives, pas du remplissage de couverture** : chaque test porte au moins une assertion comportementale sur la SORTIE (jamais un test sans assertion ni un `assert true` qui exécute la ligne sans rien prouver). 80 % de lignes couvertes par des assertions faibles est un faux sentiment de sécurité ; viser le chemin d'erreur réel et, si l'outillage le permet, la couverture de mutation.
- **Tester le comportement ATTENDU, pas le bug observé** : un test généré à partir de la sortie actuelle d'un code non couvert peut verrouiller un bug (régression verte sur un comportement faux). Valider l'attendu contre la spec ou le PRD ; tout test généré sur un chemin douteux passe par revue humaine.

## Étape 4 : vérifier
1. Lancer la suite complète : tous les tests doivent passer.
2. Relancer la couverture : vérifier l'amélioration.
3. Si toujours sous 80 %, répéter l'étape 3 sur les trous restants.

## Étape 5 : rapport before/after
```
Couverture
File                      Avant   Après
src/services/auth.ts      45 %    88 %
src/utils/validation.ts   32 %    82 %
Global                    67 %    84 %   PASS
```

## Garde-fou confidentialité (NON NÉGOCIABLE)
Sur du code sensible ou air-gap, la génération des tests se fait **LOCALEMENT, sans LLM cloud** : aucun fragment de code client ne part vers un service externe. **Isolation réseau, pas seulement de modèle** : l'opération sur du code client sensible tourne avec un toolset SANS accès réseau ou MCP sortant (pas de WebFetch ni d'appel cloud), pour empêcher l'exfiltration via un paramètre d'outil ou une prompt-injection présente dans le code lu. Les tests générés repassent par votre gate de confidentialité (aucune référence interne au prestataire ni à l'auteur) et par votre contrôle d'invariants de langue avant d'être commités. Un runtime peut être air-gap alors que sa toolchain de dev (build, tests) reste dans le périmètre : la couverture s'y mesure normalement.

## Zones à cibler en priorité
Fonctions à fort branchement (complexité cyclomatique élevée), gestionnaires d'erreur et blocs catch, utilitaires partagés, handlers d'API (flux requête vers réponse), et les cas limites classiques (null, undefined, chaîne vide, tableau vide, zéro, négatifs).
