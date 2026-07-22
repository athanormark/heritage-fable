---
name: req-checklist
description: Génère des "unit tests for requirements" : des checklists qui testent la QUALITÉ DES EXIGENCES (complètes, claires, cohérentes, mesurables, couvrantes), jamais le code. À utiliser pour qualifier un PRD, un brief, un RFP ou une spec exécutable AVANT de chiffrer un forfait, de planifier ou de déployer, ou quand l'utilisateur dit "ces exigences tiennent-elles ?", "qualifie ce RFP", "valide cette spec", "qu'est-ce qui cloche dans cette spec". Produit des items CHK### au format question, tagués [Completeness/Clarity/Consistency/Measurability/Coverage] avec traçabilité [Spec X.Y][Gap][Ambiguity][Conflict], en mode append-only. Couche AMONT, symétrique amont du challenger de clôture : le challenger teste le livrable, cette skill teste les exigences. À mobiliser dès qu'un document d'exigences doit être fiabilisé avant un engagement.
---

# req-checklist : des tests unitaires pour les exigences

## Le concept : tester les exigences, pas le code

Si une spécification est du code écrit en français, alors une checklist d'exigences est sa suite de tests unitaires. On ne teste pas si le système fonctionne ; on teste si les exigences sont bien écrites : complètes, non ambiguës, cohérentes, mesurables, et prêtes à être planifiées.

