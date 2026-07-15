#!/usr/bin/env node
// test-session-scribe.mjs
// Harnais de test du module session-scribe : simule les payloads réels de
// hooks par stdin et vérifie les sorties observées.
// Exécution : node test-session-scribe.mjs
// Sandbox : dossiers temporaires AVEC ESPACES (cas Windows courant).
// T01-T11 : socle initial. T12-T22 : correctifs de la revue adversariale
// (traversal, tuple de seuils, baseline de levée, mtime futur, stdin, wx,
// snapshot racine, disjoncteur sans remise à zéro, tail saturé, fail-open).
// T23 : dépôt local quand aucun sas partagé n'est configuré (édition publique).
//
// Note édition publique : les motifs de clés utilisés dans les tests sont
// ASSEMBLÉS par concaténation pour qu'aucun motif de clé réelle n'apparaisse
// littéralement dans ce dépôt (grep de sanitisation).

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const lib = require(path.join(HERE, "journal-lib.js"));
const guard = require(path.join(HERE, "context-guard.js"));
const CAPTURE = path.join(HERE, "scribe-capture.js");
const GUARD = path.join(HERE, "context-guard.js");

// Motifs de secrets factices, assemblés (voir note d'en-tête).
const SK_LIVE = "sk_l" + "ive";
const PPLX = "pplx" + "-";
const AIZA = "AIza" + "Sy";
const EYJ = "eyJhb" + "Gci";

// Sandbox racine avec espace dans le nom.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "scribe test "));
const ROOT_SIM = path.join(SANDBOX, "monorepo racine sim");
fs.mkdirSync(ROOT_SIM, { recursive: true });

let failures = 0;
let current = "";

function check(cond, label, observed) {
  if (cond) {
    console.log("  ok    " + label + (observed !== undefined ? "  [observe: " + observed + "]" : ""));
  } else {
    failures++;
    console.log("  ECHEC " + label + (observed !== undefined ? "  [observe: " + observed + "]" : ""));
  }
}

function title(t) {
  current = t;
  console.log("\n=== " + t + " ===");
}

function uid(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function baseEnv(extraEnv) {
  return Object.assign({}, process.env, {
    SCRIBE_ROOT_DIR: ROOT_SIM,
    SCRIBE_SAS_DIR: "",
    SCRIBE_SENSITIVE_MARKERS: "",
    SCRIBE_AGENT_NAME: "",
    SCRIBE_PILOT_AGENTS: "",
    SCRIBE_REDACTION_EXTRA: "",
    SCRIBE_DISABLE: "",
    SCRIBE_WINDOW_TOKENS: "",
    SCRIBE_S1: "",
    SCRIBE_S2: "",
    SCRIBE_S3: "",
  }, extraEnv || {});
}

function runHook(script, payload, extraEnv) {
  const r = spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    env: baseEnv(extraEnv),
    encoding: "utf8",
    timeout: 20000,
  });
  return { status: r.status, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").trim() };
}

