---
name: output-evaluator
description: Grille d'auto-notation d'une sortie sur 5 axes notés de 1 à 5 (Exactitude, Complétude, Clarté, Actionnabilité, Concision), avec PREUVE obligatoire pour tout score inférieur à 5. À utiliser pour s'auto-noter avant de livrer une réponse non triviale : après du code sur 3 fichiers ou plus, un workflow multi-étapes, une session de debug à plusieurs tentatives, un document de conception ou une analyse écrite, ou quand on demande "note-toi" ou "c'était bien ?". Produit une scorecard structurée et un verdict Livrer / Corriger-N / Refaire. Lecture seule : ne modifie ni n'écrit aucun fichier. À ne pas confondre avec un challenger (revue adversariale externe d'un livrable) : ici c'est une grille d'auto-notation réutilisable.
---

# output-evaluator : grille d'auto-notation d'une sortie sur 5 axes

Après une tâche non triviale, on marque une pause pour noter sa propre sortie contre une grille structurée de 5 axes. Ce n'est PAS une porte binaire pass/fail : c'est une étape de réflexion délibérée qui rattrape les oublis, signale la surconfiance et fait remonter les points à améliorer avant que l'utilisateur ait à le faire. Elle opérationnalise la passe adversariale du référentiel (fable/FABLE-REASONING, module VI) sous forme de grille réutilisable.

C'est une grille d'auto-notation, pas un agent : aucune exécution autonome, aucun dispatch. On lit son propre livrable, on le note, on rend une scorecard. Lecture seule : cette skill ne modifie ni n'écrit aucun fichier (sauf si un axe faible est corrigeable en moins de 30 secondes, auquel cas la correction relève de la tâche en cours, pas de la skill).

## Quand l'utiliser
- Après du code qui couvre 3 fichiers ou plus, ou 50 lignes ou plus.
- Après un workflow multi-étapes (implémenter, tester, relire).
- Après une session de debug à 3 tentatives ou plus.
- Après un document de conception, une décision d'architecture ou une analyse écrite.
- Quand l'utilisateur demande "c'était bien ?" ou "note-toi".

## Quand NE PAS l'utiliser
- Pour une réponse triviale (typo, lookup factuel, action à une ligne) : la note serait du bruit.
- Comme substitut à la revue de clôture : un bon auto-score ne remplace pas le challenger indépendant.
- Comme porte de livraison binaire : ce rôle appartient à la Quality Gate (fable/FABLE-REASONING), pas à cette grille.

## Délimitation (ne pas dupliquer)
- **vs un challenger indépendant** : le challenger est une revue ADVERSARIALE EXTERNE d'un livrable réalisé (il relit le réalisé et rend un GO / NO-GO de livrabilité avec ses P0). output-evaluator est une grille d'AUTO-NOTATION RÉUTILISABLE que l'auteur applique à sa propre sortie. Mêmes axes de qualité possibles, mais l'un est un juge externe, l'autre une introspection notée. Le verdict de livrabilité reste la responsabilité du challenger ; un bon auto-score ne le remplace pas. Rappel du référentiel : l'auteur n'est pas l'arbitre de sa propre copie.
- **vs la Quality Gate** : la gate est binaire (build, tests, confiance >= 0,95). output-evaluator est un score 1 à 5 par axe qui alimente la réflexion en amont du verdict de gate, sans le remplacer.
- **vs eval-harness** : eval-harness mesure une fiabilité STATISTIQUE (pass@k sur plusieurs essais). output-evaluator note une SEULE sortie qualitativement contre 5 axes. L'un compte des réussites répétées, l'autre juge un livrable unique.

