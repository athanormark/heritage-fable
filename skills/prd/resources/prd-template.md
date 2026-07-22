# PRD : [NOM DU PRODUIT OU DE LA FEATURE]

**Projet** : [nom du projet]
**Date** : [AAAA-MM-JJ]
**Statut** : Brouillon
**Brief source** : [référence au brief, RFP, e-mail ou compte rendu d'échange]

> Ce document décrit CE QUI doit être vrai pour réussir et POURQUOI. Il s'arrête avant le COMMENT. La décomposition en phases d'exécution est faite ensuite par l'outil de planification (couche aval). Règle anti-invention : quand une information manque, écrire `TBD, à valider via {méthode}` plutôt que d'inventer une exigence plausible.

## Problème et contexte

### Problème
[2 à 3 phrases : qui a quel problème, et quel est le coût de ne pas le résoudre ?]

### Preuve
- [citation utilisateur, donnée chiffrée, ticket de support, comportement observé]
- [si aucune preuve : "Hypothèse, à valider via {recherche utilisateur | analytics | prototype}"]

### Utilisateurs
- **Principal** : [rôle précis, pas "les utilisateurs" ; contexte et déclencheur du besoin]
- **Pas pour** : [qui ce produit exclut explicitement, même s'ils le demandent]

### Hypothèse
Nous pensons que **[capacité]** permettra de **[résoudre le problème]** pour **[utilisateurs]**.
Nous saurons que c'est juste quand **[résultat mesurable]**.

## Scénarios utilisateur et tests *(obligatoire)*

> Chaque user story est prioritaire (P1 = la plus critique) et INDÉPENDAMMENT TESTABLE : si on implémente une seule story, on doit déjà disposer d'un MVP qui apporte de la valeur. Une story doit pouvoir être développée, testée, déployée et démontrée seule.

### User Story 1 - [Titre court] (Priorité : P1)
[Décrire ce parcours utilisateur en langage clair.]

**Pourquoi cette priorité** : [la valeur, et pourquoi ce niveau de priorité]

**Test indépendant** : [comment cette story se teste seule, par exemple : "Testable en faisant {action}, livre {valeur}"]

**Scénarios d'acceptation** :
1. **Étant donné** [état initial], **quand** [action], **alors** [résultat attendu]
2. **Étant donné** [état initial], **quand** [action], **alors** [résultat attendu]

---

### User Story 2 - [Titre court] (Priorité : P2)
[Parcours en langage clair.]

**Pourquoi cette priorité** : [valeur]

**Test indépendant** : [comment tester seule]

**Scénarios d'acceptation** :
1. **Étant donné** [état initial], **quand** [action], **alors** [résultat attendu]

---

### User Story 3 - [Titre court] (Priorité : P3)
[Parcours en langage clair.]

**Pourquoi cette priorité** : [valeur]

**Test indépendant** : [comment tester seule]

**Scénarios d'acceptation** :
1. **Étant donné** [état initial], **quand** [action], **alors** [résultat attendu]

---

### Cas limites
- Que se passe-t-il quand [condition aux limites] ?
- Comment le système gère-t-il [scénario d'erreur] ?

## Exigences *(obligatoire)*

### Exigences fonctionnelles
- **FR-001** : Le système DOIT [capacité précise et testable, par exemple : "permettre la création de comptes"]
- **FR-002** : Le système DOIT [capacité, par exemple : "valider les adresses e-mail"]
- **FR-003** : L'utilisateur DOIT pouvoir [interaction clé, par exemple : "réinitialiser son mot de passe"]
- **FR-004** : Le système DOIT [exigence de données, par exemple : "conserver les préférences utilisateur"]

*Exemple de marquage d'une exigence floue (maximum 3 marqueurs dans tout le document) :*
- **FR-005** : Le système DOIT authentifier via [NEEDS CLARIFICATION: méthode non précisée, e-mail/mot de passe, SSO, OAuth ?]

### Entités clés *(si la feature implique des données)*
- **[Entité 1]** : [ce qu'elle représente, attributs clés, sans détail d'implémentation]
- **[Entité 2]** : [ce qu'elle représente, relations avec les autres entités]

## Critères de succès *(obligatoire)*

> Mesurables et techno-agnostiques : aucune mention de framework, langage, base de données ou outil. Une bonne formulation décrit un résultat côté utilisateur ou business, vérifiable sans connaître l'implémentation.

- **SC-001** : [métrique mesurable, par exemple : "L'utilisateur termine la création de compte en moins de 2 minutes"]
- **SC-002** : [métrique de volume ou performance, par exemple : "Le système supporte 1000 utilisateurs simultanés sans dégradation"]
- **SC-003** : [métrique de satisfaction, par exemple : "90 % des utilisateurs réussissent la tâche principale au premier essai"]
- **SC-004** : [métrique business, par exemple : "Réduire de 50 % les tickets de support liés à X"]

## Périmètre

**MVP** : [le minimum nécessaire pour tester l'hypothèse]

**Hors périmètre**
- [élément] : [pourquoi il est différé]

## Jalons de livraison

> Résultats business visibles par l'utilisateur, pas des tâches d'ingénierie. L'outil de planification (couche aval) transforme chaque jalon en phases puis en plans d'exécution.

| # | Jalon | Résultat visible par l'utilisateur | Statut |
|---|---|---|---|
| 1 | [nom] | [changement visible] | en attente |
| 2 | [nom] | [changement visible] | en attente |

## Hypothèses et dépendances

> Défauts raisonnables retenus quand le brief ne précisait pas un détail. Les documenter ici évite de les faire passer pour des certitudes.

- [hypothèse sur les utilisateurs cibles, par exemple : "Connexion internet stable"]
- [hypothèse de périmètre, par exemple : "Le support mobile est hors périmètre en v1"]
- [dépendance à un système ou service existant, par exemple : "Réutilise l'API de profils existante"]

## Questions ouvertes
- [ ] [question non résolue qui pourrait changer le périmètre ou l'approche]

## Risques

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| [risque] | [faible/moyen/élevé] | [faible/moyen/élevé] | [comment le traiter] |

---
*Statut : BROUILLON, exigences seulement. Planification d'exécution à faire via l'outil de planification (couche aval). Qualifier ce document avec la skill req-checklist avant tout chiffrage forfait.*
