#!/usr/bin/env node
"use strict";

/*
 * context-guard.js
 *
 * Hook PreToolUse SANS matcher du module session-scribe.
 *
 * Trois seuils étagés sur les tokens réels du transcript (lecture tail via
 * journal-lib) :
 *   S1/S2 : advisory via additionalContext, high-water-mark réarmable ;
 *           S2 pose le fichier d'état scribe-due-<sid>.
 *   S3    : DENY sélectif via JSON (permissionDecision deny, message FIXE,
 *           jamais d'écho du payload), liste blanche fermée.
 *
 * Règles de sûreté (elles PRIMENT) :
 *   - le deny ne s'arme JAMAIS sur une fenêtre par défaut
 *     (window_defaulted=true -> advisory + enforcement_degraded) ;
 *   - disjoncteur : 10 denies consécutifs sans levée -> repli advisory
 *     + enforcement_degraded. Le compteur n'est JAMAIS remis à zéro sur une
 *     simple INTENTION PreToolUse : uniquement à la levée prouvée (liftProof)
 *     ou au changement d'époque ;
 *   - fail-open avant armement (erreur de lecture = pas d'armement) ;
 *     fail-closed après (levée UNIQUEMENT sur preuve positive). Machine à
 *     états à époques (armNonce, pas de réarmement dans la même époque ;
 *     tokens < S1 = nouvelle époque) ;
 *   - franchissement direct au-delà du plancher -> deny quand même.
 *
 * Preuve de levée : baseline (mtime + taille du HANDOFF et des snapshots)
 * capturée à l'ARMEMENT ; la preuve est un CHANGEMENT par rapport à cette
 * baseline (mtime strictement supérieur, fichier non vide) ; un mtime dans le
 * futur (> now + 5 min) n'est jamais une preuve.
 *
 * Liste blanche : les chemins Write/Edit sont canonicalisés (path.resolve)
 * et CONFINÉS au projectDir : seuls les sous-arbres exacts tasks/,
 * docs/marathon/, .claude/scribe/, .planning/ du projet et les basenames
 * HANDOFF* et CONTEXT-PRE-COMPACT* DANS le projet passent.
 *
 * État : écritures temp + rename (atomiques, via journal-lib). Pas de verrou
 * inter-processus (mono-utilisateur : complexité non payée, voir l'en-tête de
 * journal-lib.js). Si l'état ne peut PAS être persisté, CE call bascule en
 * advisory visible (enforcement_degraded raison state_unwritable).
 *
 * Tail saturé : résultat distinct. Saturé + armé = rester armé (fail-closed) ;
 * saturé + non armé = fail-open + un log. Le dernier usage principal lu est
 * mis en cache dans l'état de session et réutilisé.
 *
 * Kill switch SCRIBE_DISABLE=1. Exit 0 TOUJOURS (le deny passe par le JSON,
 * jamais par exit 2). Input invalide ou session_id absent : NE RIEN FAIRE.
 */

const fs = require("fs");
const path = require("path");
const lib = require("./journal-lib.js");

// Seuils par fenêtre, env-overridables via SCRIBE_S1/S2/S3.
const THRESHOLDS_1M = { s1: 550000, s2: 700000, s3: 900000 };
const THRESHOLDS_200K = { s1: 110000, s2: 140000, s3: 160000 };

// Plancher absolu : jamais S3 avec moins de 40k tokens restants.
const FLOOR_REMAINING = 40000;

// Disjoncteur anti-boucle.
const DENY_LOOP_MAX = 10;

// Fenêtre de tolérance des horloges : un mtime au-delà de now + 5 min est
// considéré comme FUTUR et n'est jamais une preuve.
const FUTURE_SLACK_MS = 5 * 60 * 1000;

// Liste blanche FERMÉE du deny.
const ALWAYS_ALLOWED = ["Read", "Grep", "Glob", "TodoWrite", "AskUserQuestion"];