## Les 5 axes
| Axe | Question | Ce qu'il rattrape |
|---|---|---|
| **Exactitude** | Les faits, affirmations et sorties sont-ils corrects ? | Hallucinations, mauvais noms d'API, syntaxe erronée, affirmations fausses |
| **Complétude** | Tout ce que l'utilisateur a demandé est-il couvert ? | Cas limites oubliés, chemins d'erreur non traités, exigences oubliées, sous-tâches sautées |
| **Clarté** | L'explication est-elle compréhensible et bien structurée ? | Explications confuses, jargon non défini, contexte manquant, délayage |
| **Actionnabilité** | L'utilisateur peut-il agir immédiatement sur la sortie ? | Suggestions vagues, étapes manquantes, "tu devrais X" sans montrer comment, pas de chemin de vérification |
| **Concision** | A-t-on utilisé le minimum de mots nécessaires ? | Redondance, surexplication, répétition de la question, remplissage |

## Échelle de notation
```
5 - Exceptionnel : aucune amélioration raisonnable possible
4 - Bon : nits mineurs seulement, aucun manque substantiel
3 - Correct : répond à la demande mais a une faiblesse notable sur au moins un axe
2 - Faible : a un manque clair qui affecte l'utilisabilité ou la correction
1 - Pauvre : rate fondamentalement la demande ou contient des erreurs importantes
```

## La règle de preuve (non négociable)
Tout score inférieur à 5 DOIT citer une preuve précise. Un 3 ne peut pas se contenter de "ça pourrait être mieux" : il doit dire exactement ce qui manque ou ce qui est faux, en pointant le passage qui le justifie. Le mot d'ordre : **montrer le manque, pas seulement le nommer.** Un 5 sans preuve est de l'auto-félicitation, pas une évaluation : un vrai 5 prouve qu'il n'y a rien à améliorer (test vert cité, grep de vérification, source faisant autorité).

## Démarche
### 1. Rassembler la matière
- La demande initiale de l'utilisateur (relue dans la conversation).
- Sa propre sortie finale (le livrable).
- Toute sortie d'outil qui vérifie la correction (résultats de tests, codes de sortie, lint).
- Tout retour utilisateur reçu pendant la tâche (corrections, "réessaie", "ce n'est pas ça").

### 2. Noter chaque axe indépendamment
Travailler les 5 axes un par un. Pour chacun : lire la question de l'axe, chercher la preuve (ou son absence), attribuer 1 à 5, et si le score est inférieur à 5 écrire une note d'amélioration d'une phrase citant le manque. Ne PAS faire la moyenne dans sa tête puis travailler à rebours : noter chaque axe à neuf.

### 3. Produire le rapport
Le rapport doit contenir : un résumé d'une ligne ; la scorecard 5 axes (score + preuve par axe) ; le score global (moyenne simple, arrondie au dixième) ; 1 à 3 améliorations précises classées par impact ; un auto-contrôle ("l'utilisateur serait-il d'accord avec ce verdict ?") ; le verdict.

### 4. Appliquer l'amélioration
Si un axe est noté 3 ou moins : dire ce qu'on ferait différemment ; si le manque est corrigeable en moins de 30 secondes (lien manquant, formulation floue), le corriger tout de suite ; sinon le signaler explicitement : "cet axe est noté [score] à cause de [preuve]. Le refaire avec [correctif précis] le remonterait probablement à [score]."

## Ancres de notation par axe
Repères concrets quand on hésite entre deux notes.

### Exactitude
| Score | Ancre |
|---|---|
| 5 | Tous les faits vérifiés contre une sortie d'outil, une doc ou une source faisant autorité. Zéro erreur. |
| 4 | Une inexactitude mineure qui n'affecte pas la correction (mauvaise valeur par défaut d'un paramètre). |
| 3 | Une erreur factuelle significative, ou 3 inexactitudes mineures ou plus (mauvaise librairie qui marche dans ce cas précis). |
| 2 | Plusieurs erreurs significatives. La sortie échouerait si on la suivait. |
| 1 | Fondamentalement incorrect. Erreurs de syntaxe, endpoint inexistant, signature démentie par un grep. |

### Complétude
| Score | Ancre |
|---|---|
| 5 | Toutes les exigences explicites ET implicites couvertes. Cas limites et chemins d'erreur traités. |
| 4 | Toutes les exigences explicites couvertes. Une exigence implicite oubliée (ex. timeout non géré). |
| 3 | Une exigence explicite oubliée, ou 2 manques implicites ou plus. |
| 2 | Plusieurs exigences explicites oubliées. Solution partielle. |
| 1 | Rate la demande centrale. Livre quelque chose d'adjacent à ce qui était demandé. |