**Ce que cette skill ne fait PAS** (sinon elle deviendrait un test d'implémentation) :
- pas "Vérifier que le bouton se clique correctement"
- pas "Tester que la gestion d'erreur fonctionne"
- pas "Confirmer que l'API renvoie 200"
- pas vérifier que le code correspond à la spec

**Ce que cette skill fait** (validation de la qualité des exigences) :
- "Les exigences de hiérarchie visuelle sont-elles définies pour tous les types de carte ?" (complétude)
- "L'expression 'affichage proéminent' est-elle quantifiée avec une taille et un positionnement précis ?" (clarté)
- "Les exigences d'état au survol sont-elles cohérentes entre tous les éléments interactifs ?" (cohérence)
- "Les exigences d'accessibilité sont-elles définies pour la navigation au clavier ?" (couverture)
- "La spec définit-elle ce qui se passe quand l'image du logo échoue à charger ?" (cas limite)

## Position dans le pipeline amont (symétrique amont du challenger)

```
brief  ->  clarify  ->  prd  ->  REQ-CHECKLIST  ->  planification (roadmap, phases)  ->  conception  ->  challenger de clôture
```

Cette skill est la **porte miroir du challenger**. Le challenger de clôture teste la qualité du LIVRABLE en aval (relit du réalisé, verdict de livrabilité). req-checklist teste la qualité des EXIGENCES en amont (interroge de l'à-réaliser, verdict de maturité). Même esprit adversarial, objets opposés dans le temps. Aucun des deux ne produit ni ne planifie : ils qualifient.

## Quand utiliser

- Avant un **chiffrage forfait** : un forfait posé sur des exigences floues dérive et détruit la marge. La checklist force à écrire noir sur blanc ce qui n'est pas spécifié.
- Avant la **planification** : porte de maturité ("la spec est-elle prête à être découpée en phases ?").
- Avant le **déploiement d'une spec exécutable** : une spec exécutable est une exigence exécutable ; mal spécifiée, elle produit du hors-cible en boucle, en production.

## Processus

### 1. Clarifier l'intention (au plus 3 questions)

Dériver au plus trois questions contextuelles initiales (pas de catalogue pré-établi). Elles doivent être générées à partir de la formulation de l'utilisateur et des signaux extraits du document, ne porter que sur ce qui change matériellement le contenu de la checklist, et être omises si la réponse est déjà claire dans la demande. Extraire les signaux (domaine, indicateurs de risque comme "critique"/"conformité", audience comme "revue client"/"sécurité"), regrouper en axes candidats, puis formuler les questions (raffinement de périmètre, priorisation des risques, calibration de profondeur, cadrage de l'audience). Si l'interaction est impossible : profondeur Standard, audience Relecteur, focus sur les 2 axes les plus pertinents.

### 2. Charger le contexte

Lire le document à qualifier (PRD, brief, RFP, spec exécutable) et, s'ils existent, les documents liés. Ne charger que les portions pertinentes pour les axes actifs (éviter le dump complet). Ne jamais halluciner du contexte absent.

### 3. Générer la checklist

Écrire la checklist dans `<dossier du document>/checklists/{domaine}.md` (nom de fichier court et descriptif : `req-quality.md`, `ux.md`, `securite.md`). Comportement de fichier :
- Si le fichier n'existe pas : le créer et numéroter les items à partir de **CHK001**.
- Si le fichier existe : **ajouter** les nouveaux items en continuant la numérotation (si le dernier est CHK015, commencer à CHK016). Ne jamais supprimer ni remplacer le contenu existant. La checklist est **append-only**.

**Principe central : tester l'exigence, pas l'implémentation.** Chaque item évalue les exigences elles-mêmes selon cinq dimensions :
- **Completeness** : toutes les exigences nécessaires sont-elles présentes ?
- **Clarity** : les exigences sont-elles spécifiques et non ambiguës ?
- **Consistency** : les exigences s'alignent-elles sans se contredire ?
- **Measurability** : les exigences peuvent-elles être vérifiées objectivement ?
- **Coverage** : tous les scénarios et cas limites sont-ils traités ?

**Catégories** (grouper les items par dimension de qualité) : Complétude des exigences, Clarté des exigences, Cohérence des exigences, Qualité des critères d'acceptation (mesurabilité), Couverture des scénarios, Couverture des cas limites, Exigences non fonctionnelles (performance, sécurité, accessibilité), Dépendances et hypothèses, Ambiguïtés et conflits.

**Structure de chaque item** :
- Format question, sur ce qui est ÉCRIT (ou absent) dans le document.
- Dimension de qualité entre crochets `[Completeness/Clarity/Consistency/Measurability/Coverage]`.
- Référence de section `[Spec §X.Y]` quand on vérifie une exigence existante, ou marqueur `[Gap]` pour une exigence manquante, `[Ambiguity]`, `[Conflict]`, `[Assumption]`.
- **Traçabilité** : au moins 80 % des items doivent porter une référence ou un marqueur. Si aucun système d'identifiants n'existe dans la spec, le premier item est : "Un schéma d'identifiants pour les exigences et critères d'acceptation est-il établi ? [Traceability]".

**Couverture par classe de scénario** : vérifier que des exigences existent pour les scénarios Principal, Alternatif, Exception/Erreur, Récupération, Non fonctionnel. Pour chaque classe absente : "Les exigences de [type] sont-elles intentionnellement exclues ou manquantes ? [Gap]". Inclure la résilience et le rollback en cas de mutation d'état.

**Consolidation** : plafond souple à 40 items ; au-delà, prioriser par risque et impact. Fusionner les quasi-doublons qui testent le même aspect. Si plus de 5 cas limites à faible impact, créer un seul item : "Les cas limites X, Y, Z sont-ils traités dans les exigences ? [Coverage]".

**Strictement interdit** (cela en ferait un test d'implémentation) : tout item commençant par "Vérifier", "Tester", "Confirmer", "Contrôler" suivi d'un comportement ; toute référence à l'exécution de code, aux actions utilisateur, au comportement système ; "s'affiche correctement", "fonctionne", "clic", "naviguer", "rendre", "charger", "exécuter" ; tout détail d'implémentation (framework, API, algorithme).

**Patrons requis** : "Les [type d'exigence] sont-elles définies/spécifiées pour [scénario] ?" ; "Le terme [vague] est-il quantifié avec des critères précis ?" ; "Les exigences sont-elles cohérentes entre [section A] et [section B] ?" ; "Peut-on mesurer/vérifier objectivement [exigence] ?" ; "Les [cas limites] sont-ils traités dans les exigences ?" ; "La spec définit-elle [aspect manquant] ?".

### 4. Verdict de maturité des exigences

À la fin, rendre un **verdict de maturité** (distinct d'un verdict de livrabilité) :
- Nombre d'items, couverture par dimension, nombre de `[Gap]` / `[Ambiguity]` / `[Conflict]` critiques.
- **Exigences mûres** : peu de Gap critiques, critères mesurables, périmètre borné. Prêtes à planifier ou à chiffrer.
- **Exigences immatures** : plusieurs Gap/Conflict critiques. Retour vers la skill `clarify` ou `prd` avant d'engager quoi que ce soit.

### 5. Rapport

Chemin du fichier checklist, nombre d'items, création ou ajout, axes sélectionnés, profondeur, et le verdict de maturité avec les Gap/Conflict critiques à traiter en priorité.

## Exemples d'items (bons contre mauvais)

**Faux (testent l'implémentation) :**
- CHK001 - Vérifier que la page affiche 3 cartes [Spec §FR-001]
- CHK002 - Tester que les états de survol fonctionnent [Spec §FR-003]

**Justes (testent la qualité des exigences) :**
- CHK001 - Le nombre et la disposition des cartes sont-ils explicitement spécifiés ? [Completeness, Spec §FR-001]
- CHK002 - Les exigences d'état au survol sont-elles cohérentes pour tous les éléments interactifs ? [Consistency, Spec §FR-003]
- CHK003 - Le critère de sélection des éléments liés est-il documenté ? [Gap, Spec §FR-005]
- CHK004 - Les états de chargement sont-ils définis pour les données asynchrones ? [Gap]
- CHK005 - La "hiérarchie visuelle" peut-elle être mesurée objectivement ? [Measurability, Spec §FR-001]

## Ce que cette skill NE fait pas (frontière)

- **Ne teste jamais le code, le build, ni les tests automatiques.** Lire du code source, lancer un build, chercher des P0 d'implémentation : tout cela appartient au **challenger indépendant de clôture** (revue du livrable) et à la **Quality Gate** (build, tests). Cette skill ne lit que des documents d'exigences.
- **Ne rend pas de verdict de livrabilité.** Le GO/NO-GO sur le réalisé reste la responsabilité exclusive du challenger. Ici, le verdict porte sur la MATURITÉ des exigences (sont-elles prêtes à être planifiées), pas sur la livrabilité d'un produit. Un bon score de maturité ne garantit pas la livrabilité : ce sont deux portes différentes, à deux bouts du pipeline.
- **Ne vérifie pas l'exécution.** Une étape de vérification de travail teste que le livrable atteint le but de la phase. req-checklist teste en amont si le but lui-même est bien formulé. Ne pas dupliquer la logique de vérification d'exécution.

## Usage concret

- **Qualifier un RFP avant chiffrage forfait** : la checklist force à écrire ce qui n'est pas spécifié. Chaque `[Gap]` ou `NEEDS CLARIFICATION` résiduel devient une ligne de risque à provisionner dans le plafond du devis. Règle d'or : aucun devis forfait n'est émis tant que des Gap critiques ne sont pas transformés en lignes de risque chiffrées.
- **Valider une spec exécutable avant déploiement** : traiter la spec comme une exigence exécutable. Completeness (tous les cas d'entrée couverts, par exemple une source absente), Clarity (format de sortie, longueur, ton non ambigus), Consistency (pas de contradiction entre les consignes), Measurability (un critère de succès vérifiable existe), Coverage (chaque exigence métier, y compris vos invariants de langue et de confidentialité, a une instruction correspondante). Le verdict reste une maturité d'exigence, distincte du test fonctionnel réel (qui relève d'un run réel et du challenger). Les deux, jamais l'un à la place de l'autre.