// Entrée BRUTE (non-JSON).
function runHookRaw(script, rawInput, extraEnv) {
  const r = spawnSync(process.execPath, [script], {
    input: rawInput,
    env: baseEnv(extraEnv),
    encoding: "utf8",
    timeout: 20000,
  });
  return { status: r.status, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").trim() };
}

function makeProject(name) {
  const p = path.join(SANDBOX, name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function makeTranscript(dir, tokens, model) {
  const file = path.join(dir, "transcript " + Math.random().toString(36).slice(2, 6) + ".jsonl");
  const mainRec = JSON.stringify({
    isSidechain: false,
    message: {
      model: model,
      usage: { input_tokens: tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  });
  const sideRec = JSON.stringify({
    isSidechain: true,
    message: {
      model: "claude-sonnet-5",
      usage: { input_tokens: 12345, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  });
  fs.writeFileSync(file, mainRec + "\n" + sideRec + "\n", "utf8");
  return file;
}

function journalEvents(projDir, sid) {
  const file = path.join(projDir, ".claude", "scribe", "journal-" + sid + ".jsonl");
  if (!fs.existsSync(file)) return null;
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // attente active courte, suffisante pour decaler un mtime NTFS
  }
}

// ---------------------------------------------------------------------------
// Test 1 : enveloppe et seq monotone
// ---------------------------------------------------------------------------
title("T01 enveloppe et seq monotone");
{
  const proj = makeProject("proj un");
  const sid = uid("t01");
  const base = { session_id: sid, transcript_path: "", cwd: proj };
  let r = runHook(CAPTURE, Object.assign({}, base, { hook_event_name: "SessionStart", source: "startup" }));
  check(r.status === 0, "SessionStart exit 0", String(r.status));
  r = runHook(CAPTURE, Object.assign({}, base, { hook_event_name: "SessionEnd", reason: "other" }));
  check(r.status === 0, "SessionEnd exit 0", String(r.status));
  const evs = journalEvents(proj, sid);
  check(evs !== null && evs.length === 2, "2 evenements journalises", evs ? String(evs.length) : "journal absent");
  const keys = evs ? Object.keys(evs[0]).join(",") : "";
  check(keys === "v,seq,ts,sid,cwd,ev", "enveloppe {v,seq,ts,sid,cwd,ev}", keys);
  check(evs && evs[0].v === 1 && evs[0].seq === 1 && evs[1].seq === 2, "seq monotone 1 puis 2", evs ? evs.map((e) => e.seq).join(",") : "-");
  check(evs && evs[0].ev.type === "session_start" && evs[0].ev.source === "startup", "ev session_start{source}", evs ? JSON.stringify(evs[0].ev) : "-");
  check(evs && evs[1].ev.type === "session_end" && evs[1].ev.reason === "other", "ev session_end{reason}", evs ? JSON.stringify(evs[1].ev) : "-");
}

// ---------------------------------------------------------------------------
// Test 2 : redaction AVANT troncature (secret a cheval sur la limite 500)
// ---------------------------------------------------------------------------
title("T02 redaction avant troncature");
{
  const expected = [SK_LIVE, "re_", PPLX, AIZA, EYJ, "ghp_", "gho_", "github_pat_", "whsec_", "sk-ant-", "rk_live_", "sk_test_", "sbp_"];
  check(JSON.stringify(lib.REDACTION_PREFIXES) === JSON.stringify(expected), "jeu de motifs UNIQUE conforme", lib.REDACTION_PREFIXES.join(" "));
  // Secret factice qui DEMARRE avant la limite des 500 et la depasse :
  // si la troncature passait d'abord, le prefixe survivrait tronque.
  const secret = SK_LIVE + "_" + "Z".repeat(60);
  const text = "x".repeat(490) + secret;
  const out = lib.makeExcerpt({ rootMode: false }, text);
  check(out.indexOf(SK_LIVE) === -1, "aucun fragment du secret ne survit", "indexOf=-1");
  check(out.indexOf("[REDACTED]") !== -1, "marqueur [REDACTED] present", out.slice(485));
  check(out.length <= 500, "longueur <= 500", String(out.length));
  const jwt = "header " + EYJ + "OiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload fin";
  check(lib.redact(jwt).indexOf(EYJ) === -1, "motif JWT neutralise", lib.redact(jwt));
}

// ---------------------------------------------------------------------------
// Test 3 : troncature Unicode-safe (emoji / accents a la frontiere)
// ---------------------------------------------------------------------------
title("T03 troncature Unicode-safe");
{
  const emojiText = "x".repeat(499) + "\u{1F600}" + "suite du texte";
  const out = lib.truncateUnicodeSafe(emojiText, 500);
  check(out.length === 499, "coupe a 499 pour ne pas scinder le surrogate pair", String(out.length));
  const lastCode = out.charCodeAt(out.length - 1);
  check(!(lastCode >= 0xd800 && lastCode <= 0xdbff), "pas de high surrogate orphelin en fin", "0x" + lastCode.toString(16));
  const accentText = "é".repeat(600);
  const out2 = lib.truncateUnicodeSafe(accentText, 500);
  check(out2.length === 500 && out2[out2.length - 1] === "é", "accents : coupe nette a 500", String(out2.length));
  const inside = "a".repeat(400) + "\u{1F680}" + "b".repeat(200);
  const out3 = lib.truncateUnicodeSafe(inside, 500);
  check(out3.length === 500 && !/[\uD800-\uDBFF]$/.test(out3), "emoji interne intact, fin propre", String(out3.length));
}

// ---------------------------------------------------------------------------
// Test 4 : mode racine, aucun champ de contenu libre
// ---------------------------------------------------------------------------
title("T04 mode racine : {sha8, len} et zero contenu");
{
  const sid = uid("t04");
  const secretWord = "ContenuConfidentielRacine";
  const payload = {
    session_id: sid,
    transcript_path: "",
    cwd: ROOT_SIM,
    hook_event_name: "PostToolUse",
    tool_name: "Agent",
    tool_input: {
      description: "test racine",
      prompt: "Brief avec " + secretWord + " et une clé " + SK_LIVE + "_ABCDEFGH12345678 dedans",
      subagent_type: "qa",
    },
    tool_response: {
      status: "ok",
      agentId: "agent-123",
      agentType: "qa",
      resolvedModel: "claude-fable-5",
      totalDurationMs: 4321,
    },
    tool_use_id: "tu_1",
    duration_ms: 4321,
  };
  const r = runHook(CAPTURE, payload);
  check(r.status === 0, "exit 0", String(r.status));
  const evs = journalEvents(ROOT_SIM, sid);
  check(evs !== null && evs.length === 1, "1 evenement agent_dispatch au journal racine", evs ? String(evs.length) : "absent");
  const ev = evs ? evs[0].ev : {};
  check(ev.type === "agent_dispatch" && ev.agent_id === "agent-123" && ev.resolved_model === "claude-fable-5", "metadonnees presentes", JSON.stringify({ id: ev.agent_id, model: ev.resolved_model }));
  const pe = ev.prompt_excerpt;
  check(pe && typeof pe === "object" && typeof pe.sha8 === "string" && pe.sha8.length === 8 && typeof pe.len === "number", "prompt_excerpt = {sha8, len}", JSON.stringify(pe));
  const rawLine = fs.readFileSync(path.join(ROOT_SIM, ".claude", "scribe", "journal-" + sid + ".jsonl"), "utf8");
  check(rawLine.indexOf(secretWord) === -1 && rawLine.indexOf(SK_LIVE) === -1, "aucun contenu libre dans la ligne brute", "absent");
}

// ---------------------------------------------------------------------------
// Test 5 : deny a S3, JSON exact
// ---------------------------------------------------------------------------
title("T05 deny S3 (fenetre prouvee 1M, 950k tokens)");
{
  const proj = makeProject("proj deny");
  const sid = uid("t05");
  const transcript = makeTranscript(proj, 950000, "claude-fable-5");
  const payload = {
    session_id: sid,
    transcript_path: transcript,
    cwd: proj,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "echo test" },
  };
  const r = runHook(GUARD, payload);
  check(r.status === 0, "exit 0 (le deny passe par le JSON, jamais exit 2)", String(r.status));
  const expected = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: guard.DENY_MESSAGE,
    },
  });
  const got = JSON.stringify(JSON.parse(r.stdout));
  check(got === expected, "JSON de deny EXACT (message fixe, zero echo du payload)", got.slice(0, 120) + "...");
  check(r.stdout.indexOf("echo test") === -1, "aucun echo du payload dans la sortie", "absent");
  const evs = journalEvents(proj, sid);
  check(evs && evs.some((e) => e.ev.type === "threshold" && e.ev.niveau === "S3" && e.ev.tokens === 950000), "threshold S3 journalise", JSON.stringify(evs ? evs.map((e) => e.ev.type + (e.ev.niveau ? ":" + e.ev.niveau : "")) : []));
  check(fs.existsSync(lib.dueFile(sid)), "fichier d'etat scribe-due pose (S2 englobe par le saut direct)", "present");
  // Liste blanche : Read et Write vers tasks/ passent sous deny arme.
  const r2 = runHook(GUARD, Object.assign({}, payload, { tool_name: "Read", tool_input: { file_path: "C:/x/y.js" } }));
  check(r2.stdout.indexOf("deny") === -1, "Read jamais bloque (liste blanche)", r2.stdout === "" ? "silencieux" : r2.stdout.slice(0, 60));
  const r3 = runHook(GUARD, Object.assign({}, payload, { tool_name: "Write", tool_input: { file_path: path.join(proj, "tasks", "HANDOFF-reprise.md"), content: "x" } }));
  check(r3.stdout.indexOf("deny") === -1, "Write vers tasks/ jamais bloque", r3.stdout === "" ? "silencieux" : r3.stdout.slice(0, 60));
  const r4 = runHook(GUARD, Object.assign({}, payload, { tool_name: "Agent", tool_input: { subagent_type: "scribe", prompt: "documente" } }));
  check(r4.stdout.indexOf("deny") === -1, "Agent(scribe) jamais bloque", r4.stdout === "" ? "silencieux" : r4.stdout.slice(0, 60));
}

// ---------------------------------------------------------------------------
// Test 6 : PAS d'armement si fenetre par defaut
// ---------------------------------------------------------------------------
title("T06 fenetre par defaut : advisory, jamais de deny");
{
  const proj = makeProject("proj defaut");
  const sid = uid("t06");
  const transcript = makeTranscript(proj, 170000, "modele-mystere-9");
  const payload = {
    session_id: sid,
    transcript_path: transcript,
    cwd: proj,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "echo x" },
  };
  const r1 = runHook(GUARD, payload);
  const out1 = r1.stdout ? JSON.parse(r1.stdout) : {};
  const hso1 = out1.hookSpecificOutput || {};
  check(hso1.permissionDecision === undefined, "aucun deny malgre S3 franchi (160k < 170k)", JSON.stringify(hso1.permissionDecision));
  check(typeof hso1.additionalContext === "string" && hso1.additionalContext.indexOf("cran dur NON armé") !== -1, "advisory degrade emis", (hso1.additionalContext || "").slice(0, 90) + "...");
  const r2 = runHook(GUARD, payload);
  check(r2.stdout === "", "second appel silencieux (une fois par epoque)", r2.stdout === "" ? "vide" : r2.stdout.slice(0, 60));
  const evs = journalEvents(proj, sid);
  check(evs && evs.some((e) => e.ev.type === "enforcement_degraded" && e.ev.raison === "window_defaulted"), "enforcement_degraded{window_defaulted} journalise", JSON.stringify(evs ? evs.map((e) => e.ev.type) : []));
  check(evs && evs.some((e) => e.ev.type === "threshold" && e.ev.window_defaulted === true), "threshold porte window_defaulted=true", "present");
}

// ---------------------------------------------------------------------------
// Test 7 : disjoncteur apres 10 denies consecutifs
// ---------------------------------------------------------------------------
title("T07 disjoncteur apres 10 denies sans progres");
{
  const proj = makeProject("proj boucle");
  const sid = uid("t07");
  const transcript = makeTranscript(proj, 950000, "claude-fable-5");
  const payload = {
    session_id: sid,
    transcript_path: transcript,
    cwd: proj,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "boucle" },
  };
  let denies = 0;
  for (let i = 0; i < 10; i++) {
    const r = runHook(GUARD, payload);
    if (r.stdout.indexOf('"permissionDecision":"deny"') !== -1) denies++;
  }
  check(denies === 10, "10 premiers appels refuses", String(denies));
  const r11 = runHook(GUARD, payload);
  check(r11.stdout.indexOf('"permissionDecision":"deny"') === -1, "11e appel NON refuse (repli advisory)", r11.stdout.slice(0, 80) + "...");
  check(r11.stdout.indexOf("Disjoncteur") !== -1, "message disjoncteur emis", "present");
  const r12 = runHook(GUARD, payload);
  check(r12.stdout.indexOf("deny") === -1, "12e appel toujours en advisory (pas de rearmement dans l'epoque)", r12.stdout === "" ? "vide" : r12.stdout.slice(0, 40));
  const evs = journalEvents(proj, sid);
  check(evs && evs.some((e) => e.ev.type === "enforcement_degraded" && e.ev.raison === "deny_loop"), "enforcement_degraded{deny_loop} journalise", "present");
}

