---
name: prd
description: Génère un PRD (Product Requirements Document) structuré à partir d'un brief flou. À utiliser dès qu'un projet ou une feature démarre, AVANT toute planification : briefs, RFP, appels d'offres, cahiers des charges à structurer, ou quand l'utilisateur dit "fais-moi un PRD", "cadre les exigences", "qu'est-ce qu'on doit livrer", "structure ce brief". Produit des user stories priorisées P1/P2/P3 testables indépendamment, des exigences FR-001 et des critères de succès SC-001 numérotés, mesurables et techno-agnostiques, avec séparation stricte du QUOI/POURQUOI et du COMMENT. Couche AMONT (avant planification) : l'outil de planification prend ensuite le relais pour l'exécution par phase. À mobiliser même si le mot "PRD" n'est pas prononcé, dès qu'il faut transformer une intention en exigences exploitables.
---

# prd : transformer un brief en PRD exploitable

Un brief arrive presque toujours flou : une intention, quelques contraintes, beaucoup d'implicite. Le rôle de cette skill est d'en extraire un document d'exigences solide AVANT qu'on engage du temps de planification ou un chiffrage. C'est la première marche de la chefferie de projet, symétrique du challenger de clôture : ici on garantit la qualité des EXIGENCES, le challenger garantit plus tard la qualité du LIVRABLE.

## Position dans le pipeline amont (avant planification)

```
brief  ->  [clarify]  ->  PRD  ->  [req-checklist]  ->  planification (roadmap, phases)  ->  conception (par phase)  ->  challenger de clôture
```

Cette skill se place **en amont de la planification**, jamais à sa place. Le PRD répond au QUOI et au POURQUOI ; l'outil de planification prend le relais sur le COMMENT (roadmap, découpage en phases, plans d'exécution). Voir la section "Ce que cette skill NE fait pas" pour la frontière précise.

## Posture

Adopter la posture d'un chef de produit exigeant qui :
- part du PROBLÈME, pas de la solution ;
- demande des preuves avant de construire ;
- raisonne en hypothèses testables, pas en spécifications figées ;
- pose des questions plutôt que de supposer ;
- reconnaît l'incertitude honnêtement.

**Règle anti-invention (la plus importante).** Quand une information manque mais qu'un défaut industriel raisonnable existe, retenir ce défaut et le consigner dans la section Hypothèses (ne pas en faire une question). Quand aucun défaut raisonnable n'existe, écrire `TBD, à valider via {méthode}` plutôt que d'inventer une exigence qui sonne plausible. La nuance est essentielle : ni inventer, ni cribler le document de `TBD` par paresse. Un PRD honnête sur ses vrais trous, mais complété par des défauts assumés là où c'est légitime, protège un chiffrage forfait d'une dérive.

## Processus

### 1. Cadrer le brief

Reformuler le brief en une phrase et la faire confirmer. Extraire les concepts clés : acteurs, actions, données, contraintes.

Faire un scan rapide de complétude sur les mêmes 9 axes que `clarify` (scope, modèle de données, UX, exigences non fonctionnelles, intégrations, cas limites, contraintes, terminologie, complétude). **Si 3 axes ou plus sont clairement Missing**, le brief est trop flou pour un bon PRD : invoquer d'abord la skill `clarify` (via le tool Skill) pour lever l'ambiguïté, puis revenir ici. Sinon, continuer : les zones d'ombre résiduelles seront traitées par des défauts raisonnables documentés et au plus 3 marqueurs NEEDS CLARIFICATION.

### 2. Générer le PRD

