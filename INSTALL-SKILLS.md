# INSTALL-SKILLS : installer les skills, d'un coup

> Ce dépôt fournit des skills de MÉTHODE et de GOUVERNANCE, cohérentes avec le système de
> raisonnement Fable (triage, épistémologie, confiance calibrée, challenger, Quality Gate,
> chefferie de projet amont, protocole multi-modèles). Elles vivent dans `skills/`.
>
> Ce fichier fait deux choses : (a) il installe les skills MAISON de ce dépôt chez vous, et
> (b) il recense les skills EXTERNES recommandées, que ce dépôt NE redistribue PAS (licences
> tierces) mais que vous installez par leurs canaux officiels. Tout est cadré T4 : montrer le
> diff ou la commande exacte avant d'écrire, prouver chaque étape.

## LE PROMPT d'appropriation (tout d'un coup)

Ouvrez une session Claude Code à la racine de ce dépôt et collez ceci :

```
Installe les skills de ce dépôt et prépare les skills externes recommandées. Travaille en T4
(livrable critique) : chaque étape se termine par une preuve OBSERVÉE, et tu ne modifies AUCUN
fichier de settings, d'agent, ni de configuration de plugin sans m'avoir montré le diff ou la
commande exacte et obtenu mon accord. Aucun téléchargement externe sans mon accord explicite.

1. Lis INSTALL-SKILLS.md en entier, puis les frontmatters (name + description) de chaque
   skills/*/SKILL.md pour connaître le catalogue maison.

2. Skills MAISON (fournies par ce dépôt). AVANT toute copie :
   - liste les dossiers de skills/ et vérifie, pour CHACUN, que le champ `name:` du SKILL.md est
     IDENTIQUE au nom du dossier (résolution runtime : name = dossier = token d'invocation) ;
     signale tout écart, il casserait l'invocation.
   - vérifie les collisions : pour chaque nom, si ~/.claude/skills/<nom> existe déjà, ne l'écrase
     pas sans mon accord (montre ce qui diffère).
   Propose ensuite la copie de skills/* vers ~/.claude/skills/ (commande adaptée à mon OS, voir
   INSTALL-SKILLS.md « Installation manuelle »). Après copie, PROUVE : liste ~/.claude/skills/ et
   montre que les noms attendus sont présents ; pour une skill au hasard, confirme que le tool
   Skill la résout par son nom.

3. Skills EXTERNES (NON redistribuées ici : licences tierces). Ne télécharge rien en silence.
   Présente-moi la table « Skills externes recommandées » d'INSTALL-SKILLS.md avec, pour chacune,
   sa commande officielle exacte et ce qu'elle apporte. Marque l'ESSENTIELLE (superpowers, dont
   dépend la skill maison tdd-evidence-workflow) à part des optionnelles et des hors-thème.
   Pour chaque commande que je valide : les commandes /plugin (interactives) et npx, je les lance
   moi-même, ou tu les lances avec mon accord explicite, jamais par défaut. Après installation de
   superpowers, PROUVE que superpowers:test-driven-development et superpowers:writing-plans se
   résolvent.

4. Câblage aux agents. Si j'ai des agents (~/.claude/agents/ ou .claude/agents/), propose
   d'ajouter une section « Skills disponibles » listant les skills pertinentes à chaque agent
   concerné (voir la table de câblage d'INSTALL-SKILLS.md). Montre le diff de CHAQUE frontmatter
   AVANT d'écrire, un par un. Ne câble une skill qu'aux agents où elle a du sens.

5. Rapporte étape par étape : fait / preuve observée / ce qui reste à ma charge (les commandes
   externes que je dois lancer). Si un point échoue, diagnostique la cause racine avant toute
   nouvelle tentative.
```

Installation sans agent : section « Installation manuelle » en bas.

---

## (a) Skills MAISON fournies par ce dépôt (`skills/`)

Toutes en français, sanitisées, sans dépendance à un écosystème propriétaire. Elles se réfèrent
entre elles et au référentiel (`fable/FABLE-REASONING.md`) ou au protocole multi-modèles
(`multi-model/PROTOCOLE.md`), jamais à un outil tiers non fourni (sauf `superpowers`, voir plus
bas). Le champ `name:` de chaque SKILL.md est égal au nom de son dossier : c'est ce qui permet au
tool `Skill` de la résoudre une fois copiée dans `~/.claude/skills/`.

### Méthode et qualité