// ---------------------------------------------------------------------------
// Test 8 : levee sur mtime HANDOFF posterieur a l'armement
// ---------------------------------------------------------------------------
title("T08 levee du deny par preuve positive (mtime HANDOFF)");
{
  const proj = makeProject("proj levee");
  const sid = uid("t08");
  const transcript = makeTranscript(proj, 950000, "claude-fable-5");
  const payload = {
    session_id: sid,
    transcript_path: transcript,
    cwd: proj,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "avant handoff" },
  };
  const r1 = runHook(GUARD, payload);
  check(r1.stdout.indexOf('"permissionDecision":"deny"') !== -1, "appel 1 refuse (armement)", "deny");
  sleep(40);
  const handoff = path.join(proj, "tasks", "HANDOFF-reprise.md");
  fs.mkdirSync(path.dirname(handoff), { recursive: true });
  fs.writeFileSync(handoff, "# HANDOFF\n\n## Reprise prioritaire\n- test\n", "utf8");
  const r2 = runHook(GUARD, payload);
  check(r2.stdout.indexOf("deny") === -1, "appel 2 apres ecriture du HANDOFF : leve", r2.stdout === "" ? "silencieux" : r2.stdout.slice(0, 60));
  const r3 = runHook(GUARD, payload);
  check(r3.stdout.indexOf("deny") === -1, "appel 3 : pas de rearmement dans la meme epoque", r3.stdout === "" ? "silencieux" : r3.stdout.slice(0, 60));
}