Partir du template `resources/prd-template.md` (fourni à côté de ce fichier ; le copier comme point de départ, préserver l'ordre des sections). Le remplir avec des éléments concrets dérivés du brief.

Règles de remplissage :
- **WHAT et WHY, jamais HOW** : aucune pile technique, API, structure de code ou nom de framework. Le PRD s'adresse à des décideurs, pas à des développeurs.
- **User stories priorisées** : chaque story porte une priorité (P1 = critique) et un **Test indépendant**. Le test prouve que la story, implémentée seule, livre déjà un MVP de valeur (développable, testable, déployable, démontrable seule). Une story qu'on ne peut pas tester seule doit être redécoupée.
- **Exigences fonctionnelles FR-001, FR-002...** : chaque exigence est numérotée, commence par "Le système DOIT" ou "L'utilisateur DOIT pouvoir", et est testable. Toute exigence vague doit échouer au test "testable et non ambiguë".
- **Critères de succès SC-001, SC-002...** : mesurables (temps, pourcentage, volume, taux) et techno-agnostiques (aucune mention de framework, base de données, latence d'API). Voir les exemples ci-dessous.
- **Défauts raisonnables** : pour les détails non précisés qui ont un défaut industriel évident (rétention de données standard, messages d'erreur conviviaux, authentification de session ou OAuth pour le web), choisir le défaut et le consigner dans la section Hypothèses.
- **Maximum 3 marqueurs NEEDS CLARIFICATION** dans tout le document, et seulement quand : le choix change significativement le périmètre ou l'expérience, plusieurs interprétations raisonnables existent avec des implications différentes, et aucun défaut raisonnable n'existe. Prioriser : **périmètre > sécurité/RGPD > expérience utilisateur > détails techniques**.

### 3. Résoudre les clarifications via AskUserQuestion

Pour chaque marqueur NEEDS CLARIFICATION (au plus 3), poser la question à l'utilisateur avec l'outil **AskUserQuestion**, en proposant une recommandation justifiée en première option puis des alternatives, chacune avec ses implications. Remplacer ensuite le marqueur par la réponse choisie. Si l'utilisateur n'est pas disponible, laisser le marqueur en `TBD` et le lister dans Questions ouvertes (ne jamais inventer la réponse).

### 4. Auto-validation qualité

Avant de livrer, valider le PRD contre cette checklist (corriger puis re-valider, 3 itérations maximum) :

**Qualité du contenu**
- [ ] Aucun détail d'implémentation (langage, framework, API)
- [ ] Centré sur la valeur utilisateur et le besoin métier
- [ ] Lisible par un interlocuteur non technique
- [ ] Toutes les sections obligatoires remplies

**Complétude des exigences**
- [ ] Aucun marqueur NEEDS CLARIFICATION restant (ou explicitement laissé en TBD assumé)
- [ ] Exigences testables et non ambiguës
- [ ] Critères de succès mesurables et techno-agnostiques
- [ ] Tous les scénarios d'acceptation définis
- [ ] Cas limites identifiés
- [ ] Périmètre clairement borné (MVP et hors périmètre explicites)
- [ ] Hypothèses et dépendances identifiées

Pour une qualification approfondie (avant un chiffrage forfait, ou pour un RFP à fort enjeu), ne pas se contenter de cette checklist interne : invoquer la skill `req-checklist` (via le tool Skill), qui génère de vraies "unit tests for requirements".

## Règles de formulation des critères de succès

Un critère de succès doit être mesurable, techno-agnostique, centré utilisateur, et vérifiable sans connaître l'implémentation.

**Bons exemples**
- "L'utilisateur termine le paiement en moins de 3 minutes"
- "Le système supporte 10 000 utilisateurs simultanés"
- "95 % des recherches renvoient un résultat en moins d'une seconde"

**Mauvais exemples (trop techniques, à reformuler)**
- "Le temps de réponse de l'API est sous 200 ms" -> "L'utilisateur voit les résultats instantanément"
- "La base supporte 1000 transactions par seconde" -> formuler une métrique côté utilisateur
- "Les composants React se rendent efficacement" -> bannir toute référence de framework

## Sortie et handoff

Écrire le PRD dans `docs/prd/{nom-en-kebab-case}.prd.md` du projet (ou un dossier `prd/` si la structure projet n'existe pas encore). Puis rapporter :

```
PRD créé : {chemin}

Problème   : {une ligne}
Hypothèse  : {une ligne}
MVP        : {une ligne}

Statut de validation :
  Problème    {validé | hypothèse}
  Utilisateur {concret | à préciser}
  Métriques   {définies | TBD}

Marqueurs NEEDS CLARIFICATION restants : {compte}
Questions ouvertes : {compte}

Étape suivante : qualifier le PRD avec la skill req-checklist avant chiffrage,
puis passer à la planification d'exécution.
```

## Ce que cette skill NE fait pas (frontière amont)

- **Pas de roadmap ni de découpage en phases d'ingénierie.** Le PRD liste des "Jalons de livraison" qui sont des résultats business. C'est l'outil de planification qui les transforme en phases et en plans d'exécution. Cette skill ne crée aucun de ces fichiers : elle produit le seul `prd.md`, qui sert d'ENTRÉE à la planification.
- **Pas de spécification technique.** La phase de spécification technique cadre les exigences TECHNIQUES d'une tâche de dev (décisions d'architecture, confiance). Le PRD est son INPUT amont, techno-agnostique, pas son remplaçant.
- **Pas d'élicitation exhaustive.** Le balayage systématique des 9 axes avec file de questions priorisées est le rôle de `clarify`. Ici on se limite à un scan rapide et à 3 marqueurs maximum.
- **Pas de checklist exhaustive de qualité des exigences.** L'auto-validation ci-dessus est légère. La qualification approfondie (avant chiffrage forfait) est le rôle de `req-checklist`.
- **Boucle de rétroaction.** Le pipeline va de l'amont vers l'aval, mais il n'est pas à sens unique : si une phase aval (conception, exécution) découvre une contrainte technique qui invalide un FR du PRD, le PRD doit être amendé en repassant par `clarify` ou `prd`, jamais contourné silencieusement en cours de phase.

## Usage concret

- **Qualifier un RFP ou un brief avant chiffrage forfait** : `clarify` puis `prd` donnent une base d'exigences stable. Un forfait posé sur un PRD flou dérive ; un PRD honnête sur ses hypothèses protège la marge.
- **Cadrer une feature interne** avant d'ouvrir un projet de planification.