// Sous-arbres de documentation autorisés (relatifs au projectDir résolu).
const DOC_SUBTREES = ["tasks/", "docs/marathon/", ".claude/scribe/", ".planning/"];

// Nom de l'agent scribe (constant par processus : le message de deny reste FIXE).
const SCRIBE_AGENT = lib.scribeAgentName();

// Message FIXE du deny : aucun écho du payload, aucune donnée variable.
const DENY_MESSAGE =
  "[context-guard] S3 : frontière de contexte atteinte, appel bloqué par le cran dur. " +
  "Fais exactement ceci : 1) dispatcher l'agent scribe (tool Agent, subagent_type=" + SCRIBE_AGENT + ") OU écrire tasks/HANDOFF-reprise.md ; " +
  "2) consigner l'état courant via TodoWrite ; 3) lancer /compact. " +
  "Restent autorisés : Read, Grep, Glob, TodoWrite, AskUserQuestion, Agent(" + SCRIBE_AGENT + "), " +
  "Write/Edit vers tasks/, docs/marathon/, .claude/scribe/, .planning/, fichiers HANDOFF* et CONTEXT-PRE-COMPACT*. " +
  "Le blocage se lève après documentation (HANDOFF ou snapshot) ou compaction.";

// ---------------------------------------------------------------------------
// Seuils (validation stricte du TUPLE)
// ---------------------------------------------------------------------------

// Parsing STRICT : chiffres seuls, pas de suffixe toléré ("150000x" = invalide).
// Retourne null si absent, { invalid: true } si mal formé, { value } sinon.
function parseEnvIntStrict(name) {
  const v = process.env[name];
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  if (!/^[0-9]+$/.test(s)) return { invalid: true };
  const n = parseInt(s, 10);
  if (!isFinite(n)) return { invalid: true };
  return { value: n };
}

// Retourne { s1, s2, s3, invalid }. Tout override est validé comme TUPLE :
// 0 < s1 < s2 < s3 <= fenêtre - plancher. Tuple invalide = tuple par défaut
// ENTIER (jamais de panachage) + invalid=true (l'appelant journalise).
function resolveThresholds(windowTokens) {
  const base = windowTokens >= lib.WINDOW_1M ? THRESHOLDS_1M : THRESHOLDS_200K;
  const cap = windowTokens - FLOOR_REMAINING;
  let d3 = base.s3;
  if (d3 > cap) d3 = cap;
  if (d3 < 1000) d3 = 1000;
  const defaults = { s1: base.s1, s2: base.s2, s3: d3, invalid: false };

  const e1 = parseEnvIntStrict("SCRIBE_S1");
  const e2 = parseEnvIntStrict("SCRIBE_S2");
  const e3 = parseEnvIntStrict("SCRIBE_S3");
  if (e1 === null && e2 === null && e3 === null) return defaults;
  if ((e1 && e1.invalid) || (e2 && e2.invalid) || (e3 && e3.invalid)) {
    return { s1: defaults.s1, s2: defaults.s2, s3: defaults.s3, invalid: true };
  }
  const s1 = e1 !== null ? e1.value : base.s1;
  const s2 = e2 !== null ? e2.value : base.s2;
  const s3 = e3 !== null ? e3.value : base.s3;
  const valid = s1 > 0 && s1 < s2 && s2 < s3 && s3 <= cap;
  if (!valid) {
    return { s1: defaults.s1, s2: defaults.s2, s3: defaults.s3, invalid: true };
  }
  return { s1: s1, s2: s2, s3: s3, invalid: false };
}

// ---------------------------------------------------------------------------
// Liste blanche (canonicalisation + confinement au projectDir)
// ---------------------------------------------------------------------------

