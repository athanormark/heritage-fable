---
name: clarify
description: Élicitation structurée pour lever l'ambiguïté d'un brief, d'une spec ou d'un PRD AVANT de figer les exigences ou de chiffrer. À utiliser à l'ouverture d'une feature ou d'un projet quand le brief est flou, incomplet ou ambigu : RFP à qualifier, cahier des charges lacunaire, ou quand l'utilisateur dit "clarifie ce brief", "qu'est-ce qui manque", "pose-moi les bonnes questions", "ce brief est trop vague". Scanne 9 axes (scope, données, UX, non-fonctionnel, intégrations, cas limites, contraintes, terminologie, complétude), marque chaque axe Clear/Partial/Missing, puis pose au plus 5 questions priorisées une par une avec une recommandation justifiée. Couche AMONT (avant planification), distincte du questionnement par phase d'un outil de planification et de l'usage ponctuel direct d'AskUserQuestion. À mobiliser dès qu'on s'apprête à construire ou chiffrer sur un brief incertain.
---

# clarify : réduire l'ambiguïté d'un brief en amont

Construire ou chiffrer sur un brief ambigu est la première cause de dérive. Cette skill détecte méthodiquement ce qui est sous-spécifié, puis pose le minimum de questions à fort impact pour le combler, et encode les réponses directement dans le document. Elle se mobilise à l'OUVERTURE d'une feature ou d'un projet, avant qu'on fige les exigences. Elle opérationnalise l'étape COMPRENDRE du référentiel (fable/FABLE-REASONING) : reconstruire l'intention réelle avant d'agir.

## Position dans le pipeline amont (avant planification)

```
brief  ->  CLARIFY  ->  prd  ->  req-checklist  ->  planification (roadmap, phases)  ->  conception  ->  challenger de clôture
```

Elle s'exécute en amont, sur le brief brut ou sur un PRD encore incertain, avant qu'un outil de planification ne découpe quoi que ce soit.

## clarify face à la règle AskUserQuestion (réconciliation)

Le référentiel a une règle établie : tout doute, ambiguïté ou choix structurant déclenche `AskUserQuestion` avant d'agir. Cette skill ne la remplace pas, elle l'**orchestre** dans un cas précis.

| Situation | Outil | Pourquoi |
|---|---|---|
| Ouverture d'une feature ou d'un projet sur un brief flou | **clarify** | Balayage systématique des 9 axes, file priorisée, au plus 5 questions séquentielles, write-back dans le document |
| Doute ponctuel en cours d'exécution (un choix isolé surgit) | **AskUserQuestion** directement | Une à quatre questions groupées, pas de scan ni de write-back, on reprend la tâche aussitôt |

Concrètement, clarify **emploie** AskUserQuestion comme mécanisme d'interface pour poser chaque question. La différence n'est pas l'outil, c'est le processus : clarify scanne, priorise et consigne ; l'usage direct répond à un besoin isolé. clarify ne périme donc pas la règle AskUserQuestion ; il en est la déclinaison outillée pour la passe d'élicitation amont.

## Processus

### 1. Scan de couverture (9 axes)