// ---------------------------------------------------------------------------
// Test 9 : extraction de candidat (valide + code block ignore + redaction
//          + projet sensible)
// ---------------------------------------------------------------------------
title("T09 extraction de candidat lecon");
{
  const proj = makeProject("proj instinct");
  const sid = uid("t09");
  const fence = "```";
  const msg = [
    "Rapport final du debug. Cause racine trouvée.",
    "",
    "INSTINCT-CANDIDAT:",
    "declencheur: build échoué avec token " + SK_LIVE + "_ABCDEF1234567890XYZWV dans les logs",
    "action: purger le cache de build avant tout retry",
    "confiance: 0.7",
    "preuve: reproduit deux fois sur le même projet",
    "",
    "Exemple à ne pas suivre (cité) :",
    fence,
    "INSTINCT-CANDIDAT:",
    "declencheur: exemple cité dans un bloc de code",
    "action: ne pas extraire",
    "confiance: 0.9",
    "preuve: aucune",
    fence,
    "Instincts : 1 déposé",
  ].join("\n");
  const r = runHook(CAPTURE, {
    session_id: sid,
    transcript_path: "",
    cwd: proj,
    hook_event_name: "SubagentStop",
    agent_id: "agent-dbg-1",
    agent_type: "debugger",
    agent_transcript_path: "C:/fake/agent transcript.jsonl",
    last_assistant_message: msg,
  });
  check(r.status === 0, "exit 0", String(r.status));
  const sas = path.join(ROOT_SIM, "shared", "tasks", "instincts", "proj instinct");
  const files = fs.existsSync(sas) ? fs.readdirSync(sas).filter((f) => f.endsWith(".md")) : [];
  check(files.length === 1, "UN seul candidat depose (le marqueur en code block est ignore)", files.join(", ") || "aucun");
  if (files.length === 1) {
    const body = fs.readFileSync(path.join(sas, files[0]), "utf8");
    check(body.indexOf(SK_LIVE) === -1 && body.indexOf("[REDACTED]") !== -1, "bloc REDACTE avant depot", "secret absent, [REDACTED] present");
    const fields = ["declencheur:", "action:", "confiance:", "preuve:", "agent:", "session:", "sensibilite:"];
    check(fields.every((f) => body.indexOf(f) !== -1), "frontmatter 7 champs", fields.filter((f) => body.indexOf(f) !== -1).length + "/7");
    check(body.indexOf('"normale"') !== -1, "sensibilite normale hors projet sensible", "normale");
    check(/^\d{8}-debugger-/.test(files[0]), "nommage YYYYMMDD-<agent>-<slug>.md", files[0]);
    check(files[0].indexOf("sk-l" + "ive") === -1 && files[0].indexOf(SK_LIVE) === -1, "aucun fragment de secret dans le NOM du fichier", files[0]);
  }
  check(fs.existsSync(path.join(ROOT_SIM, "shared", "tasks", "instincts", ".gitignore")), "sas gitignore par construction", "present");
  const evs = journalEvents(proj, sid);
  check(evs && evs.length === 1 && evs[0].ev.type === "subagent_stop" && evs[0].ev.agent_transcript_path === "C:/fake/agent transcript.jsonl", "subagent_stop journalise (chemin seul)", JSON.stringify(evs ? evs[0].ev.type : "-"));

  // Variante projet SENSIBLE (marqueur configure par env) : depot LOCAL au
  // projet, jamais dans le sas partage.
  const projSens = makeProject("SENSIBLE_client test");
  const sidSens = uid("t09b");
  runHook(CAPTURE, {
    session_id: sidSens,
    transcript_path: "",
    cwd: projSens,
    hook_event_name: "SubagentStop",
    agent_id: "agent-dbg-2",
    agent_type: "qa",
    agent_transcript_path: "C:/fake/t.jsonl",
    last_assistant_message: "INSTINCT-CANDIDAT:\ndeclencheur: cas sensible\naction: rester local\nconfiance: 0.5\npreuve: sonde",
  }, { SCRIBE_SENSITIVE_MARKERS: "sensible_" });
  const localDir = path.join(projSens, ".claude", "scribe", "instincts");
  const localFiles = fs.existsSync(localDir) ? fs.readdirSync(localDir).filter((f) => f.endsWith(".md")) : [];
  check(localFiles.length === 1, "projet sensible : depot local au projet", localFiles.join(", ") || "aucun");
  check(!fs.existsSync(path.join(ROOT_SIM, "shared", "tasks", "instincts", "SENSIBLE_client test")), "projet sensible : RIEN dans le sas partage", "absent");
  if (localFiles.length === 1) {
    const bodySens = fs.readFileSync(path.join(localDir, localFiles[0]), "utf8");
    check(bodySens.indexOf('"sensible-local"') !== -1, "sensibilite sensible-local", "sensible-local");
  }
}

// ---------------------------------------------------------------------------
// Test 10 : filtre agent scribe (jamais journalise)
// ---------------------------------------------------------------------------
title("T10 filtre agent scribe");
{
  const proj = makeProject("proj filtre");
  const sid = uid("t10");
  const r1 = runHook(CAPTURE, {
    session_id: sid,
    transcript_path: "",
    cwd: proj,
    hook_event_name: "PostToolUse",
    tool_name: "Agent",
    tool_input: { prompt: "brief du scribe", subagent_type: "scribe" },
    tool_response: { status: "ok", agentId: "a1", agentType: "scribe", resolvedModel: "claude-sonnet-5", totalDurationMs: 10 },
  });
  const r2 = runHook(CAPTURE, {
    session_id: sid,
    transcript_path: "",
    cwd: proj,
    hook_event_name: "SubagentStop",
    agent_id: "a1",
    agent_type: "scribe",
    agent_transcript_path: "C:/fake/scribe.jsonl",
    last_assistant_message: "INSTINCT-CANDIDAT:\ndeclencheur: x\naction: y\nconfiance: 0.4\npreuve: z",
  });
  check(r1.status === 0 && r2.status === 0, "exit 0 sur les deux evenements", r1.status + "," + r2.status);
  const evs = journalEvents(proj, sid);
  check(evs === null, "AUCUN evenement journalise pour l'agent scribe", evs === null ? "journal absent" : String(evs.length));
  const sasScribe = path.join(ROOT_SIM, "shared", "tasks", "instincts", "proj filtre");
  check(!fs.existsSync(sasScribe), "aucun candidat depose par le scribe lui-meme", "absent");
}

// ---------------------------------------------------------------------------
// Test 11 : kill switch SCRIBE_DISABLE=1
// ---------------------------------------------------------------------------
title("T11 kill switch SCRIBE_DISABLE=1");
{
  const proj = makeProject("proj kill");
  const sid = uid("t11");
  const transcript = makeTranscript(proj, 950000, "claude-fable-5");
  const kill = { SCRIBE_DISABLE: "1" };
  const r1 = runHook(CAPTURE, { session_id: sid, transcript_path: "", cwd: proj, hook_event_name: "SessionStart", source: "startup" }, kill);
  check(r1.status === 0 && r1.stdout === "", "capture : exit 0, sortie vide", "status=" + r1.status + " stdout=" + (r1.stdout || "vide"));
  check(journalEvents(proj, sid) === null, "capture : aucun journal cree", "absent");
  const r2 = runHook(GUARD, {
    session_id: sid,
    transcript_path: transcript,
    cwd: proj,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "x" },
  }, kill);
  check(r2.status === 0 && r2.stdout === "", "guard : exit 0, aucun deny malgre 950k tokens", "status=" + r2.status + " stdout=" + (r2.stdout || "vide"));
}