### Clarté
| Score | Ancre |
|---|---|
| 5 | Parfaitement structuré. Jargon expliqué ou évité. La hiérarchie visuelle aide à scanner. Zéro ambiguïté. |
| 4 | Globalement clair. Une section à mieux organiser ou un terme non défini. |
| 3 | Compréhensible après relecture. Plusieurs problèmes d'organisation ou termes non définis. |
| 2 | Confus par endroits. Le lecteur devrait poser des questions de suivi. |
| 1 | Inintelligible ou contradictoire. Le lecteur ne peut pas déterminer ce qui a été fait ni pourquoi. |

### Actionnabilité
| Score | Ancre |
|---|---|
| 5 | Une seule action requise. Chemin de vérification inclus. Aucune étape implicite. |
| 4 | Une seule action requise mais le chemin de vérification est implicite, pas explicite. |
| 3 | Plusieurs actions requises, ou une action avec une étape suivante floue. |
| 2 | L'utilisateur doit comprendre comment utiliser la sortie. Instructions critiques manquantes. |
| 1 | La sortie ne peut pas être exploitée sans retravail ou clarification importante. |

### Concision
| Score | Ancre |
|---|---|
| 5 | Chaque phrase a sa place. Zéro redondance. Densité d'information élevée. |
| 4 | Redondance mineure. Un paragraphe à resserrer. |
| 3 | Redondance notable. 20 % ou plus du contenu retirable sans perte. |
| 2 | Significativement gonflé. 40 % ou plus de remplissage ou de répétition. |
| 1 | Le rapport bruit/signal est inversé. Plus de remplissage que de substance. |

## Format de rapport
```
============================================================
RAPPORT D'AUTO-NOTATION DE SORTIE
============================================================
Resume : score global X,X/5 sur 5 axes de qualite.

  Exactitude      ./5
    + [preuve : tests verts, affirmations verifiees]
    -> [amelioration : seulement si score < 5]

  Completude      ./5
    + [ce qui est couvert]
    -> [amelioration si score < 5]

  Clarte          ./5
    + [signaux de structure]

  Actionnabilite  ./5
    + [l'utilisateur peut agir immediatement]

  Concision       ./5
    + [densite d'information]

  GLOBAL          X,X/5

PROBLEMES CRITIQUES (axes <= 2) :
  [Axe] Score N/5 - correctif precis necessaire
  (ou "Aucun" si aucun axe <= 2)

Auto-controle : l'utilisateur serait-il d'accord ? [Oui/Non + justification breve]

AMELIORATIONS PRIORITAIRES :
  1. [correctif a plus fort impact]
  2. [le suivant]

VERDICT : [Livrer tel quel / Corriger N points puis livrer / Refaire]
```

## Logique de verdict
Le verdict découle des scores, pas d'une impression :