Lire le document (brief, spec ou PRD). Pour chacun des 9 axes, marquer le statut **Clear / Partial / Missing**. Construire une carte de couverture interne (ne pas l'afficher si aucune question ne sera posée).

1. **Scope (périmètre et comportement)** : objectifs utilisateurs et critères de succès, hors-périmètre explicite, rôles et personas.
2. **Modèle de données** : entités, attributs, relations, règles d'identité et d'unicité, cycle de vie et transitions d'état, hypothèses de volume et d'échelle.
3. **UX (flux d'interaction)** : parcours critiques, états erreur/vide/chargement, accessibilité et localisation.
4. **Qualités non fonctionnelles (NFR)** : performance, scalabilité, fiabilité et disponibilité, observabilité, sécurité et confidentialité, conformité et RGPD.
5. **Intégrations et dépendances externes** : services et API externes et leurs modes de défaillance, formats d'import/export, hypothèses de versioning et de protocole.
6. **Cas limites et gestion des défaillances** : scénarios négatifs, limitation de débit, résolution de conflits (éditions concurrentes).
7. **Contraintes et arbitrages** : contraintes techniques (langage, stockage, hébergement), arbitrages explicites ou alternatives déjà rejetées.
8. **Terminologie et cohérence** : glossaire canonique, synonymes à éviter, termes dépréciés.
9. **Complétude (signaux d'achèvement)** : testabilité des critères d'acceptation, Definition of Done mesurable, marqueurs TODO non résolus, adjectifs flous ("robuste", "intuitif", "rapide") non quantifiés.

Pour chaque axe Partial ou Missing, ajouter une question candidate, SAUF si : la clarification ne changerait pas matériellement l'implémentation ou la stratégie de validation, ou l'information est mieux différée à la phase de planification (le noter en interne).

### 2. File de questions priorisée (au plus 5)

Générer en interne une file de questions candidates. Contraintes :
- **Au plus 5 questions** sur toute la session.
- Chaque question doit être répondable soit par un choix multiple (2 à 5 options distinctes et mutuellement exclusives), soit par une réponse courte (5 mots maximum).
- Ne retenir que les questions dont la réponse impacte réellement l'architecture, le modèle de données, le découpage, le design des tests, l'UX, la mise en exploitation ou la conformité.
- Équilibrer la couverture : traiter d'abord les axes non résolus à plus fort impact ; ne pas poser deux questions à faible impact quand un axe critique (par exemple posture de sécurité) reste ouvert.
- Exclure les questions déjà répondues, les préférences purement stylistiques, et les détails d'exécution de niveau plan (sauf s'ils bloquent la justesse).
- Si plus de 5 axes restent non résolus, retenir les 5 meilleurs par l'heuristique **Impact x Incertitude**.

### 3. Boucle de questionnement (une question par tour)

Poser EXACTEMENT une question à la fois, via l'outil **AskUserQuestion** :
- Analyser les options et déterminer la **plus adaptée** (best practices du type de projet, réduction de risque sécurité/performance/maintenabilité, alignement avec les contraintes visibles).
- Présenter cette option en premier, libellée "(Recommandé)", avec une justification d'une à deux phrases. Fournir les alternatives, chacune avec ses implications.
- Après la réponse, valider qu'elle correspond à une option ou tient en 5 mots. Si ambigu, demander une désambiguïsation (cela ne compte pas comme une nouvelle question).
- S'arrêter quand : toutes les ambiguïtés critiques sont résolues plus tôt que prévu, ou l'utilisateur signale la fin ("stop", "ok", "ça suffit"), ou 5 questions ont été posées.
- Ne jamais révéler les questions suivantes à l'avance. Si aucune question valable n'existe au départ, le dire ("Aucune ambiguïté critique justifiant une clarification formelle") et proposer d'avancer.

### 4. Write-back atomique

Après CHAQUE réponse acceptée, mettre à jour le document immédiatement (limiter le risque de perte de contexte) :
- À la première réponse de la session, créer une section `## Clarifications` (juste après la section de contexte de plus haut niveau) puis un sous-titre `### Session AAAA-MM-JJ`.
- Y ajouter une ligne : `- Q: <question> -> R: <réponse finale>`.
- Appliquer aussitôt la clarification à la section concernée : ambiguïté fonctionnelle vers les exigences ; distinction d'acteur vers les user stories ; forme des données vers le modèle de données ; contrainte non fonctionnelle vers les critères de succès (convertir l'adjectif flou en métrique) ; cas limite vers la section dédiée ; conflit de terme vers une normalisation du vocabulaire.
- Si la clarification invalide une affirmation antérieure, la remplacer (ne pas dupliquer, ne laisser aucune contradiction).
- Sauvegarder après chaque intégration (écrasement atomique). Préserver la structure : ne pas réordonner les sections non concernées.

### 5. Synthèse de couverture

À la fin (ou en cas d'arrêt anticipé), rapporter :
- Nombre de questions posées et répondues.
- Sections du document modifiées.
- Tableau des 9 axes avec statut : **Resolved** (était Partial/Missing, traité), **Deferred** (dépasse le quota ou mieux placé en planification), **Clear** (déjà suffisant), **Outstanding** (toujours Partial/Missing mais faible impact).
- Si des axes Outstanding ou Deferred à fort enjeu subsistent, les signaler explicitement avant d'avancer.
- Étape suivante recommandée : la skill `prd` (si on partait d'un brief), la skill `req-checklist` (pour qualifier), ou votre outil de planification.

## Ce que cette skill NE fait pas (frontière amont)

- **Pas le questionnement d'un outil de planification.** Un outil de planification pose ensuite ses propres questions de cadrage (objectif, nommage du dépôt) et cadre chaque phase d'exécution par questionnement adaptatif. clarify opère bien plus en amont, sur le brief ou la spec, et se concentre sur les 9 axes de qualité d'exigence (données, NFR, cas limites, terminologie, intégrations) ; il ne re-pose pas les questions que la planification posera de toute façon. Éviter la double interrogation, qui ruine la crédibilité.
- **Pas une session AskUserQuestion ponctuelle.** Pour un doute isolé hors ouverture de feature, utiliser AskUserQuestion directement (la règle existante reste inchangée).
- **Pas la génération du document.** clarify amende un document existant. La création du PRD depuis le brief est le rôle de `prd` ; la qualification de la qualité des exigences celui de `req-checklist`.

## Usage concret

- **Qualifier un RFP avant chiffrage forfait** : passer le RFP au scan 9 axes révèle les trous (modèle de données absent, NFR implicites, intégrations non cadrées) qui, sinon, exploseraient en cours de forfait.
- **Valider un prompt ou une spec exécutable avant déploiement** : traiter le prompt comme une spec dont les "exigences" sont ce qu'il doit produire, et clarifier les axes Missing (cas limites, terminologie, critères de sortie) avant de pousser en production.