| Skill | Ce qu'elle apporte |
|---|---|
| `clarify` | Élicitation structurée d'un brief flou sur 9 axes, au plus 5 questions priorisées, write-back dans le document. Couche amont, avant toute planification. |
| `prd` | Transforme un brief en PRD (user stories P1/P2/P3 testables, exigences FR-001, critères SC-001 mesurables et techno-agnostiques). Template fourni dans `resources/`. |
| `req-checklist` | Des « tests unitaires pour les exigences » : teste la qualité des exigences (complètes, claires, cohérentes, mesurables, couvrantes), jamais le code. Porte miroir amont du challenger. |
| `context-budget` | Audit chiffré de l'overhead de contexte (agents, skills, MCP, chaîne CLAUDE.md) + guide de compaction stratégique + hook advisory `suggest-compact.js` (fourni). |
| `production-audit` | Verdict de readiness production 0-100 sur preuves LOCALES (jamais d'envoi du dépôt à un tiers), cap automatique sur les risques critiques. |
| `eval-harness` | Développement piloté par les evals (EDD) : critères mesurables avant le code, fiabilité par pass@k / pass^k. Garde-fou confidentialité (grader local). |
| `test-coverage` | Mesure la couverture, classe les fichiers sous le seuil, génère les tests manquants par priorité jusqu'à 80 %. Détecte pytest, vitest, jest, cargo, go, jacoco. |
| `tdd-evidence-workflow` | Couche de PREUVE autour du TDD : trace chaque exigence jusqu'à sa preuve RED/GREEN, checkpoints, rapport `.tdd.md` exportable en PR. INVOQUE `superpowers:test-driven-development` (voir dépendance ci-dessous). |
| `output-evaluator` | Grille d'auto-notation d'une sortie sur 5 axes (Exactitude, Complétude, Clarté, Actionnabilité, Concision), preuve obligatoire sous 5. Opérationnalise la passe adversariale du référentiel. |
| `codex-delegate` | Déléguer une tâche autoportante à un juge externe (CLI tiers couvert par abonnement), 2 gabarits (délégation stricte / contre-regard en aveugle), grille de contrôle au retour. Compagnon opérationnel de `multi-model/PROTOCOLE.md`. |

### Gouvernance de l'arsenal

| Skill | Ce qu'elle apporte |
|---|---|
| `skill-stocktake` | Audit des DOUBLONS et de la qualité de l'arsenal (skills, commandes, agents, plugins), verdict par fichier (Garder / Améliorer / Mettre à jour / Retirer / Fusionner). |
| `skill-comply` | Mesure si une règle écrite est RÉELLEMENT suivie, sur traces réelles, sous 3 niveaux de strictness de prompt (soutien, neutre, concurrent). |
| `rules-distill` | Remonte les principes répétés dans 2+ skills/agents vers une règle unique (CLAUDE.md, mémoire), avec validation humaine obligatoire. |

Les trois se complètent : `skill-stocktake` regarde la STRUCTURE, `skill-comply` le COMPORTEMENT,
`rules-distill` distille les principes en RÈGLES.

> Note : trois skills de gouvernance (`rules-distill`, `skill-comply`, `skill-stocktake`)
> décrivent des scripts PowerShell d'inventaire comme des ESQUISSES à implémenter (elles ne sont
> pas fournies clés en main). La méthode et les critères de jugement, eux, sont complets et
> utilisables tels quels ; les scripts sont un confort d'automatisation à écrire selon votre
> arborescence.

---

## (b) Skills EXTERNES recommandées (à installer par vos soins)

Ce dépôt ne les redistribue pas : elles ont leurs propres auteurs et licences. Installez-les par
leurs canaux officiels. Principe de sûreté (cohérent avec `SECURITY.md`) : ce sont des tierces
parties, **auditez la source et épinglez un commit ou un tag** avant d'installer ; les commandes
ci-dessous peuvent évoluer, vérifiez-les à la source.

### Essentielle (dépendance d'une skill maison)