// ---------------------------------------------------------------------------
// Test 12 : traversal et confinement de la liste blanche
// ---------------------------------------------------------------------------
title("T12 traversal : liste blanche confinee au projectDir");
{
  const proj = makeProject("proj traversal");
  // Unitaires : canonicalisation + confinement.
  check(guard.isDocPath(proj, path.join(proj, "tasks", "notes.md")) === true, "tasks/notes.md accepte", "true");
  check(guard.isDocPath(proj, "tasks/notes.md") === true, "chemin relatif tasks/ accepte (resolu contre le projet)", "true");
  check(guard.isDocPath(proj, path.join(proj, "tasks", "..", "src", "app.js")) === false, "tasks/../src/app.js REFUSE (traversal)", "false");
  check(guard.isDocPath(proj, "docs/marathon/../../package.json") === false, "docs/marathon/../../package.json REFUSE", "false");
  check(guard.isDocPath(proj, "C:/Windows/System32/HANDOFF-loader.dll") === false, "HANDOFF hors projet REFUSE", "false");
  check(guard.isDocPath(proj, path.join(proj, "HANDOFF-reprise.md")) === true, "basename HANDOFF* DANS le projet accepte", "true");
  check(guard.isDocPath(proj, path.join(proj, "tasks", "x.md") + ":stream") === false, "ADS (flux alternatif) REFUSE", "false");
  check(guard.isDocPath(proj, proj) === false, "le projectDir lui-meme n'est pas un chemin doc", "false");

  // E2E : sous deny arme, un Write traversant tasks/../src est BLOQUE.
  const sid = uid("t12");
  const transcript = makeTranscript(proj, 950000, "claude-fable-5");
  const payload = {
    session_id: sid,
    transcript_path: transcript,
    cwd: proj,
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: { file_path: path.join(proj, "tasks", "..", "src", "app.js"), content: "code" },
  };
  const r1 = runHook(GUARD, payload);
  check(r1.stdout.indexOf('"permissionDecision":"deny"') !== -1, "E2E : Write tasks/../src/app.js refuse sous S3", r1.stdout.slice(0, 60) + "...");
  const r2 = runHook(GUARD, Object.assign({}, payload, { tool_input: { file_path: "C:/Windows/HANDOFF-evil.md", content: "x" } }));
  check(r2.stdout.indexOf('"permissionDecision":"deny"') !== -1, "E2E : HANDOFF hors projet refuse sous S3", r2.stdout.slice(0, 60) + "...");
  const r3 = runHook(GUARD, Object.assign({}, payload, { tool_input: { file_path: path.join(proj, "tasks", "notes.md"), content: "x" } }));
  check(r3.stdout.indexOf("deny") === -1, "E2E : Write tasks/notes.md (dans le projet) passe", r3.stdout === "" ? "silencieux" : r3.stdout.slice(0, 60));
}

// ---------------------------------------------------------------------------
// Test 13 : tuple de seuils invalide = defauts ENTIERS + journal
// ---------------------------------------------------------------------------
title("T13 tuple de seuils invalide : defauts entiers");
{
  // Unitaires (en process : manipulation directe de process.env).
  const saved = { s1: process.env.SCRIBE_S1, s2: process.env.SCRIBE_S2, s3: process.env.SCRIBE_S3 };
  process.env.SCRIBE_S1 = "1000001"; // s1 > s2 : ordre casse
  delete process.env.SCRIBE_S2;
  delete process.env.SCRIBE_S3;
  let th = guard.resolveThresholds(1000000);
  check(th.invalid === true && th.s1 === 550000 && th.s2 === 700000 && th.s3 === 900000, "s1=1000001 : tuple defaut ENTIER + invalid", JSON.stringify(th));
  process.env.SCRIBE_S1 = "150000x"; // suffixe : parsing strict
  th = guard.resolveThresholds(1000000);
  check(th.invalid === true && th.s1 === 550000, "suffixe non numerique : invalide, defauts", JSON.stringify({ invalid: th.invalid, s1: th.s1 }));
  process.env.SCRIBE_S1 = "100000";
  process.env.SCRIBE_S2 = "200000";
  process.env.SCRIBE_S3 = "970000"; // > fenetre - plancher (960000)
  th = guard.resolveThresholds(1000000);
  check(th.invalid === true && th.s3 === 900000, "s3 > fenetre-plancher : invalide, defauts", JSON.stringify({ invalid: th.invalid, s3: th.s3 }));
  process.env.SCRIBE_S3 = "300000"; // tuple valide 100k < 200k < 300k <= 960k
  th = guard.resolveThresholds(1000000);
  check(th.invalid === false && th.s1 === 100000 && th.s2 === 200000 && th.s3 === 300000, "tuple valide : applique tel quel", JSON.stringify(th));
  if (saved.s1 !== undefined) process.env.SCRIBE_S1 = saved.s1; else delete process.env.SCRIBE_S1;
  if (saved.s2 !== undefined) process.env.SCRIBE_S2 = saved.s2; else delete process.env.SCRIBE_S2;
  if (saved.s3 !== undefined) process.env.SCRIBE_S3 = saved.s3; else delete process.env.SCRIBE_S3;

  // E2E : override invalide -> le deny tombe quand meme sur les DEFAUTS et
  // l'evenement thresholds_invalid est journalise.
  const proj = makeProject("proj seuils");
  const sid = uid("t13");
  const transcript = makeTranscript(proj, 950000, "claude-fable-5");
  const r = runHook(GUARD, {
    session_id: sid,
    transcript_path: transcript,
    cwd: proj,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "x" },
  }, { SCRIBE_S1: "1000001" });
  check(r.stdout.indexOf('"permissionDecision":"deny"') !== -1, "E2E : deny sur seuils par defaut malgre override casse", r.stdout.slice(0, 60) + "...");
  const evs = journalEvents(proj, sid);
  check(evs && evs.some((e) => e.ev.type === "thresholds_invalid"), "thresholds_invalid journalise", JSON.stringify(evs ? evs.map((e) => e.ev.type) : []));
}

// ---------------------------------------------------------------------------
// Test 14 : mtime FUTUR n'est pas une preuve de levee
// ---------------------------------------------------------------------------
title("T14 mtime futur : pas une preuve");
{
  const proj = makeProject("proj futur");
  const sid = uid("t14");
  const transcript = makeTranscript(proj, 950000, "claude-fable-5");
  const payload = {
    session_id: sid,
    transcript_path: transcript,
    cwd: proj,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "x" },
  };
  const r1 = runHook(GUARD, payload);
  check(r1.stdout.indexOf('"permissionDecision":"deny"') !== -1, "appel 1 refuse (armement)", "deny");
  const handoff = path.join(proj, "tasks", "HANDOFF-reprise.md");
  fs.mkdirSync(path.dirname(handoff), { recursive: true });
  fs.writeFileSync(handoff, "# HANDOFF futur\n", "utf8");
  const future = new Date(Date.now() + 10 * 60 * 1000);
  fs.utimesSync(handoff, future, future);
  const r2 = runHook(GUARD, payload);
  check(r2.stdout.indexOf('"permissionDecision":"deny"') !== -1, "mtime a now+10min : deny MAINTENU", r2.stdout.slice(0, 60) + "...");
  const now = new Date();
  fs.utimesSync(handoff, now, now);
  const r3 = runHook(GUARD, payload);
  check(r3.stdout.indexOf("deny") === -1, "mtime revenu a now : levee", r3.stdout === "" ? "silencieux" : r3.stdout.slice(0, 60));
}