function lowerSlash(p) {
  return String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

// Un chemin est un chemin de documentation SEULEMENT s'il est confiné au
// projectDir résolu ET tombe dans un sous-arbre exact autorisé, ou porte un
// basename HANDOFF*/CONTEXT-PRE-COMPACT* DANS le projet. Les chemins relatifs
// sont résolus contre le projectDir ; la canonicalisation (canonPathDeep :
// resolve + realpath du plus profond ancêtre existant) neutralise traversées,
// alias 8.3 et jonctions. Un ":" résiduel (ADS Windows) est rejeté.
function isDocPath(projectDir, p) {
  if (typeof p !== "string" || !p.trim()) return false;
  if (typeof projectDir !== "string" || !projectDir.trim()) return false;
  let abs;
  let proj;
  try {
    proj = lowerSlash(lib.canonPathDeep(String(projectDir)));
    abs = lowerSlash(lib.canonPathDeep(path.resolve(String(projectDir), String(p))));
  } catch (e) {
    return false;
  }
  if (abs === proj) return false;
  if (abs.indexOf(proj + "/") !== 0) return false; // hors projet : refusé
  const rel = abs.slice(proj.length + 1);
  if (rel.indexOf(":") !== -1) return false; // ADS (flux alternatif) : refusé
  const base = rel.split("/").pop() || "";
  if (base.indexOf("handoff") === 0 || base.indexOf("context-pre-compact") === 0) return true;
  for (let i = 0; i < DOC_SUBTREES.length; i++) {
    if (rel.indexOf(DOC_SUBTREES[i]) === 0) return true;
  }
  return false;
}

// Classe le tool call : allowed = jamais bloqué sous deny. Aucune notion de
// « progrès » sur l'intention : seule la PREUVE post-écriture (liftProof) ou
// le changement d'époque touche le disjoncteur.
function classifyTool(projectDir, input) {
  const name = typeof input.tool_name === "string" ? input.tool_name : "";
  const ti = input.tool_input && typeof input.tool_input === "object" ? input.tool_input : {};
  if (ALWAYS_ALLOWED.indexOf(name) !== -1) return { allowed: true };
  // "Task" est l'alias du tool de dispatch d'agent selon la version de
  // Claude Code : même traitement que "Agent".
  if (name === "Agent" || name === "Task") {
    if (ti.subagent_type === SCRIBE_AGENT) return { allowed: true };
    return { allowed: false };
  }
  if (name === "Write" || name === "Edit") {
    if (isDocPath(projectDir, ti.file_path)) return { allowed: true };
    return { allowed: false };
  }
  return { allowed: false };
}

// ---------------------------------------------------------------------------
// État de la machine à époques
// ---------------------------------------------------------------------------

function defaultGuardState() {
  return {
    epoch: 1,
    hwm: 0,
    armed: false,
    armedInEpoch: false,
    armNonce: 0,
    armTs: 0,
    baseline: null,
    lifted: false,
    denyCount: 0,
    degraded: false,
    defaultLogged: false,
    dueWritten: false,
    readFailLogged: false,
    satLogged: false,
    thInvalidLogged: false,
  };
}

function loadGuardState(sid) {
  const raw = lib.readFileSwallow(lib.guardStateFile(sid));
  if (raw === null) return defaultGuardState();
  try {
    const st = JSON.parse(raw);
    if (st && typeof st === "object" && typeof st.epoch === "number") {
      return Object.assign(defaultGuardState(), st);
    }
  } catch (e) {
    // état corrompu : on repart proprement (fail-open avant armement)
  }
  return defaultGuardState();
}

// Persistance atomique. Retourne true si l'état est écrit.
function saveGuardState(sid, g) {
  return lib.writeFileAtomic(lib.guardStateFile(sid), JSON.stringify(g));
}

// Tokens < S1 lus avec succès = compaction (ou net recul) = NOUVELLE ÉPOQUE :
// tout se réarme, y compris les advisories (high-water-mark). C'est l'UN des
// deux seuls points de remise à zéro du disjoncteur.
function resetEpoch(g) {
  g.epoch += 1;
  g.hwm = 0;
  g.armed = false;
  g.armedInEpoch = false;
  g.armTs = 0;
  g.baseline = null;
  g.lifted = false;
  g.denyCount = 0;
  g.degraded = false;
  g.defaultLogged = false;
  g.dueWritten = false;
  g.satLogged = false;
}

// Baseline des preuves, capturée à l'ARMEMENT : mtime + taille du HANDOFF,
// et mtime maximal des snapshots existants.
function captureBaseline(state) {
  const handoff = path.join(state.projectDir, "tasks", "HANDOFF-reprise.md");
  const h = lib.fileStatSafe(handoff);
  let snapMax = 0;
  const dir = lib.scribeDir(state.projectDir);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (e) {
    entries = [];
  }
  for (let i = 0; i < entries.length; i++) {
    const name = entries[i];
    if (!/^CONTEXT-PRE-COMPACT-.*\.md$/.test(name)) continue;
    const st = lib.fileStatSafe(path.join(dir, name));
    if (st !== null && st.mtimeMs > snapMax) snapMax = st.mtimeMs;
  }
  return {
    handoffM: h !== null ? h.mtimeMs : 0,
    handoffSize: h !== null ? h.size : -1,
    snapM: snapMax,
  };
}

// Preuve positive de documentation : changement PAR RAPPORT À LA BASELINE
// capturée à l'armement. mtime strictement supérieur à la baseline, fichier
// non vide, et JAMAIS un mtime futur (> now + 5 min). Un fichier intact
// (mtime égal à la baseline) n'est pas une preuve. Jamais de levée sur
// erreur de lecture.
function liftProof(state, g) {
  const now = Date.now();
  const b = g.baseline && typeof g.baseline === "object"
    ? g.baseline
    : { handoffM: 0, handoffSize: -1, snapM: 0 };
  const handoff = path.join(state.projectDir, "tasks", "HANDOFF-reprise.md");
  const h = lib.fileStatSafe(handoff);
  if (h !== null && h.size > 0 && h.mtimeMs > b.handoffM && h.mtimeMs <= now + FUTURE_SLACK_MS) {
    return true;
  }
  const dir = lib.scribeDir(state.projectDir);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (e) {
    return false;
  }
  for (let i = 0; i < entries.length; i++) {
    const name = entries[i];
    if (!/^CONTEXT-PRE-COMPACT-.*\.md$/.test(name)) continue;
    const st = lib.fileStatSafe(path.join(dir, name));
    if (st !== null && st.size > 0 && st.mtimeMs > b.snapM && st.mtimeMs <= now + FUTURE_SLACK_MS) {
      return true;
    }
  }
  return false;
}

// Levée du deny : c'est l'AUTRE point de remise à zéro du disjoncteur
// (preuve post-écriture, jamais l'intention).
function applyLift(g) {
  g.armed = false;
  g.lifted = true;
  g.denyCount = 0;
}

// Retourne true si le fichier d'état est effectivement posé.
function writeDue(sid, projectDir) {
  return lib.writeFileAtomic(
    lib.dueFile(sid),
    JSON.stringify({ ts: new Date().toISOString(), projectDir: projectDir })
  );
}

// ---------------------------------------------------------------------------
// Messages advisory (S1/S2 et replis)
// ---------------------------------------------------------------------------

function fmtTokens(t) {
  return Math.round(t / 1000) + "k";
}

function msgS1(t, win) {
  const pct = Math.round((t / win.windowTokens) * 100);
  return (
    "[context-guard] Frontière proche : contexte à ~" + fmtTokens(t) + " tokens (" + pct +
    " % de la fenêtre " + lib.formatWindowLabel(win.windowTokens) +
    "). Prévois le dispatch de l'agent scribe à la prochaine frontière de phase (documentation de reprise), puis /compact."
  );
}

function msgS2(t, win) {
  return (
    "[context-guard] Seuil S2 franchi (~" + fmtTokens(t) + " tokens, fenêtre " +
    lib.formatWindowLabel(win.windowTokens) +
    ") : dispatche l'agent scribe MAINTENANT, puis /compact à la prochaine frontière. " +
    "Un fichier d'état scribe-due a été posé ; il sera signalé à la session suivante s'il n'est pas honoré."
  );
}

function msgDegradedDefault(t) {
  return (
    "[context-guard] Seuil S3 franchi (~" + fmtTokens(t) +
    " tokens) mais fenêtre de contexte non prouvée (défaut 200k) : cran dur NON armé, mode advisory (enforcement_degraded journalisé). " +
    "Documente MAINTENANT (agent scribe ou tasks/HANDOFF-reprise.md), TodoWrite, puis /compact. " +
    "Pour armer le cran dur, fixer SCRIBE_WINDOW_TOKENS."
  );
}

function msgBreaker() {
  return (
    "[context-guard] Disjoncteur : " + DENY_LOOP_MAX +
    " refus consécutifs sans levée prouvée. Repli en advisory (enforcement_degraded journalisé). " +
    "Documente et compacte au plus vite : agent scribe ou tasks/HANDOFF-reprise.md, TodoWrite, /compact."
  );
}

function msgStateUnwritable() {
  return (
    "[context-guard] État du garde NON persistable (disque plein ou dossier temp verrouillé) : ce call passe en advisory (enforcement_degraded raison state_unwritable). " +
    "Documente et compacte au plus vite : agent scribe ou tasks/HANDOFF-reprise.md, TodoWrite, /compact."
  );
}

// ---------------------------------------------------------------------------
// Coeur
// ---------------------------------------------------------------------------

// Branche deny commune (armé, ou fail-closed sans lecture) : liste blanche,
// disjoncteur, sinon deny. Le compteur n'est JAMAIS remis à zéro ici.
// Retourne { denied, note }.
function enforceDeny(state, g, input, tokensForLog, windowForLog) {
  const cls = classifyTool(state.projectDir, input);
  if (cls.allowed) return { denied: false, note: null };
  if (g.denyCount >= DENY_LOOP_MAX) {
    g.degraded = true;
    g.armed = false;
    lib.appendEvent(state, {
      type: "enforcement_degraded",
      raison: "deny_loop",
      tokens: tokensForLog,
      window: windowForLog,
    });
    return { denied: false, note: msgBreaker() };
  }
  g.denyCount += 1;
  return { denied: true, note: null };
}

function main(input) {
  if (!input || lib.sanitizeSessionId(input) === null) return;
  const state = lib.loadSessionState(input);
  const g = loadGuardState(state.sid);
  const tail = lib.readTranscriptTail(
    typeof input.transcript_path === "string" ? input.transcript_path : "",
    state.tailCache
  );
  const notes = [];
  let denied = false;

  if (tail.ok && tail.found) {
    // Cache du dernier usage principal : rafraîchi sur lecture fraîche
    // uniquement, jamais sur une valeur déjà servie par le cache.
    if (!tail.fromCache) {
      state.tailCache = { size: tail.fileSize, tokens: tail.tokens, model: tail.model };
      lib.saveSessionState(state);
    }
    const t = tail.tokens;
    const win = lib.resolveWindow(tail.model, t);
    const th = resolveThresholds(win.windowTokens);
    if (th.invalid && !g.thInvalidLogged) {
      // tuple d'overrides invalide = défauts ENTIERS + journal.
      g.thInvalidLogged = true;
      lib.appendEvent(state, {
        type: "thresholds_invalid",
        window: win.windowTokens,
        defauts: { s1: th.s1, s2: th.s2, s3: th.s3 },
      });
    }

    if (t < th.s1) {
      if (g.hwm > 0 || g.armed || g.armedInEpoch || g.degraded || g.lifted || g.defaultLogged) {
        resetEpoch(g);
      }
    } else {
      const level = t >= th.s3 ? 3 : t >= th.s2 ? 2 : 1;
      if (level > g.hwm) {
        g.hwm = level;
        lib.appendEvent(state, {
          type: "threshold",
          niveau: "S" + level,
          tokens: t,
          window: win.windowTokens,
          window_defaulted: win.defaulted,
        });
        if (level >= 2 && !g.dueWritten) {
          if (writeDue(state.sid, state.projectDir)) g.dueWritten = true;
        }
        if (level === 1) notes.push(msgS1(t, win));
        else if (level === 2) notes.push(msgS2(t, win));
        // level 3 : le message passe par le deny, ou par l'advisory dégradé.
      }
      if (level === 3) {
        if (win.defaulted) {
          // Fenêtre par défaut = jamais de deny.
          if (!g.defaultLogged) {
            g.defaultLogged = true;
            lib.appendEvent(state, {
              type: "enforcement_degraded",
              raison: "window_defaulted",
              tokens: t,
              window: win.windowTokens,
            });
            notes.push(msgDegradedDefault(t));
          }
        } else if (g.degraded || g.lifted) {
          // Disjoncteur déclenché ou deny déjà levé : pas de réarmement dans
          // la même époque (armNonce).
        } else {
          if (!g.armedInEpoch) {
            g.armed = true;
            g.armedInEpoch = true;
            g.armNonce = g.epoch;
            g.armTs = Date.now();
            g.baseline = captureBaseline(state);
          }
          if (g.armed && liftProof(state, g)) {
            applyLift(g);
          }
          if (g.armed) {
            const r = enforceDeny(state, g, input, t, win.windowTokens);
            denied = r.denied;
            if (r.note) notes.push(r.note);
          }
        }
      }
    }
  } else if (tail.ok && tail.saturated) {
    // Tail saturé de sidechains, aucun cache réutilisable.
    if (g.armed && !g.lifted && !g.degraded) {
      // Déjà armé : rester armé (fail-closed).
      if (liftProof(state, g)) {
        applyLift(g);
      } else {
        const r = enforceDeny(state, g, input, null, null);
        denied = r.denied;
        if (r.note) notes.push(r.note);
      }
    } else if (!g.satLogged) {
      g.satLogged = true;
      lib.logErr(
        "[context-guard] tail du transcript saturé sans usage principal ni cache : signal indisponible (fail-open avant armement)"
      );
    }
  } else {
    // Lecture impossible ou aucun usage principal : fail-open avant
    // armement, fail-closed après.
    if (g.armed && !g.lifted && !g.degraded) {
      if (liftProof(state, g)) {
        applyLift(g);
      } else {
        const r = enforceDeny(state, g, input, null, null);
        denied = r.denied;
        if (r.note) notes.push(r.note);
      }
    } else if (!g.readFailLogged && input && input.transcript_path) {
      g.readFailLogged = true;
      lib.logErr(
        "[context-guard] transcript illisible ou sans record usage : signal primaire indisponible (fail-open)"
      );
    }
  }

  // Si l'état ne peut PAS être persisté, CE call devient advisory visible :
  // le deny sans état persistant serait un disjoncteur aveugle.
  const persisted = saveGuardState(state.sid, g);
  if (!persisted) {
    lib.appendEvent(state, { type: "enforcement_degraded", raison: "state_unwritable" });
    if (denied) {
      denied = false;
      notes.push(msgStateUnwritable());
    }
  }

  if (denied) {
    lib.writeStdout({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: DENY_MESSAGE,
      },
    });
  } else if (notes.length) {
    lib.writeStdout({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: notes.join("\n"),
      },
    });
  }
}

module.exports = {
  main: main,
  DENY_MESSAGE: DENY_MESSAGE,
  isDocPath: isDocPath,
  classifyTool: classifyTool,
  resolveThresholds: resolveThresholds,
  DENY_LOOP_MAX: DENY_LOOP_MAX,
};

if (require.main === module) {
  (function run() {
    process.exitCode = 0;
    if (lib.isDisabled()) return;
    lib
      .readStdinJson({ timeoutMs: 1500 })
      .then(function (res) {
        // input invalide ou session_id absent = silence total.
        if (!res || !res.ok || !res.input) return;
        try {
          main(res.input);
        } catch (e) {
          lib.logErr("[context-guard] non fatal: " + (e && e.message));
        }
      })
      .catch(function () {
        // rien
      });
  })();
}