| Skill / paquet | Pourquoi | Commande officielle |
|---|---|---|
| **superpowers** (obra) | Framework de skills de méthode : `brainstorming`, `writing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `requesting-code-review`. La skill maison `tdd-evidence-workflow` INVOQUE `superpowers:test-driven-development` et CONSOMME la sortie de `superpowers:writing-plans` (un fichier `.plan.md`), qu'elle n'invoque pas en dur : sans superpowers, elle n'a pas sa couche TDD. | Dans une session Claude Code : `/plugin marketplace add obra/superpowers-marketplace` puis `/plugin install superpowers@superpowers-marketplace`. Distribué par le système de plugins de Claude Code, pas par npm. |

### Complémentaires (méthode et qualité)

| Skill / paquet | Pourquoi | Commande officielle |
|---|---|---|
| **anthropic-skills** (dont `skill-creator`) | Créer, éditer et évaluer des skills. La skill maison `eval-harness` s'y réfère en délimitation (skill-creator évalue une skill, eval-harness pilote un comportement). Utile si vous écrivez vos propres skills. | Via la place de marché de plugins Anthropic (vérifiez le nom exact du plugin à la source). |
| **find-skills** | Découverte et installation de skills à la demande (« existe-t-il une skill pour X ? »). C'est l'étage externe de la découverte à 3 étages (voir plus bas). | Cherchez `find-skills` dans une place de marché de plugins Claude Code, ou à sa source publique. |

### Hors du thème de ce dépôt (design, souvent demandées)

Ce dépôt est un système de raisonnement ; ces skills de DESIGN ne relèvent pas de son périmètre.
Elles reviennent souvent dans les demandes, on les recense ici par commodité. À installer
seulement si votre travail les justifie.

| Skill / paquet | Ce qu'elle apporte | Commande officielle |
|---|---|---|
| **impeccable** (pbakaus) | Langage de design d'interface premium (polish, critique, audit) pour harnais IA. | `npx skills add pbakaus/impeccable` (auto-détecte le harnais et écrit dans `.claude/skills/`), puis `/impeccable init`. Alternative : `/plugin marketplace add pbakaus/impeccable`. |
| **emil-design-eng**, **apple-design** (emilkowalski) | Polish UI, détails d'interaction, esthétique de type Apple. | `npx skills add emilkowalski/skills` (vérifiez le contenu du dépôt à la source). |
| **design-motion-principles** (kylezantos) | Principes de motion et de micro-interaction (d'après Emil Kowalski, Jakub Krehel, Jhey Tompkins). | `npx skills add kylezantos/design-motion-principles`. |
| **frontend-design** (plugin officiel) | Cadre de design frontend de bout en bout. | `/plugin install frontend-design@claude-plugins-official`. |

> La commande `npx skills add <owner>/<repo>` provient de la CLI publique `skills`, qui détecte
> votre harnais (Claude Code, Cursor, Codex, etc.) et écrit les skills au bon endroit. Comme pour
> tout téléchargement tiers, relisez ce qui est écrit avant de vous en servir.

---

## (c) Câblage : déclarer les skills à vos agents

Une skill copiée dans `~/.claude/skills/` est déjà déclenchable automatiquement par les triggers
de son frontmatter. Pour un usage explicite par vos agents, deux gestes :

### Déclarer les skills pertinentes dans le frontmatter des agents

Pour chaque agent qui doit se servir d'une skill, ajoutez en fin de fichier une section
« Skills disponibles » qui la nomme. L'agent l'invoque alors via le tool `Skill` quand le contexte
le réclame. Ne câblez une skill qu'aux agents où elle a du sens. Table de câblage suggérée :

| Rôle d'agent | Skills à déclarer |
|---|---|
| Orchestrateur / chef de projet | `clarify`, `prd`, `req-checklist`, `context-budget`, `codex-delegate` |
| Développeur / implémenteur | `tdd-evidence-workflow`, `test-coverage`, `output-evaluator` |
| Challenger / QA / gate de clôture | `output-evaluator`, `eval-harness`, `production-audit` |
| Gardien de l'arsenal / mainteneur | `skill-stocktake`, `skill-comply`, `rules-distill`, `context-budget` |
| Juge externe / second avis | `codex-delegate` (voir aussi `multi-model/PROTOCOLE.md`) |

Modifier un fichier d'agent est une action T4 : montrer le diff du frontmatter avant d'écrire,
un agent à la fois.

### La découverte de skills à 3 étages (coût croissant)

Quand une tâche relève d'un outillage, cherchez la skill la plus adaptée par coût croissant :

1. **Étage 1, vos skills attachées** : les skills déjà copiées dans `~/.claude/skills/` et
   déclarées à vos agents (coût nul, déjà là).
2. **Étage 2, votre index de routage** : si vous tenez un index « besoin -> skill » (un simple
   fichier grep-able), consultez-le sur un trou constaté. Ce dépôt ne fournit pas cet index (il
   dépend de votre arborescence) ; c'est un confort à créer si votre arsenal grossit.
3. **Étage 3, découverte externe** : sur un trou confirmé, cherchez une skill publique via
   `find-skills` (voir section b). Audit obligatoire de la source avant toute installation.

---

## Installation manuelle (sans agent)

`<REPO>` désigne le chemin absolu où vous avez cloné ce dépôt.

### Windows (PowerShell)

```powershell
# Crée le dossier cible au besoin
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills" | Out-Null

# Copie chaque skill maison (vérifiez d'abord les collisions de noms)
Copy-Item -Recurse -Force "<REPO>\skills\*" "$env:USERPROFILE\.claude\skills\"

# Preuve : les dossiers attendus sont présents
Get-ChildItem "$env:USERPROFILE\.claude\skills" | Select-Object Name
```

### macOS / Linux (bash)

```bash
mkdir -p "$HOME/.claude/skills"
cp -r "<REPO>/skills/"* "$HOME/.claude/skills/"
ls -1 "$HOME/.claude/skills"
```

Vérification de résolution runtime : le nom d'invocation d'une skill est le nom de son DOSSIER,
qui doit être égal au champ `name:` de son `SKILL.md`. Un écart casse l'invocation. Contrôle
rapide (bash) :

```bash
for d in "$HOME/.claude/skills"/*/; do
  name=$(grep -m1 '^name:' "$d/SKILL.md" | sed 's/^name:[[:space:]]*//')
  base=$(basename "$d")
  [ "$name" = "$base" ] && echo "OK   $base" || echo "ECART $base (name: $name)"
done
```

Skills externes : suivez les commandes de la section (b) dans une session Claude Code (pour les
`/plugin`) ou dans un terminal (pour les `npx skills add`).

## Désinstallation

Supprimez les dossiers copiés de `~/.claude/skills/`, retirez la section « Skills disponibles »
que vous aviez ajoutée aux agents, et désinstallez les plugins externes par leurs propres
commandes (`/plugin uninstall ...`).