// ---------------------------------------------------------------------------
// Test 15 : baseline de levee capturee a l'ARMEMENT
// ---------------------------------------------------------------------------
title("T15 baseline de levee : fichier intact = pas de levee");
{
  const proj = makeProject("proj baseline");
  const sid = uid("t15");
  const transcript = makeTranscript(proj, 950000, "claude-fable-5");
  // HANDOFF PRE-EXISTANT (non vide, mtime vieux d'une heure) AVANT l'armement.
  const handoff = path.join(proj, "tasks", "HANDOFF-reprise.md");
  fs.mkdirSync(path.dirname(handoff), { recursive: true });
  fs.writeFileSync(handoff, "# HANDOFF ancien\n", "utf8");
  const old = new Date(Date.now() - 60 * 60 * 1000);
  fs.utimesSync(handoff, old, old);
  const payload = {
    session_id: sid,
    transcript_path: transcript,
    cwd: proj,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "x" },
  };
  const r1 = runHook(GUARD, payload);
  check(r1.stdout.indexOf('"permissionDecision":"deny"') !== -1, "armement malgre HANDOFF pre-existant (baseline capturee)", "deny");
  const r2 = runHook(GUARD, payload);
  check(r2.stdout.indexOf('"permissionDecision":"deny"') !== -1, "fichier INTACT : pas de levee, deny maintenu", r2.stdout.slice(0, 60) + "...");
  // Reecriture APRES l'armement : mtime avance au-dela de la baseline.
  fs.writeFileSync(handoff, "# HANDOFF reecrit apres armement\n\n## Reprise prioritaire\n- ok\n", "utf8");
  const r3 = runHook(GUARD, payload);
  check(r3.stdout.indexOf("deny") === -1, "reecriture APRES armement : levee", r3.stdout === "" ? "silencieux" : r3.stdout.slice(0, 60));
}

// ---------------------------------------------------------------------------
// Test 16 : stdin non-JSON / session_id absent ou hors format
// ---------------------------------------------------------------------------
title("T16 stdin invalide et session_id : silence, jamais de session default");
{
  const proj = makeProject("proj stdin");
  // (a) stdin non-JSON : exit 0, silence total, aucun etat cree.
  const r1 = runHookRaw(CAPTURE, "ceci n'est pas du json {");
  check(r1.status === 0 && r1.stdout === "", "capture : non-JSON = exit 0 silencieux", "status=" + r1.status + " stdout=" + (r1.stdout || "vide"));
  const r2 = runHookRaw(GUARD, "toujours pas du json");
  check(r2.status === 0 && r2.stdout === "", "guard : non-JSON = exit 0 silencieux", "status=" + r2.status + " stdout=" + (r2.stdout || "vide"));
  // (b) session_id ABSENT : ne rien faire, aucun journal cree.
  const r3 = runHook(CAPTURE, { transcript_path: "", cwd: proj, hook_event_name: "SessionStart", source: "startup" });
  check(r3.status === 0 && r3.stdout === "", "session_id absent : exit 0 silencieux", "status=" + r3.status);
  check(!fs.existsSync(path.join(proj, ".claude")), "session_id absent : AUCUN journal cree (pas de session default)", "absent");
  // (c) session_id hors format : hash sha256 tronque, injectif.
  const hashed = lib.sanitizeSessionId({ session_id: "a:b" });
  check(/^[0-9a-f]{32}$/.test(hashed), "SID hors format -> hash 32 hex", hashed);
  check(lib.sanitizeSessionId({ session_id: "a:b" }) !== lib.sanitizeSessionId({ session_id: "ab" }), "a:b et ab ne partagent PAS d'identite (injectif)", "differents");
  check(lib.sanitizeSessionId({ session_id: "s".repeat(300) }).length === 32, "SID de 300 caracteres borne a 32 (NTFS-safe)", "32");
  // SID invalide UNIQUE par run : un SID fixe re-hacherait vers le meme etat
  // tmp d'un run precedent (projectDir fige) et fausserait le test.
  const rawSid = "a:b " + uid("t16c");
  const hashedSid = lib.sanitizeSessionId({ session_id: rawSid });
  const r4 = runHook(CAPTURE, { session_id: rawSid, transcript_path: "", cwd: proj, hook_event_name: "SessionStart", source: "startup" });
  check(r4.status === 0, "SessionStart avec SID hors format : exit 0", String(r4.status));
  const jdir = path.join(proj, ".claude", "scribe");
  const jfiles = fs.existsSync(jdir) ? fs.readdirSync(jdir).filter((f) => /^journal-.*\.jsonl$/.test(f)) : [];
  check(jfiles.length === 1 && jfiles[0] === "journal-" + hashedSid + ".jsonl", "journal nomme sur le hash, pas sur le SID brut", jfiles.join(",") || "aucun");
}

// ---------------------------------------------------------------------------
// Test 17 : denyCount JAMAIS remis a zero par une intention PreToolUse
// ---------------------------------------------------------------------------
title("T17 disjoncteur : une intention Write doc ne remet pas le compteur a zero");
{
  const proj = makeProject("proj compteur");
  const sid = uid("t17");
  const transcript = makeTranscript(proj, 950000, "claude-fable-5");
  const bash = {
    session_id: sid,
    transcript_path: transcript,
    cwd: proj,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "x" },
  };
  let denies = 0;
  for (let i = 0; i < 10; i++) {
    const r = runHook(GUARD, bash);
    if (r.stdout.indexOf('"permissionDecision":"deny"') !== -1) denies++;
  }
  check(denies === 10, "10 denies accumules", String(denies));
  // Intention Write vers tasks/ (ALLOWED) mais SANS ecriture reelle du fichier.
  const rDoc = runHook(GUARD, Object.assign({}, bash, {
    tool_name: "Write",
    tool_input: { file_path: path.join(proj, "tasks", "HANDOFF-reprise.md"), content: "x" },
  }));
  check(rDoc.stdout.indexOf("deny") === -1, "intention Write doc : autorisee (liste blanche)", rDoc.stdout === "" ? "silencieux" : rDoc.stdout.slice(0, 40));
  // L'appel suivant DOIT ouvrir le disjoncteur (compteur toujours a 10) :
  // si le compteur avait ete remis a zero par l'intention, ce serait un deny.
  const rNext = runHook(GUARD, bash);
  check(rNext.stdout.indexOf('"permissionDecision":"deny"') === -1, "appel suivant : PAS un deny (compteur non remis a zero)", rNext.stdout.slice(0, 60) + "...");
  check(rNext.stdout.indexOf("Disjoncteur") !== -1, "disjoncteur ouvert a 10 denies malgre l'intention doc", "present");
}