| Condition | Verdict |
|---|---|
| Un axe au moins est <= 2 | **Refaire** avec correctifs précis. Nommer l'axe le plus faible. |
| Aucun axe <= 2 mais un axe au moins est <= 3 | **Corriger N points puis livrer** (N = nombre d'axes <= 3). |
| Tous les axes >= 4 et global >= 4,5 | **Livrer tel quel.** Aucun changement nécessaire. |
| Tous les axes >= 4 et global < 4,5 | **Livrer tel quel.** Améliorations mineures notées. |

Lecture pratique du score global pour décider de l'action :

| Global | Action |
|---|---|
| >= 4,5 | Livrer tel quel. Aucun changement. |
| 3,5 à 4,4 | Signaler la première amélioration mais livrer. Corriger si moins de 30 secondes. |
| 2,5 à 3,4 | Dire ce qu'on changerait. Demander à l'utilisateur : "refaire [axe] ou livrer tel quel ?" |
| < 2,5 | Ne pas livrer. Dire : "ceci est noté [score] à cause de [preuve]. Je refais avec [correctif précis]." Puis refaire. |

## Cas limites
- **Instructions floues de l'utilisateur** : ne PAS pénaliser la complétude pour ne pas avoir lu dans les pensées. Noter plutôt : "la demande était ambiguë sur [périmètre]. J'ai choisi l'interprétation [X]. Si l'intention était [Y], ce score tomberait à [score]."
- **Tâche intrinsèquement simple** : un correctif de 3 lignes peut légitimement scorer 5/5/5/5/5. La grille s'échelonne avec la complexité : une tâche simple faite parfaitement EST un 5,0. Ne pas inventer de manques pour justifier des notes plus basses.
- **Erreur attrapée en cours de tâche** : si on a fait une erreur, on l'a attrapée et corrigée avant de livrer, c'est un 5 en Exactitude pour la sortie FINALE. L'évaluation porte sur ce que l'utilisateur a reçu, pas sur le process interne. Noter l'auto-correction comme preuve de rigueur, pas comme pénalité.
- **La sortie d'outil contredit l'affirmation** : si on a affirmé "tests verts" mais que le terminal montre un échec, c'est un Exactitude <= 2 automatique. La sortie d'outil est la vérité terrain. Les affirmations non vérifiées sont la première cause de scores d'exactitude bas.

## Anti-patterns à éviter
- **"Tout est à 5"** sans preuve citée : c'est de l'auto-félicitation, pas une évaluation.
- **Surpénaliser le hors-périmètre** : ne noter que contre ce que l'utilisateur a réellement demandé, pas contre ce qu'on aurait pu construire en plus.
- **Re-litiger une décision déjà prise** : l'évaluation porte sur le livrable, pas sur le re-débat d'un choix de conception déjà tranché.
- **Mélanger préférence personnelle et manque objectif** : "je n'aime pas X" n'est pas une preuve. Citer une préoccupation concrète de lisibilité, testabilité ou correction, sinon laisser la note à 4+.
- **Noter le process et non la sortie** : l'utilisateur se soucie de ce qui a été livré, pas du nombre d'itérations.

## Bonnes pratiques
- Une amélioration par axe faible (la plus à fort impact), pas cinq.
- Lier l'amélioration à l'impact utilisateur : "le chemin d'erreur manquant fera planter l'appel API en silence" bat "ajouter de la gestion d'erreur".
- Être précis sur ce que "corrigé" veut dire : "relancer avec le transport configuré pour les retries" bat "régler le souci de librairie".
- Utiliser les sorties d'outil comme preuve : si les tests passent, les citer ; si le lint est propre, le citer. Ne pas deviner, grep la preuve.
- Si on ne trouve aucun manque, chercher plus fort : un score parfait sur les 5 axes est rare. Se demander : "en tant qu'utilisateur, qu'est-ce qui m'agacerait dans cette sortie ?"

## Articulation avec le reste du système
- **Réutilisable par un challenger** : un agent challenger peut appeler cette grille comme cadre commun de notation par axe avant de formuler son verdict adversarial. La grille structure l'analyse ; le GO / NO-GO de livrabilité et la chasse aux P0 restent l'apanage du challenger.
- **Réutilisable par une gate QA** : pour noter un livrable de manière homogène, en complément de la mesure statistique de `eval-harness` (pass@k) et de la Quality Gate du référentiel.
- Voir aussi `production-audit` (verdict de risque prod chiffré), `req-checklist` (maturité des exigences en amont), `eval-harness` (fiabilité statistique).

## Routage modèle (rôles)
Conception de la grille et analyse des manques : le meilleur modèle disponible. Lecture et collecte des sorties d'outil servant de preuve : un modèle rapide. Jamais le plus petit modèle de la gamme. Sur un projet confidentiel ou tout contenu client furtif, cette grille s'applique en LOCAL : on ne soumet jamais un contenu client à un juge externe (cloud) pour le noter. L'auto-notation est une introspection de l'auteur, elle reste dans le périmètre du projet.
