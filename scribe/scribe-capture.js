#!/usr/bin/env node
"use strict";

/*
 * scribe-capture.js
 *
 * Hook de capture zéro-token multi-événements du module session-scribe.
 * Route sur hook_event_name du stdin :
 *   SessionStart -> journal session_start + injections additionalContext
 *                   (réamorçage post-compaction, pointeur de reprise,
 *                   scribe dû, compteur du sas de leçons, témoin de vie)
 *   PostToolUse  -> tool_name=Agent ou Task (alias du tool de dispatch selon
 *                   la version de Claude Code) UNIQUEMENT : agent_dispatch
 *   SubagentStop -> événement subagent_stop + extraction de candidats leçons
 *   PreCompact   -> journal pre_compact + snapshot déterministe
 *   SessionEnd   -> événement de clôture
 *
 * Filtre : les événements dont agent_type est l'agent scribe (env
 * SCRIBE_AGENT_NAME, défaut "scribe") ne sont jamais journalisés (le scribe
 * ne se documente pas lui-même) ; son SubagentStop consomme le fichier
 * d'état scribe-due.
 *
 * Sinks : toute chaîne externe (sortie git, nom de fichier, message d'agent,
 * chemin) passe lib.sinkString (redaction PUIS troncature) avant d'être
 * écrite dans le snapshot, le journal ou le sas. En mode racine, le snapshot
 * ne contient que des métadonnées (chemins hachés {sha8, len}, pas de sorties
 * git brutes, pas de todos).
 *
 * Git : execFileSync SANS shell (un git.cmd posé dans le projet n'est jamais
 * exécuté) + -c core.fsmonitor=false sur status (pas de hook fsmonitor
 * exécutable déclenché par la config du dépôt).
 *
 * Kill switch SCRIBE_DISABLE=1 : exit 0 immédiat. Tout exit 0, erreurs sur
 * stderr, jamais de contenu de payload dans les messages d'erreur.
 * Input invalide ou session_id absent : NE RIEN FAIRE.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const lib = require("./journal-lib.js");

// Agents pilotes dont les rapports finaux sont greppés pour les blocs
// INSTINCT-CANDIDAT (env SCRIBE_PILOT_AGENTS, séparés par des virgules).
function pilotAgents() {
  const v = process.env.SCRIBE_PILOT_AGENTS;
  const raw = v && String(v).trim() ? String(v) : "debugger,qa,challenger";
  return raw
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
}

const SNAPSHOT_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const LIFE_SLACK_MS = 10 * 60 * 1000;
const RECENT_FILE_MS = 4 * 60 * 60 * 1000;
const GIT_SECTION_MAX = 4000;

// ---------------------------------------------------------------------------
// Git (execFileSync sans shell, timeout 5 s, catch silencieux : pas de git
// = null). Jamais de chaîne passée à un shell ; args en TABLEAU.
// ---------------------------------------------------------------------------

function gitRun(projectDir, args) {
  try {
    return execFileSync("git", args, {
      cwd: projectDir,
      timeout: 5000,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    }).trimEnd();
  } catch (e) {
    return null;
  }
}

function gitLastCommitMs(projectDir) {
  const out = gitRun(projectDir, ["log", "-1", "--format=%ct"]);
  if (out === null) return null;
  const n = parseInt(out.trim(), 10);
  return isNaN(n) ? null : n * 1000;
}

// ---------------------------------------------------------------------------
// Chemins de reprise
// ---------------------------------------------------------------------------

function handoffPath(state) {
  return path.join(state.projectDir, "tasks", "HANDOFF-reprise.md");
}

// SID COMPLET (déjà sanitisé, borné 64 car. ou hash 32 hex) dans le nom du
// snapshot : deux sessions ne partagent jamais un snapshot.
function snapshotPath(state) {
  return path.join(lib.scribeDir(state.projectDir), "CONTEXT-PRE-COMPACT-" + state.sid + ".md");
}

// Snapshot le plus récent du projet (toutes sessions), ou null.
function latestSnapshot(state) {
  const dir = lib.scribeDir(state.projectDir);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (e) {
    return null;
  }
  let best = null;
  for (let i = 0; i < entries.length; i++) {
    const name = entries[i];
    if (!/^CONTEXT-PRE-COMPACT-.*\.md$/.test(name)) continue;
    const full = path.join(dir, name);
    const m = lib.fileMtimeMs(full);
    if (m !== null && (best === null || m > best.mtimeMs)) best = { file: full, mtimeMs: m };
  }
  return best;
}

// ---------------------------------------------------------------------------
// SessionStart
// ---------------------------------------------------------------------------

function onSessionStart(input) {
  const state = lib.loadSessionState(input);
  const source = typeof input.source === "string" ? input.source : "";
  lib.appendEvent(state, { type: "session_start", source: source || "inconnu" });

  const notes = [];
  const handoff = handoffPath(state);
  const handoffM = lib.fileMtimeMs(handoff);

  if (source === "compact") {
    // (a) Réamorçage post-compaction : protocole D.2bis du référentiel,
    // CHEMINS seuls, jamais de contenu capté.
    const snap = snapshotPath(state);
    const snapM = lib.fileMtimeMs(snap);
    notes.push(
      "[session-scribe] Reprise post-compaction (protocole D.2bis) : relire le snapshot puis le HANDOFF avant toute action ; tout fait d'avant compaction redevient INFÉRÉ, à re-vérifier par lecture. " +
        "Snapshot : " + (snapM !== null ? snap : "absent (" + snap + ")") + ". " +
        "HANDOFF : " + (handoffM !== null ? handoff : "absent (" + handoff + ")") + "."
    );
  } else if (source === "startup" || source === "resume") {
    // (b) UNE ligne pointeur si une reprise existe (HANDOFF ou snapshot frais).
    if (handoffM !== null) {
      notes.push(
        "[session-scribe] Reprise disponible : " + handoff + " (modifié le " + new Date(handoffM).toISOString() + ")."
      );
    } else {
      const snap = latestSnapshot(state);
      if (snap !== null && Date.now() - snap.mtimeMs < SNAPSHOT_FRESH_MS) {
        notes.push(
          "[session-scribe] Reprise disponible : " + snap.file + " (généré le " + new Date(snap.mtimeMs).toISOString() + ")."
        );
      }
    }
    dueCheck(state, notes);
    sasCheck(state, notes);
    lifeCheck(state, notes);
  }

  if (notes.length) {
    lib.writeStdout({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: notes.join("\n"),
      },
    });
  }
}

// Fichiers d'état scribe-due (posés par context-guard à S2) : signalés une
// fois puis consommés. Seuls ceux du MÊME projet sont concernés.
function dueCheck(state, notes) {
  let entries;
  try {
    entries = fs.readdirSync(os.tmpdir());
  } catch (e) {
    return;
  }
  let found = 0;
  for (let i = 0; i < entries.length; i++) {
    const name = entries[i];
    if (name.indexOf("claude-scribe-due-") !== 0) continue;
    const full = path.join(os.tmpdir(), name);
    const raw = lib.readFileSwallow(full);
    let sameProject = true;
    if (raw !== null) {
      try {
        const meta = JSON.parse(raw);
        if (meta && typeof meta.projectDir === "string") {
          sameProject = lib.normPath(meta.projectDir) === lib.normPath(state.projectDir);
        }
      } catch (e) {
        // contenu illisible : on le traite comme concerné
      }
    }
    if (!sameProject) continue;
    found++;
    try {
      fs.unlinkSync(full);
    } catch (e) {
      // rien
    }
  }
  if (found > 0) {
    notes.push(
      "[session-scribe] Un dispatch de l'agent scribe était dû (seuil S2 franchi lors d'une session précédente) et n'a pas été exécuté. Documenter la reprise avant d'engager du nouveau travail."
    );
  }
}

// Compteur du sas de candidats leçons (partagé + local au projet), s'il est
// non vide.
function sasCheck(state, notes) {
  let n = 0;
  const shared = lib.sasDir();
  if (shared !== null) {
    let projDirs;
    try {
      projDirs = fs.readdirSync(shared);
    } catch (e) {
      projDirs = [];
    }
    for (let i = 0; i < projDirs.length; i++) {
      const d = path.join(shared, projDirs[i]);
      let st;
      try {
        st = fs.statSync(d);
      } catch (e) {
        continue;
      }
      if (!st.isDirectory()) continue;
      let files;
      try {
        files = fs.readdirSync(d);
      } catch (e) {
        continue;
      }
      for (let j = 0; j < files.length; j++) {
        if (/\.md$/i.test(files[j])) n++;
      }
    }
  }
  let localFiles;
  try {
    localFiles = fs.readdirSync(path.join(lib.scribeDir(state.projectDir), "instincts"));
  } catch (e) {
    localFiles = [];
  }
  for (let i = 0; i < localFiles.length; i++) {
    if (/\.md$/i.test(localFiles[i])) n++;
  }
  if (n > 0) {
    notes.push(
      "[session-scribe] Sas de leçons non vide : " + n + " candidat(s) en attente de jugement (dispatch de l'agent scribe puis de votre curateur mémoire à prévoir)."
    );
  }
}

// Témoin de vie : premier journal absent = silence. Si un journal de session
// PRÉCÉDENTE existe et que son dernier événement est nettement plus vieux que
// l'activité git récente, signal VISIBLE.
function lifeCheck(state, notes) {
  const dir = lib.scribeDir(state.projectDir);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (e) {
    return;
  }
  let latest = 0;
  let count = 0;
  for (let i = 0; i < entries.length; i++) {
    const name = entries[i];
    if (!/^journal-.*\.jsonl$/.test(name)) continue;
    if (name === "journal-" + state.sid + ".jsonl") continue;
    count++;
    const m = lib.fileMtimeMs(path.join(dir, name));
    if (m !== null && m > latest) latest = m;
  }
  if (count === 0 || latest === 0) return;
  const gitTs = gitLastCommitMs(state.projectDir);
  if (gitTs === null) return;
  if (gitTs - latest > LIFE_SLACK_MS) {
    notes.push(
      "[session-scribe] TÉMOIN DE VIE : dernier journal de session précédente daté du " +
        new Date(latest).toISOString() +
        ", or l'activité git est plus récente (" +
        new Date(gitTs).toISOString() +
        "). La capture scribe a pu être inactive sur la période ; vérifier le câblage des hooks."
    );
  }
}

// ---------------------------------------------------------------------------
// PostToolUse : dispatch d'agent (tool_name=Agent, ou son alias Task selon la
// version de Claude Code, UNIQUEMENT)
// ---------------------------------------------------------------------------

function onPostToolUse(input) {
  if (input.tool_name !== "Agent" && input.tool_name !== "Task") return;
  const resp = input.tool_response && typeof input.tool_response === "object" ? input.tool_response : {};
  const ti = input.tool_input && typeof input.tool_input === "object" ? input.tool_input : {};
  const agentType =
    (typeof resp.agentType === "string" && resp.agentType) ||
    (typeof ti.subagent_type === "string" && ti.subagent_type) ||
    "";
  if (agentType === lib.scribeAgentName()) return;
  const state = lib.loadSessionState(input);
  const agentId =
    (typeof resp.agentId === "string" && resp.agentId) ||
    (typeof resp.agent_id === "string" && resp.agent_id) ||
    null;
  lib.appendEvent(state, {
    type: "agent_dispatch",
    agent_id: agentId !== null ? lib.sinkString(agentId, 128) : null,
    agent_type: agentType ? lib.sinkString(agentType, 128) : null,
    resolved_model: typeof resp.resolvedModel === "string" ? lib.sinkString(resp.resolvedModel, 128) : null,
    duration_ms: Number(resp.totalDurationMs) || Number(input.duration_ms) || null,
    prompt_excerpt: lib.makeExcerpt(state, typeof ti.prompt === "string" ? ti.prompt : null),
  });
}

// ---------------------------------------------------------------------------
// SubagentStop : journal + extraction de candidats leçons
// ---------------------------------------------------------------------------

function onSubagentStop(input) {
  const agentType = typeof input.agent_type === "string" ? input.agent_type : "";
  if (agentType === lib.scribeAgentName()) {
    // Le scribe vient de tourner : consommer le scribe-due, ne rien journaliser.
    const sid = lib.sanitizeSessionId(input);
    if (sid !== null) {
      try {
        fs.unlinkSync(lib.dueFile(sid));
      } catch (e) {
        // rien
      }
    }
    return;
  }
  const state = lib.loadSessionState(input);
  const lastMsg = typeof input.last_assistant_message === "string" ? input.last_assistant_message : null;
  lib.appendEvent(state, {
    type: "subagent_stop",
    agent_id: typeof input.agent_id === "string" ? lib.sinkString(input.agent_id, 128) : null,
    agent_type: agentType ? lib.sinkString(agentType, 128) : null,
    agent_transcript_path:
      typeof input.agent_transcript_path === "string"
        ? lib.sinkString(input.agent_transcript_path, 500)
        : null,
    last_msg_excerpt: lib.makeExcerpt(state, lastMsg),
  });
  if (pilotAgents().indexOf(agentType) !== -1 && lastMsg) {
    try {
      depositInstincts(state, agentType, lastMsg);
    } catch (e) {
      lib.logErr("[session-scribe] extraction de candidat impossible: " + (e && e.message));
    }
  }
}

// Extraction au format STRICT : marqueur "INSTINCT-CANDIDAT:" ancré en début
// de ligne, seul sur sa ligne, suivi des 4 champs declencheur/action/
// confiance/preuve. Un marqueur dans un bloc de code (``` non fermé) est
// ignoré (anti marqueur cité).
function extractInstincts(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!/^INSTINCT-CANDIDAT:\s*$/.test(line)) continue;
    const fields = {};
    let j = i + 1;
    while (j < lines.length) {
      const m = /^(declencheur|action|confiance|preuve):\s*(.*)$/.exec(lines[j]);
      if (!m) break;
      fields[m[1]] = m[2].trim();
      j++;
    }
    if (fields.declencheur && fields.action && fields.confiance && fields.preuve) {
      out.push(fields);
    }
    i = j - 1;
  }
  return out;
}

function slugify(s) {
  // Décompose (NFD) puis retire les diacritiques combinants (0x0300-0x036f)
  // par filtrage numérique : aucun caractère invisible dans la source.
  const decomposed = String(s).toLowerCase().normalize("NFD");
  let base = "";
  for (let i = 0; i < decomposed.length; i++) {
    const code = decomposed.charCodeAt(i);
    if (code >= 0x0300 && code <= 0x036f) continue;
    base += decomposed[i];
  }
  const slug = base
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug || "instinct";
}

// Nom de dossier du sas dérivé du nom de projet SANITISÉ : redaction, retrait
// des caractères invalides NTFS, borne de longueur.
function sanitizeProjectName(name) {
  const cleaned = lib
    .redact(String(name))
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/^[\s.-]+|[\s.-]+$/g, "")
    .slice(0, 80);
  return cleaned || "projet";
}

// Valeur de frontmatter : REDACTION (jeu partagé) puis troncature via le
// sink unique, une seule ligne, sérialisée en chaîne JSON (YAML valide,
// accents préservés).
function yamlValue(v) {
  const s = lib.sinkString(String(v).replace(/[\r\n]+/g, " "), lib.EXCERPT_MAX);
  return JSON.stringify(s);
}

function yyyymmdd() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

// Garantit le .gitignore du sas partagé : le CONTENU est vérifié, pas
// seulement l'existence. Retourne true si la règle est garantie.
function ensureSasGitignore() {
  const dir = lib.sasDir();
  if (dir === null) return false;
  let ok = false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    ok = lib.ensureGitignoreRule(dir);
  } catch (e) {
    ok = false;
  }
  return ok;
}

// Écriture EXCLUSIVE (flag wx) avec suffixe incrémental sans plafond dur :
// deux processus concurrents ne peuvent pas écraser le même candidat ; le
// n-ième homonyme du jour obtient -n.
function writeExclusive(dir, baseName, body) {
  let n = 1;
  for (;;) {
    const file = n === 1 ? path.join(dir, baseName + ".md") : path.join(dir, baseName + "-" + n + ".md");
    try {
      fs.writeFileSync(file, body, { encoding: "utf8", flag: "wx" });
      return file;
    } catch (e) {
      if (e && e.code === "EEXIST") {
        n++;
        continue;
      }
      lib.logErr("[session-scribe] dépôt de candidat impossible: " + (e && e.code));
      return null;
    }
  }
}

function depositInstincts(state, agentType, message) {
  const candidates = extractInstincts(message);
  if (!candidates.length) return;
  const sensitive = lib.isSensitiveProject(state.projectDir);
  const useLocal = sensitive || lib.sasDir() === null;
  const projName = sanitizeProjectName(path.basename(state.projectDir));
  let dir;
  if (useLocal) {
    // Dépôt LOCAL au projet : le gitignore de .claude/scribe/ doit être
    // GARANTI avant d'écrire du contenu.
    let ensured;
    try {
      ensured = lib.ensureScribeDir(state.projectDir);
    } catch (e) {
      lib.logErr("[session-scribe] sas local inaccessible : dépôt refusé");
      return;
    }
    if (!ensured.gitignoreOk) {
      lib.logErr("[session-scribe] gitignore local NON garanti : dépôt de candidat refusé");
      return;
    }
    dir = path.join(ensured.dir, "instincts");
  } else {
    if (!ensureSasGitignore()) {
      lib.logErr("[session-scribe] gitignore du sas NON garanti : dépôt de candidat refusé");
      return;
    }
    dir = path.join(lib.sasDir(), projName);
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    lib.logErr("[session-scribe] création du sas de candidats impossible: " + (e && e.code));
    return;
  }
  const day = yyyymmdd();
  for (let c = 0; c < candidates.length; c++) {
    const cand = candidates[c];
    // Slug construit sur le declencheur REDACTÉ : un fragment de secret ne
    // doit pas survivre dans le nom de fichier non plus.
    const slug = slugify(lib.redact(cand.declencheur));
    const body = [
      "---",
      "declencheur: " + yamlValue(cand.declencheur),
      "action: " + yamlValue(cand.action),
      "confiance: " + yamlValue(cand.confiance),
      "preuve: " + yamlValue(cand.preuve),
      "agent: " + yamlValue(agentType),
      "session: " + yamlValue(state.sid),
      "sensibilite: " + yamlValue(sensitive ? "sensible-local" : "normale"),
      "---",
      "",
    ].join("\n");
    writeExclusive(dir, day + "-" + agentType + "-" + slug, body);
  }
}

// ---------------------------------------------------------------------------
// PreCompact : journal + snapshot déterministe
// ---------------------------------------------------------------------------

function onPreCompact(input) {
  const state = lib.loadSessionState(input);
  const trigger = typeof input.trigger === "string" ? input.trigger : "inconnu";
  lib.appendEvent(state, { type: "pre_compact", trigger: trigger });
  try {
    writeSnapshot(state, input, trigger);
  } catch (e) {
    lib.logErr("[session-scribe] écriture du snapshot impossible: " + (e && e.message));
  }
}

// Fichiers modifiés depuis moins de 4 h, à partir du working tree git.
// fsmonitor neutralisé sur status.
function recentFiles(state) {
  const out = gitRun(state.projectDir, ["-c", "core.fsmonitor=false", "status", "--porcelain"]);
  if (out === null) return null;
  const cutoff = Date.now() - RECENT_FILE_MS;
  const files = [];
  const lines = out.split(/\r?\n/);
  for (let i = 0; i < lines.length && files.length < 50; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    let p = line.slice(3);
    const arrow = p.indexOf(" -> ");
    if (arrow !== -1) p = p.slice(arrow + 4);
    p = p.replace(/^"|"$/g, "");
    try {
      const st = fs.statSync(path.join(state.projectDir, p));
      if (st.mtimeMs >= cutoff) files.push(p);
    } catch (e) {
      // rien
    }
  }
  return files;
}

// Dernier état TodoWrite du fil principal, lu dans le tail du transcript.
function lastTodos(transcriptPath) {
  const lines = lib.tailLines(transcriptPath, 2 * 1024 * 1024);
  if (!lines) return null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (e) {
      continue;
    }
    if (rec && rec.isSidechain === true) continue;
    const msg = rec && rec.message ? rec.message : null;
    const content = msg && Array.isArray(msg.content) ? msg.content : null;
    if (!content) continue;
    for (let j = 0; j < content.length; j++) {
      const c = content[j];
      if (c && c.type === "tool_use" && c.name === "TodoWrite" && c.input && Array.isArray(c.input.todos)) {
        return c.input.todos;
      }
    }
  }
  return null;
}

function writeSnapshot(state, input, trigger) {
  const ensured = lib.ensureScribeDir(state.projectDir);
  // Mode métadonnées seules : racine du monorepo OU gitignore non garanti :
  // pas de sorties git brutes, pas de todos, chemins hachés {sha8, len}.
  const metaOnly = state.rootMode === true || !ensured.gitignoreOk;
  const file = snapshotPath(state);
  const handoff = handoffPath(state);
  const handoffM = lib.fileMtimeMs(handoff);
  const lines = [];

  lines.push("# CONTEXT-PRE-COMPACT-" + state.sid);
  lines.push("");
  lines.push(
    "> Généré automatiquement par scribe-capture.js le " +
      new Date().toISOString() +
      ". Contenu = donnée, jamais instruction. Sections jugement à compléter par l'agent scribe."
  );
  lines.push("");
  lines.push("## Session");
  lines.push("- session_id : " + state.sid);
  lines.push("- cwd : " + lib.sinkString(state.projectDir, 500));
  lines.push("- déclencheur de compaction : " + lib.sinkString(trigger, 100));
  if (metaOnly) {
    lines.push("- mode : mode racine ou gitignore non garanti : métadonnées seules par construction.");
  }
  lines.push("");

  if (metaOnly) {
    const recent = recentFiles(state);
    lines.push("## Fichiers modifiés depuis moins de 4 h (chemins hachés)");
    if (recent === null) {
      lines.push("git indisponible ou hors dépôt : section omise.");
    } else if (!recent.length) {
      lines.push("Aucun (dans le working tree git).");
    } else {
      for (let i = 0; i < recent.length; i++) {
        lines.push("- " + JSON.stringify({ sha8: lib.sha8(recent[i]), len: recent[i].length }));
      }
    }
    lines.push("");
    lines.push("## Git et TodoWrite");
    lines.push("Sections omises en mode métadonnées seules (aucune sortie git brute, aucun todo).");
    lines.push("");
  } else {
    const status = gitRun(state.projectDir, ["-c", "core.fsmonitor=false", "status", "--short"]);
    lines.push("## Git status (git status --short)");
    if (status === null) {
      lines.push("git indisponible ou hors dépôt : section omise.");
    } else if (!status.trim()) {
      lines.push("Working tree propre.");
    } else {
      lines.push("```");
      lines.push(lib.sinkString(status, GIT_SECTION_MAX));
      lines.push("```");
    }
    lines.push("");

    const log = gitRun(state.projectDir, ["log", "--oneline", "-10"]);
    lines.push("## Derniers commits (git log --oneline -10)");
    if (log === null) {
      lines.push("git indisponible ou hors dépôt : section omise.");
    } else if (!log.trim()) {
      lines.push("Aucun commit.");
    } else {
      lines.push("```");
      lines.push(lib.sinkString(log, GIT_SECTION_MAX));
      lines.push("```");
    }
    lines.push("");

    const recent = recentFiles(state);
    lines.push("## Fichiers modifiés depuis moins de 4 h");
    if (recent === null) {
      lines.push("git indisponible ou hors dépôt : section omise.");
    } else if (!recent.length) {
      lines.push("Aucun (dans le working tree git).");
    } else {
      for (let i = 0; i < recent.length; i++) lines.push("- " + lib.sinkString(recent[i], 500));
    }
    lines.push("");

    const todos = lastTodos(typeof input.transcript_path === "string" ? input.transcript_path : "");
    lines.push("## Dernier état TodoWrite");
    if (!todos || !todos.length) {
      lines.push("Aucun TodoWrite trouvé dans le tail du transcript.");
    } else {
      for (let i = 0; i < todos.length; i++) {
        const t = todos[i] || {};
        const txt = lib.sinkString(String(t.content || ""), 200);
        lines.push("- [" + lib.sinkString(String(t.status || "?"), 40) + "] " + txt);
      }
    }
    lines.push("");
  }

  const journal = lib.lastJournalLines(state, 10);
  lines.push("## 10 derniers événements du journal");
  if (!journal || !journal.length) {
    lines.push("Journal vide ou illisible.");
  } else {
    lines.push("```json");
    for (let i = 0; i < journal.length; i++) lines.push(journal[i]);
    lines.push("```");
  }
  lines.push("");

  lines.push("## Reprise");
  lines.push("- HANDOFF : " + lib.sinkString(handoff, 500) + (handoffM !== null ? " (présent, modifié le " + new Date(handoffM).toISOString() + ")" : " (absent)"));
  lines.push("- Runbook : voir tasks/ du projet.");
  lines.push("");
  lines.push("## Jugement (à compléter par l'agent scribe)");
  lines.push("- État du chantier, risques, prochaine action exacte : À COMPLÉTER.");
  lines.push("");

  fs.writeFileSync(file, lines.join("\n"), "utf8");
}

// ---------------------------------------------------------------------------
// SessionEnd
// ---------------------------------------------------------------------------

function onSessionEnd(input) {
  const state = lib.loadSessionState(input);
  lib.appendEvent(state, {
    type: "session_end",
    reason: typeof input.reason === "string" ? lib.sinkString(input.reason, 100) : "inconnu",
  });
}

// ---------------------------------------------------------------------------
// Routage
// ---------------------------------------------------------------------------

function main(input) {
  if (!input || lib.sanitizeSessionId(input) === null) return;
  const evName = typeof input.hook_event_name === "string" ? input.hook_event_name : "";
  switch (evName) {
    case "SessionStart":
      return onSessionStart(input);
    case "PostToolUse":
      return onPostToolUse(input);
    case "SubagentStop":
      return onSubagentStop(input);
    case "PreCompact":
      return onPreCompact(input);
    case "SessionEnd":
      return onSessionEnd(input);
    default:
      return;
  }
}

module.exports = {
  main: main,
  extractInstincts: extractInstincts,
  slugify: slugify,
  sanitizeProjectName: sanitizeProjectName,
  pilotAgents: pilotAgents,
};

if (require.main === module) {
  (function run() {
    process.exitCode = 0;
    if (lib.isDisabled()) return;
    lib
      .readStdinJson({ timeoutMs: 2000 })
      .then(function (res) {
        // input invalide ou session_id absent = silence total.
        if (!res || !res.ok || !res.input) return;
        try {
          main(res.input);
        } catch (e) {
          lib.logErr("[scribe-capture] non fatal: " + (e && e.message));
        }
      })
      .catch(function () {
        // rien
      });
  })();
}