// ---------------------------------------------------------------------------
// Test 18 : snapshot PreCompact : mode racine = metadonnees seules
//           + SID COMPLET dans le nom
// ---------------------------------------------------------------------------
title("T18 snapshot : rootMode metadonnees seules, SID complet");
{
  function makeTodoTranscript(dir, todoText) {
    const file = path.join(dir, "transcript todo " + Math.random().toString(36).slice(2, 6) + ".jsonl");
    const mainRec = JSON.stringify({
      isSidechain: false,
      message: {
        model: "claude-fable-5",
        usage: { input_tokens: 400000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    });
    const todoRec = JSON.stringify({
      isSidechain: false,
      message: {
        content: [
          { type: "tool_use", name: "TodoWrite", input: { todos: [{ content: todoText, status: "in_progress" }] } },
        ],
      },
    });
    fs.writeFileSync(file, mainRec + "\n" + todoRec + "\n", "utf8");
    return file;
  }

  // (a) Mode racine : le snapshot ne contient NI todo NI sortie git brute.
  const sidRoot = uid("t18root");
  const secretTodo = "TacheSecreteXYZ";
  const tRoot = makeTodoTranscript(ROOT_SIM, secretTodo);
  const r1 = runHook(CAPTURE, {
    session_id: sidRoot,
    transcript_path: tRoot,
    cwd: ROOT_SIM,
    hook_event_name: "PreCompact",
    trigger: "auto",
  });
  check(r1.status === 0, "PreCompact racine : exit 0", String(r1.status));
  const snapRoot = path.join(ROOT_SIM, ".claude", "scribe", "CONTEXT-PRE-COMPACT-" + sidRoot + ".md");
  check(fs.existsSync(snapRoot), "snapshot racine present, SID COMPLET dans le nom", path.basename(snapRoot));
  if (fs.existsSync(snapRoot)) {
    const body = fs.readFileSync(snapRoot, "utf8");
    check(body.indexOf(secretTodo) === -1, "AUCUN contenu de todo dans le snapshot racine", "absent");
    check(body.indexOf("métadonnées seules") !== -1, "marqueur mode metadonnees seules present", "present");
    check(body.indexOf("git status --short") === -1, "aucune section git brute en mode racine", "absent");
  }

  // (b) Projet normal : todo present (sanitise), SID complet dans le nom.
  const proj = makeProject("proj snapshot");
  const sidProj = uid("t18proj");
  const visibleTodo = "TacheVisibleProjet";
  const tProj = makeTodoTranscript(proj, visibleTodo + " avec cle " + SK_LIVE + "_ABCDEFGH12345678");
  const r2 = runHook(CAPTURE, {
    session_id: sidProj,
    transcript_path: tProj,
    cwd: proj,
    hook_event_name: "PreCompact",
    trigger: "manual",
  });
  check(r2.status === 0, "PreCompact projet : exit 0", String(r2.status));
  const snapProj = path.join(proj, ".claude", "scribe", "CONTEXT-PRE-COMPACT-" + sidProj + ".md");
  check(fs.existsSync(snapProj), "snapshot projet present, SID COMPLET dans le nom", path.basename(snapProj));
  if (fs.existsSync(snapProj)) {
    const body = fs.readFileSync(snapProj, "utf8");
    check(body.indexOf(visibleTodo) !== -1, "todo present hors mode racine", "present");
    check(body.indexOf(SK_LIVE + "_ABCDEFGH") === -1 && body.indexOf("[REDACTED]") !== -1, "todo passe par le sink (redaction)", "redige");
  }
}

// ---------------------------------------------------------------------------
// Test 19 : creation EXCLUSIVE des candidats (collision -> suffixe)
// ---------------------------------------------------------------------------
title("T19 depot de candidat en wx : collision -> suffixe incremental");
{
  const proj = makeProject("proj collision");
  const msg = "INSTINCT-CANDIDAT:\ndeclencheur: meme declencheur exact\naction: verifier le suffixe\nconfiance: 0.6\npreuve: test collision";
  for (let i = 0; i < 3; i++) {
    runHook(CAPTURE, {
      session_id: uid("t19-" + i),
      transcript_path: "",
      cwd: proj,
      hook_event_name: "SubagentStop",
      agent_id: "agent-c-" + i,
      agent_type: "challenger",
      agent_transcript_path: "C:/fake/c.jsonl",
      last_assistant_message: msg,
    });
  }
  const sas = path.join(ROOT_SIM, "shared", "tasks", "instincts", "proj collision");
  const files = fs.existsSync(sas) ? fs.readdirSync(sas).filter((f) => f.endsWith(".md")).sort() : [];
  check(files.length === 3, "3 depots homonymes = 3 fichiers (aucun ecrasement)", files.join(", ") || "aucun");
  check(files.some((f) => /-2\.md$/.test(f)) && files.some((f) => /-3\.md$/.test(f)), "suffixes -2 et -3 presents", files.join(", "));
}

// ---------------------------------------------------------------------------
// Test 20 : premier PreToolUse sans record usage lisible = fail-open
// ---------------------------------------------------------------------------
title("T20 transcript sans usage principal : fail-open loggue une fois");
{
  const proj = makeProject("proj failopen");
  const sid = uid("t20");
  const file = path.join(proj, "transcript sidechain.jsonl");
  const sideRec = JSON.stringify({
    isSidechain: true,
    message: { model: "claude-sonnet-5", usage: { input_tokens: 999999, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
  });
  fs.writeFileSync(file, sideRec + "\n" + sideRec + "\n", "utf8");
  const payload = {
    session_id: sid,
    transcript_path: file,
    cwd: proj,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "x" },
  };
  const r1 = runHook(GUARD, payload);
  check(r1.status === 0 && r1.stdout === "", "fail-open : exit 0, aucun deny, aucun advisory", "status=" + r1.status + " stdout=" + (r1.stdout || "vide"));
  check(r1.stderr.indexOf("fail-open") !== -1, "signal stderr fail-open emis", r1.stderr.slice(0, 80));
  const r2 = runHook(GUARD, payload);
  check(r2.stderr === "", "second appel : log non repete (readFailLogged persiste)", r2.stderr === "" ? "vide" : r2.stderr.slice(0, 60));
}

// ---------------------------------------------------------------------------
// Test 21 : tail sature de sidechains : cache reutilise si arme,
//           fail-open + log si jamais arme
// ---------------------------------------------------------------------------
title("T21 tail sature : fail-closed avec cache, fail-open sans");
{
  const proj = makeProject("proj sature");
  const sideRec = JSON.stringify({
    isSidechain: true,
    message: { model: "claude-sonnet-5", usage: { input_tokens: 12345, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
  });
  // ~9,3 Mo de sidechains (> TAIL_BLOCK_MAX = 8 Mo).
  const bigBlock = new Array(65000).fill(sideRec).join("\n") + "\n";

  // (a) Session armee : usage principal lu et mis en CACHE, puis enfoui sous
  // 9 Mo de sidechains -> le garde reste arme (fail-closed via cache).
  const sidA = uid("t21a");
  const transcript = makeTranscript(proj, 950000, "claude-fable-5");
  const payload = {
    session_id: sidA,
    transcript_path: transcript,
    cwd: proj,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "x" },
  };
  const r1 = runHook(GUARD, payload);
  check(r1.stdout.indexOf('"permissionDecision":"deny"') !== -1, "appel 1 : deny (armement, cache pose)", "deny");
  fs.appendFileSync(transcript, bigBlock, "utf8");
  const r2 = runHook(GUARD, payload);
  check(r2.stdout.indexOf('"permissionDecision":"deny"') !== -1, "appel 2 : usage enfoui sous 9 Mo de sidechains, deny MAINTENU (cache)", r2.stdout.slice(0, 60) + "...");

  // (b) Session jamais armee, transcript sature SANS usage principal :
  // fail-open + UN log stderr.
  const sidB = uid("t21b");
  const fileB = path.join(proj, "transcript sature.jsonl");
  fs.writeFileSync(fileB, bigBlock, "utf8");
  const payloadB = {
    session_id: sidB,
    transcript_path: fileB,
    cwd: proj,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "x" },
  };
  const r3 = runHook(GUARD, payloadB);
  check(r3.status === 0 && r3.stdout === "", "sature sans cache ni armement : fail-open silencieux", "status=" + r3.status + " stdout=" + (r3.stdout || "vide"));
  check(r3.stderr.indexOf("satur") !== -1, "signal stderr saturation emis", r3.stderr.slice(0, 90));
  const r4 = runHook(GUARD, payloadB);
  check(r4.stderr === "", "second appel : log saturation non repete", r4.stderr === "" ? "vide" : r4.stderr.slice(0, 60));

  // (c) Unitaire : lecture non chevauchante, resultat sature distinct.
  const res = lib.readTranscriptTail(fileB, null);
  check(res.ok === true && res.found === false && res.saturated === true, "readTranscriptTail : {ok, found:false, saturated:true}", JSON.stringify({ ok: res.ok, found: res.found, saturated: res.saturated }));
  const resCache = lib.readTranscriptTail(fileB, { size: 100, tokens: 777000, model: "claude-fable-5" });
  check(resCache.found === true && resCache.fromCache === true && resCache.tokens === 777000, "cache reutilise quand sature (found=true, fromCache)", JSON.stringify({ found: resCache.found, fromCache: resCache.fromCache, tokens: resCache.tokens }));
}

// ---------------------------------------------------------------------------
// Test 22 : gitignore verifie par CONTENU + cap stdin 1 Mo
// ---------------------------------------------------------------------------
title("T22 gitignore verifie par contenu + cap stdin");
{
  const proj = makeProject("proj gitignore");
  const dir = path.join(proj, ".claude", "scribe");
  fs.mkdirSync(dir, { recursive: true });
  // .gitignore PRE-EXISTANT mais INADEQUAT (la regle * n'y est pas).
  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules\n", "utf8");
  const ensured = lib.ensureScribeDir(proj);
  const gi = fs.readFileSync(path.join(dir, ".gitignore"), "utf8");
  check(ensured.gitignoreOk === true, "regle garantie apres completion du .gitignore inadequat", String(ensured.gitignoreOk));
  check(gi.indexOf("node_modules") !== -1 && /^\*$/m.test(gi), "contenu existant conserve, regle * ajoutee", JSON.stringify(gi));
  // Cap stdin : un payload de 2 Mo est rejete en silence, aucun etat ni
  // journal cree.
  const sidBig = uid("t22big");
  const big = JSON.stringify({
    session_id: sidBig,
    transcript_path: "",
    cwd: proj,
    hook_event_name: "SessionStart",
    source: "startup",
    bourrage: "x".repeat(2 * 1024 * 1024),
  });
  const r = runHookRaw(CAPTURE, big);
  check(r.status === 0 && r.stdout === "", "stdin > 1 Mo : exit 0 silencieux", "status=" + r.status + " stdout=" + (r.stdout || "vide"));
  check(journalEvents(proj, sidBig) === null, "stdin > 1 Mo : aucun journal cree", "absent");
}

// ---------------------------------------------------------------------------
// Test 23 : aucun sas partage configure (SCRIBE_ROOT_DIR vide) = depot local
// ---------------------------------------------------------------------------
title("T23 sans sas partage : depot local au projet");
{
  const proj = makeProject("proj sans racine");
  const sid = uid("t23");
  const noRoot = { SCRIBE_ROOT_DIR: "", SCRIBE_SAS_DIR: "" };
  const r = runHook(CAPTURE, {
    session_id: sid,
    transcript_path: "",
    cwd: proj,
    hook_event_name: "SubagentStop",
    agent_id: "agent-l-1",
    agent_type: "qa",
    agent_transcript_path: "C:/fake/l.jsonl",
    last_assistant_message: "INSTINCT-CANDIDAT:\ndeclencheur: pas de racine configuree\naction: deposer localement\nconfiance: 0.6\npreuve: test T23",
  }, noRoot);
  check(r.status === 0, "exit 0", String(r.status));
  const localDir = path.join(proj, ".claude", "scribe", "instincts");
  const localFiles = fs.existsSync(localDir) ? fs.readdirSync(localDir).filter((f) => f.endsWith(".md")) : [];
  check(localFiles.length === 1, "candidat depose LOCALEMENT (aucun sas partage)", localFiles.join(", ") || "aucun");
  if (localFiles.length === 1) {
    const body = fs.readFileSync(path.join(localDir, localFiles[0]), "utf8");
    check(body.indexOf('"normale"') !== -1, "sensibilite normale (local par absence de sas, pas par sensibilite)", "normale");
  }
}

// ---------------------------------------------------------------------------
// Bilan
// ---------------------------------------------------------------------------
console.log("\n=== BILAN ===");
console.log("Sandbox (chemins avec espaces) : " + SANDBOX);
if (failures > 0) {
  console.log("ECHECS : " + failures);
  process.exitCode = 1;
} else {
  console.log("TOUS LES TESTS PASSENT (23 cas + variantes).");
}
