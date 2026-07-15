#!/usr/bin/env node
"use strict";

/*
 * journal-lib.js
 *
 * Lib partagée du module session-scribe (héritage Fable 5, édition publique).
 * Requise localement par scribe-capture.js et context-guard.js (jamais de
 * require inter-dossiers).
 *
 * Responsabilités :
 *   - enveloppe du journal-index {v:1, seq, ts, sid, cwd, ev} ;
 *   - chemin du journal : <projet>/.claude/scribe/journal-<session_id>.jsonl ;
 *   - état par session dans os.tmpdir() (mode racine FIGÉ au premier
 *     événement sur chemin CANONIQUE realpath ; seq monotone) ;
 *   - sanitisation par sink : redaction (jeu de motifs UNIQUE) appliquée sur
 *     la chaîne COMPLÈTE, PUIS troncature Unicode-safe ;
 *   - mode racine : aucun champ de contenu libre, remplacé par {sha8, len} ;
 *   - cap 5 Mo avec rotation préservant la FIN + événement journal_capped ;
 *   - TTL 14 j throttlé (1 sweep par session, à la création de l'état) ;
 *   - lecture tail du transcript par blocs remontants NON chevauchants,
 *     cache du dernier usage principal, résultat distinct saturated ;
 *   - détection de fenêtre avec flag window_defaulted.
 *
 * Paramétrage (variables d'environnement, toutes facultatives) :
 *   SCRIBE_ROOT_DIR           racine de votre monorepo : les sessions dont le
 *                             cwd est EXACTEMENT ce dossier passent en mode
 *                             métadonnées seules ; absent = mode jamais actif.
 *   SCRIBE_SAS_DIR            sas partagé des candidats leçons ; défaut :
 *                             <racine>/shared/tasks/instincts si la racine est
 *                             définie, sinon dépôt local au projet.
 *   SCRIBE_SENSITIVE_MARKERS  motifs (séparés par des virgules) de segments de
 *                             chemin marquant un projet confidentiel : dépôt
 *                             local uniquement. VIDE par défaut.
 *   SCRIBE_REDACTION_EXTRA    préfixes de secrets supplémentaires (virgules).
 *   SCRIBE_AGENT_NAME         nom de votre agent scribe (défaut : "scribe").
 *   SCRIBE_PILOT_AGENTS       agents pilotes dont les rapports sont greppés
 *                             pour INSTINCT-CANDIDAT (défaut :
 *                             "debugger,qa,challenger").
 *   SCRIBE_WINDOW_TOKENS      fenêtre de contexte prouvée du modèle.
 *   SCRIBE_S1 / S2 / S3       seuils de contexte (voir context-guard.js).
 *   SCRIBE_DISABLE=1          kill switch global.
 *
 * Concurrence : PAS de verrou inter-processus. Contexte mono-utilisateur :
 * les hooks d'une même session sont séquentiels dans le cas courant ; le coût
 * d'un verrou (fichiers .lock orphelins, timeouts, complexité) n'est pas payé
 * par le risque résiduel. Les écritures d'état passent par temp + rename
 * (remplacement atomique) : un lecteur ne voit jamais un état tronqué. Si
 * l'état ne peut PAS être persisté, l'appelant bascule en advisory visible
 * (context-guard, raison state_unwritable).
 *
 * Invariants : tout exit 0 côté appelants, erreurs sur stderr, JAMAIS de
 * contenu de payload dans les messages d'erreur.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const JOURNAL_CAP_BYTES = 5 * 1024 * 1024;
const JOURNAL_KEEP_BYTES = 500 * 1024;
const STATE_TTL_DAYS = 14;
const EXCERPT_MAX = 500;

const WINDOW_1M = 1000000;
const WINDOW_200K = 200000;

const TAIL_BLOCK_BYTES = 1024 * 1024;
const TAIL_BLOCK_MAX = 8 * 1024 * 1024;

// Cap stdin : 1 Mo. Un payload de hook réel fait quelques Ko.
const STDIN_MAX_BYTES = 1024 * 1024;

// Format attendu d'un session_id. Hors format : hash sha256 tronqué de la
// valeur ORIGINALE (identité injective, composant NTFS borné).
const SID_FORMAT = /^[A-Za-z0-9-]{1,64}$/;

// Jeu de motifs de redaction UNIQUE. Toute évolution passe par ce tableau
// (ou par SCRIBE_REDACTION_EXTRA), jamais par un jeu local dans un autre
// script. Les préfixes sont ASSEMBLÉS par concaténation pour qu'aucun motif
// de clé réelle n'apparaisse littéralement dans ce fichier public (le dépôt
// est lui-même soumis à un grep de sanitisation).
const DEFAULT_REDACTION_PREFIXES = [
  "sk_l" + "ive", // clés de paiement (mode production)
  "re_", // clés d'API d'envoi d'emails
  "pplx" + "-", // clés d'API de recherche
  "AIza" + "Sy", // clés d'API Google
  "eyJhb" + "Gci", // en-tête JWT encodé
  "ghp_",
  "gho_",
  "github_pat_",
  "whsec_",
  "sk-ant-",
  "rk_live_",
  "sk_test_",
  "sbp_",
];

function envList(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) return [];
  return String(v)
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
}

const REDACTION_PREFIXES = DEFAULT_REDACTION_PREFIXES.concat(envList("SCRIBE_REDACTION_EXTRA"));

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Motifs ambigus (fréquents en prose) : frontière exigée avant le préfixe.
// Les motifs distinctifs sont neutralisés PARTOUT, même collés à du texte
// (redaction agressive : un secret ne doit survivre nulle part).
const AMBIGUOUS_PREFIXES = ["re_"];

const REDACTION_REGEXES = REDACTION_PREFIXES.map(function (p) {
  const boundary = AMBIGUOUS_PREFIXES.indexOf(p) !== -1 ? "(?<![A-Za-z0-9])" : "";
  return new RegExp(boundary + escapeRe(p) + "[A-Za-z0-9_\\-\\.]{8,}", "g");
});

// Blocs PEM (clés privées) : forme différente des préfixes de clé, motif
// dédié. Neutralise l'en-tête ET le corps qui suit.
REDACTION_REGEXES.push(
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{0,4000}?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g
);

// ---------------------------------------------------------------------------
// Helpers bas niveau
// ---------------------------------------------------------------------------

function logErr(msg) {
  try {
    console.error(msg);
  } catch (e) {
    // rien : le stderr est du debug local
  }
}

// Un seul objet JSON sur stdout, sérialisé en Buffer UTF-8 et émis en boucle
// jusqu'à écriture complète (fs.writeSync peut écrire court sur un pipe ; le
// retour en octets est documenté). Le repli n'émet que le RESTE, jamais un
// préfixe déjà écrit.
function writeStdout(obj) {
  const buf = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
  let off = 0;
  try {
    while (off < buf.length) {
      try {
        off += fs.writeSync(1, buf, off, buf.length - off);
      } catch (e) {
        if (e && (e.code === "EAGAIN" || e.code === "EINTR")) continue;
        throw e;
      }
    }
  } catch (e) {
    try {
      process.stdout.write(buf.slice(off));
    } catch (e2) {
      // rien
    }
  }
}

function readFileSwallow(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    return null;
  }
}

// Écriture d'état : temp + rename = remplacement ATOMIQUE.
// Retourne true si l'état est persisté ; false sinon (l'appelant décide du
// repli : advisory visible côté garde).
function writeFileAtomic(file, data) {
  const tmp = file + "." + process.pid + "-" + Math.random().toString(36).slice(2, 8) + ".tmp";
  try {
    fs.writeFileSync(tmp, data, "utf8");
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch (e2) {
      // rien
    }
    return false;
  }
}

// Lecture du payload JSON sur stdin : timeout dur, cap 1 Mo, retrait des
// listeners + pause du flux à la sortie, retour STRUCTURÉ
// { ok, error, input }. error est un code court, jamais un écho du payload.
function readStdinJson(opts) {
  const timeoutMs = (opts && opts.timeoutMs) || 2000;
  return new Promise(function (resolve) {
    let raw = "";
    let size = 0;
    let done = false;
    let timer = null;

    function detach() {
      try {
        process.stdin.removeListener("data", onData);
        process.stdin.removeListener("end", onEnd);
        process.stdin.removeListener("error", onEnd);
        process.stdin.pause();
      } catch (e) {
        // rien
      }
    }

    function finish(errCode) {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      detach();
      if (errCode) return resolve({ ok: false, error: errCode, input: null });
      if (!raw.trim()) return resolve({ ok: false, error: "vide", input: null });
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        return resolve({ ok: false, error: "json_invalide", input: null });
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return resolve({ ok: false, error: "non_objet", input: null });
      }
      resolve({ ok: true, error: null, input: parsed });
    }

    function onData(chunk) {
      size += chunk.length;
      if (size > STDIN_MAX_BYTES) return finish("trop_gros");
      raw += chunk;
    }

    function onEnd() {
      finish(null);
    }

    timer = setTimeout(function () {
      finish("timeout");
    }, timeoutMs);
    try {
      timer.unref && timer.unref();
    } catch (e) {
      // rien
    }

    try {
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", onData);
      process.stdin.on("end", onEnd);
      process.stdin.on("error", onEnd);
    } catch (e) {
      finish("stdin_indisponible");
    }
  });
}

// ---------------------------------------------------------------------------
// Sanitisation par sink, redaction et troncature
// ---------------------------------------------------------------------------

function redact(text) {
  let out = String(text);
  for (let i = 0; i < REDACTION_REGEXES.length; i++) {
    const re = REDACTION_REGEXES[i];
    re.lastIndex = 0;
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}

// Troncature Unicode-safe : ne coupe jamais un surrogate pair.
function truncateUnicodeSafe(text, max) {
  const s = String(text);
  const limit = typeof max === "number" && max > 0 ? max : EXCERPT_MAX;
  if (s.length <= limit) return s;
  let cut = limit;
  const code = s.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return s.slice(0, cut);
}

function sha8(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex").slice(0, 8);
}

// LA fonction de sanitisation de sink : toute chaîne externe (sortie git, nom
// de fichier, message d'agent, chemin) passe ICI avant d'être écrite dans le
// snapshot, le journal ou le sas. Ordre impératif : REDACTION sur la chaîne
// complète PUIS troncature.
function sinkString(text, max) {
  return truncateUnicodeSafe(redact(String(text)), max || EXCERPT_MAX);
}

// Champ de contenu libre du journal. En mode racine, aucun contenu libre :
// {sha8, len} par construction. Sinon sinkString (redaction + troncature).
function makeExcerpt(state, text) {
  if (text === undefined || text === null) return null;
  const s = String(text);
  if (state && state.rootMode) {
    return { sha8: sha8(s), len: s.length };
  }
  return sinkString(s, EXCERPT_MAX);
}

// ---------------------------------------------------------------------------
// Chemins, canonicalisation, racine, projets sensibles
// ---------------------------------------------------------------------------

// Racine du monorepo (mode métadonnées seules) : null si non configurée.
function resolveRootDir() {
  const env = process.env.SCRIBE_ROOT_DIR;
  if (env && String(env).trim()) return String(env).trim();
  return null;
}

// Marqueurs de projets confidentiels (segments de chemin, minuscules).
function sensitiveMarkers() {
  return envList("SCRIBE_SENSITIVE_MARKERS").map(function (m) {
    return m.toLowerCase();
  });
}

// Nom de l'agent scribe attendu par les hooks (liste blanche du deny,
// filtre d'auto-journalisation).
function scribeAgentName() {
  const v = process.env.SCRIBE_AGENT_NAME;
  if (v && String(v).trim()) return String(v).trim();
  return "scribe";
}

// Canonicalisation PHYSIQUE : realpath natif résout jonctions, SUBST et
// alias 8.3 ; repli path.resolve si le chemin n'existe pas.
function canonPath(p) {
  const r = path.resolve(String(p));
  try {
    return fs.realpathSync.native(r);
  } catch (e) {
    return r;
  }
}

// Canonicalisation d'un chemin qui peut NE PAS ENCORE exister (cible d'un
// Write) : realpath du plus profond ancêtre existant, remonté segment par
// segment, puis ré-assemblage du reste. Résout les alias 8.3 et jonctions
// sur la partie existante.
function canonPathDeep(p) {
  const r = path.resolve(String(p));
  const rest = [];
  let cur = r;
  for (let i = 0; i < 64; i++) {
    try {
      const real = fs.realpathSync.native(cur);
      if (!rest.length) return real;
      rest.reverse();
      return path.join.apply(path, [real].concat(rest));
    } catch (e) {
      const parent = path.dirname(cur);
      if (parent === cur) return r;
      rest.push(path.basename(cur));
      cur = parent;
    }
  }
  return r;
}

// Comparaison de chemins sur le chemin CANONIQUE, insensible à la casse
// (Windows), séparateurs et slash final neutralisés.
function normPath(p) {
  let r = canonPath(p);
  r = r.replace(/[\\/]+$/, "");
  return r.toLowerCase();
}

// La classification "projet sensible" se fait sur le chemin CANONIQUE : une
// jonction vers un projet sensible est résolue avant le test des segments.
function isSensitiveProject(projectDir) {
  const markers = sensitiveMarkers();
  if (!markers.length) return false;
  const segs = canonPath(projectDir).split(/[\\/]+/);
  for (let i = 0; i < segs.length; i++) {
    const l = segs[i].toLowerCase();
    for (let j = 0; j < markers.length; j++) {
      if (l.indexOf(markers[j]) !== -1) return true;
    }
  }
  return false;
}

// Sas partagé des candidats leçons. Gitignoré par construction :
// ensureSasGitignore est appelé par le déposant. Retourne null si aucun sas
// partagé n'est configuré (les dépôts se font alors localement au projet).
function sasDir() {
  const env = process.env.SCRIBE_SAS_DIR;
  if (env && String(env).trim()) return String(env).trim();
  const root = resolveRootDir();
  if (root === null) return null;
  return path.join(root, "shared", "tasks", "instincts");
}

function scribeDir(projectDir) {
  return path.join(projectDir, ".claude", "scribe");
}

function journalPath(state) {
  return path.join(scribeDir(state.projectDir), "journal-" + state.sid + ".jsonl");
}

// ---------------------------------------------------------------------------
// État par session (os.tmpdir(), pattern sweepStaleState)
// ---------------------------------------------------------------------------

function getTempDir() {
  try {
    return os.tmpdir();
  } catch (e) {
    return ".";
  }
}

// session_id : jamais de session "default". Absent ou non-chaîne = null
// (l'appelant NE FAIT RIEN). Hors format attendu = hash sha256 tronqué de la
// valeur originale (injectif, borné, NTFS-safe).
function sanitizeSessionId(input) {
  const sid = input && typeof input.session_id === "string" ? input.session_id : "";
  if (!sid) return null;
  if (SID_FORMAT.test(sid)) return sid;
  return crypto.createHash("sha256").update(sid, "utf8").digest("hex").slice(0, 32);
}

function sessionStateFile(sid) {
  return path.join(getTempDir(), "claude-scribe-sess-" + sid + ".json");
}

function guardStateFile(sid) {
  return path.join(getTempDir(), "claude-scribe-guard-" + sid + ".json");
}

function dueFile(sid) {
  return path.join(getTempDir(), "claude-scribe-due-" + sid);
}

// Persistance atomique. Retourne true si écrit.
function saveSessionState(state) {
  return writeFileAtomic(
    sessionStateFile(state.sid),
    JSON.stringify({
      sid: state.sid,
      projectDir: state.projectDir,
      rootMode: state.rootMode,
      seq: state.seq,
      tailCache: state.tailCache || null,
    })
  );
}

function validTailCache(tc) {
  if (!tc || typeof tc !== "object") return null;
  if (typeof tc.size !== "number" || !isFinite(tc.size) || tc.size < 0) return null;
  if (typeof tc.tokens !== "number" || !isFinite(tc.tokens) || tc.tokens <= 0) return null;
  return { size: tc.size, tokens: tc.tokens, model: typeof tc.model === "string" ? tc.model : "" };
}

// Charge (ou crée) l'état de session. La classification racine/projet et
// l'emplacement du journal sont FIGÉS au premier événement, sur le chemin
// CANONIQUE realpath. Le sweep TTL tourne UNE fois par session, à la création
// de l'état. Chargement TOLÉRANT : état corrompu ou tronqué = on repart
// proprement.
function loadSessionState(input) {
  const sid = sanitizeSessionId(input);
  if (sid === null) throw new Error("session_id absent ou invalide");
  const raw = readFileSwallow(sessionStateFile(sid));
  if (raw !== null) {
    try {
      const st = JSON.parse(raw);
      if (st && typeof st === "object" && typeof st.projectDir === "string") {
        return {
          sid: sid,
          projectDir: st.projectDir,
          rootMode: st.rootMode === true,
          seq: typeof st.seq === "number" && isFinite(st.seq) && st.seq >= 0 ? Math.floor(st.seq) : 0,
          tailCache: validTailCache(st.tailCache),
        };
      }
    } catch (e) {
      // état corrompu : on repart proprement
    }
  }
  const cwd = (input && typeof input.cwd === "string" && input.cwd) || process.cwd();
  const projectDir = canonPath(cwd);
  const root = resolveRootDir();
  const state = {
    sid: sid,
    projectDir: projectDir,
    rootMode: root !== null && normPath(projectDir) === normPath(root),
    seq: 0,
    tailCache: null,
  };
  try {
    sweepStaleState(state);
  } catch (e) {
    // rien : ménage best-effort
  }
  saveSessionState(state);
  return state;
}

// TTL 14 j : fichiers d'état tmp claude-scribe-* et journaux du projet,
// session active préservée.
function sweepStaleState(state) {
  const ttlMs = STATE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const tempDir = getTempDir();
  let entries;
  try {
    entries = fs.readdirSync(tempDir);
  } catch (e) {
    entries = [];
  }
  for (let i = 0; i < entries.length; i++) {
    const name = entries[i];
    if (name.indexOf("claude-scribe-") !== 0) continue;
    if (name.indexOf(state.sid) !== -1) continue;
    const full = path.join(tempDir, name);
    try {
      const st = fs.statSync(full);
      if (now - st.mtimeMs > ttlMs) fs.unlinkSync(full);
    } catch (e) {
      // rien : échec individuel ignoré
    }
  }

  const dir = scribeDir(state.projectDir);
  let jEntries;
  try {
    jEntries = fs.readdirSync(dir);
  } catch (e) {
    return;
  }
  for (let i = 0; i < jEntries.length; i++) {
    const name = jEntries[i];
    if (!/^journal-.*\.jsonl$/.test(name)) continue;
    if (name === "journal-" + state.sid + ".jsonl") continue;
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (now - st.mtimeMs > ttlMs) fs.unlinkSync(full);
    } catch (e) {
      // rien
    }
  }
  // Snapshots pré-compaction : TTL 7 jours. L'exécutant mécanique réel de la
  // purge est CE sweep (le scribe n'a pas Bash, il ne supprime rien).
  const snapTtlMs = 7 * 24 * 60 * 60 * 1000;
  for (let i = 0; i < jEntries.length; i++) {
    const name = jEntries[i];
    if (!/^CONTEXT-PRE-COMPACT-.*\.md$/.test(name)) continue;
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (now - st.mtimeMs > snapTtlMs) fs.unlinkSync(full);
    } catch (e) {
      // rien
    }
  }
}

// ---------------------------------------------------------------------------
// Journal : enveloppe, append, rotation, gitignore vérifié
// ---------------------------------------------------------------------------

function writeEnvelope(state, file, ev) {
  state.seq = (typeof state.seq === "number" && isFinite(state.seq) ? state.seq : 0) + 1;
  const envelope = {
    v: 1,
    seq: state.seq,
    ts: new Date().toISOString(),
    sid: state.sid,
    cwd: state.projectDir,
    ev: ev,
  };
  fs.appendFileSync(file, JSON.stringify(envelope) + "\n", "utf8");
  saveSessionState(state);
}

// Rotation au cap 5 Mo : on garde les ~500 derniers Ko (depuis une frontière
// de ligne) et on journalise journal_capped (la FIN est préservée).
function rotateIfNeeded(state, file) {
  let st;
  try {
    st = fs.statSync(file);
  } catch (e) {
    return;
  }
  if (st.size <= JOURNAL_CAP_BYTES) return;
  try {
    const content = fs.readFileSync(file, "utf8");
    let start = content.length - JOURNAL_KEEP_BYTES;
    if (start < 0) start = 0;
    const nl = content.indexOf("\n", start);
    const tail = nl === -1 ? "" : content.slice(nl + 1);
    fs.writeFileSync(file, tail, "utf8");
    writeEnvelope(state, file, {
      type: "journal_capped",
      conserve_octets: Buffer.byteLength(tail, "utf8"),
    });
  } catch (e) {
    logErr("[session-scribe] rotation du journal impossible: " + (e && e.message));
  }
}

// La règle gitignore est GARANTIE, pas seulement présente : le CONTENU du
// fichier existant est vérifié ; la règle est ajoutée si absente. Retourne
// true seulement si la règle est effectivement en place.
function gitignoreHasCatchAll(content) {
  const lines = String(content).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "*") return true;
  }
  return false;
}

function ensureGitignoreRule(dir) {
  const gi = path.join(dir, ".gitignore");
  try {
    let content = null;
    try {
      content = fs.readFileSync(gi, "utf8");
    } catch (e) {
      content = null;
    }
    if (content !== null && gitignoreHasCatchAll(content)) return true;
    const prefix = content === null ? "" : content.replace(/\r?\n?$/, "\n");
    fs.writeFileSync(gi, prefix + "*\n!.gitignore\n", "utf8");
    return true;
  } catch (e) {
    logErr("[session-scribe] regle gitignore NON garantie : bascule en metadonnees seules");
    return false;
  }
}

// Crée le dossier .claude/scribe/ du projet et GARANTIT son gitignore.
// Retourne { dir, gitignoreOk } : si la règle n'est pas garantie, l'appelant
// ne doit écrire QUE des métadonnées.
function ensureScribeDir(projectDir) {
  const dir = scribeDir(projectDir);
  fs.mkdirSync(dir, { recursive: true });
  return { dir: dir, gitignoreOk: ensureGitignoreRule(dir) };
}

// Champs de contenu libre du journal : neutralisés en {sha8, len} quand le
// gitignore n'est pas garanti.
const CONTENT_FIELDS = ["prompt_excerpt", "last_msg_excerpt"];

function stripContentFields(ev) {
  const out = {};
  for (const k in ev) {
    if (!Object.prototype.hasOwnProperty.call(ev, k)) continue;
    if (CONTENT_FIELDS.indexOf(k) !== -1 && typeof ev[k] === "string") {
      out[k] = { sha8: sha8(ev[k]), len: ev[k].length };
    } else {
      out[k] = ev[k];
    }
  }
  return out;
}

// Ajoute un événement au journal de la session. Retourne true si écrit.
function appendEvent(state, ev) {
  try {
    const ensured = ensureScribeDir(state.projectDir);
    const payload = ensured.gitignoreOk ? ev : stripContentFields(ev);
    const file = journalPath(state);
    rotateIfNeeded(state, file);
    writeEnvelope(state, file, payload);
    return true;
  } catch (e) {
    logErr("[session-scribe] append journal impossible: " + (e && e.message));
    return false;
  }
}

// Retourne les N dernières lignes du journal (pour le snapshot pré-compact).
function lastJournalLines(state, n) {
  const raw = readFileSwallow(journalPath(state));
  if (raw === null) return null;
  const lines = raw.split(/\r?\n/).filter(function (l) {
    return l.trim() !== "";
  });
  return lines.slice(-n);
}

// ---------------------------------------------------------------------------
// Transcript : lecture tail par blocs remontants NON chevauchants
// ---------------------------------------------------------------------------

// Lit les dernières lignes COMPLÈTES du transcript (un seul bloc de
// maxBytes). Retourne un tableau de lignes ou null si lecture impossible.
function tailLines(transcriptPath, maxBytes) {
  if (!transcriptPath) return null;
  let fd;
  try {
    fd = fs.openSync(transcriptPath, "r");
  } catch (e) {
    return null;
  }
  try {
    const size = fs.fstatSync(fd).size;
    if (size === 0) return [];
    const block = typeof maxBytes === "number" && maxBytes > 0 ? maxBytes : TAIL_BLOCK_BYTES;
    const start = Math.max(0, size - block);
    const len = size - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    let text = buf.toString("utf8");
    if (start > 0) {
      const nl = text.indexOf("\n");
      text = nl === -1 ? "" : text.slice(nl + 1);
    }
    return text.split(/\r?\n/);
  } catch (e) {
    return null;
  } finally {
    try {
      fs.closeSync(fd);
    } catch (e) {
      // rien
    }
  }
}

function usageFromLine(line) {
  if (!line) return null;
  let rec;
  try {
    rec = JSON.parse(line);
  } catch (e) {
    return null;
  }
  if (rec && rec.isSidechain === true) return null;
  const message = rec && rec.message ? rec.message : null;
  const usage = message && message.usage ? message.usage : null;
  if (!usage) return null;
  const total =
    (Number(usage.input_tokens) || 0) +
    (Number(usage.cache_read_input_tokens) || 0) +
    (Number(usage.cache_creation_input_tokens) || 0);
  if (total <= 0) return null;
  let model = "";
  if (message && typeof message.model === "string") model = message.model;
  else if (typeof rec.model === "string") model = rec.model;
  return { tokens: total, model: model };
}

// Dernier record usage du fil PRINCIPAL (jamais un sidechain), lu en tail par
// blocs remontants de 1 Mo, NON chevauchants, 8 Mo au total maximum (chaque
// octet est lu au plus une fois ; les frontières de ligne entre blocs sont
// recollées par un tampon d'octets, jamais de re-lecture).
// cache = dernier usage principal connu ({size, tokens, model}) : si le tail
// est SATURÉ de sidechains et que le fichier n'a pas rétréci sous la taille
// du cache, le dernier signal positif est réutilisé (found=true, fromCache).
// Retourne { ok, found, saturated, fromCache, tokens, model, fileSize } :
//   ok=false        -> lecture impossible (fail-open avant armement)
//   found=false     -> lu mais aucun usage principal trouvé (pas une preuve)
//   saturated=true  -> 8 Mo parcourus sans usage principal, fichier non épuisé
function readTranscriptTail(transcriptPath, cache) {
  const res = { ok: false, found: false, saturated: false, fromCache: false, tokens: 0, model: "", fileSize: 0 };
  if (!transcriptPath) return res;
  let fd;
  try {
    fd = fs.openSync(transcriptPath, "r");
  } catch (e) {
    return res;
  }
  try {
    const size = fs.fstatSync(fd).size;
    res.ok = true;
    res.fileSize = size;
    if (size === 0) return res;
    let pos = size;
    let scanned = 0;
    // carry = octets de tête d'une ligne dont le début est PLUS HAUT dans le
    // fichier (Buffer, jamais décodé seul : une coupure UTF-8 au milieu d'un
    // caractère est recollée avant toString).
    let carry = Buffer.alloc(0);
    while (pos > 0 && scanned < TAIL_BLOCK_MAX) {
      const start = Math.max(0, pos - TAIL_BLOCK_BYTES);
      const len = pos - start;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      scanned += len;
      const combined = carry.length ? Buffer.concat([buf, carry]) : buf;
      let parseFrom = 0;
      if (start > 0) {
        const nl = combined.indexOf(10);
        if (nl === -1) {
          carry = combined;
          pos = start;
          continue;
        }
        carry = combined.slice(0, nl);
        parseFrom = nl + 1;
      }
      const lines = combined.slice(parseFrom).toString("utf8").split(/\r?\n/);
      for (let i = lines.length - 1; i >= 0; i--) {
        const hit = usageFromLine(lines[i].trim());
        if (hit) {
          res.found = true;
          res.tokens = hit.tokens;
          res.model = hit.model;
          return res;
        }
      }
      pos = start;
    }
    if (pos > 0) {
      res.saturated = true;
      const c = validTailCache(cache);
      if (c && c.size <= size) {
        res.found = true;
        res.fromCache = true;
        res.tokens = c.tokens;
        res.model = c.model;
      }
    }
    return res;
  } catch (e) {
    res.ok = false;
    res.found = false;
    return res;
  } finally {
    try {
      fs.closeSync(fd);
    } catch (e) {
      // rien
    }
  }
}

// ---------------------------------------------------------------------------
// Détection de fenêtre (le deny ne s'arme jamais sur une fenêtre par défaut)
// ---------------------------------------------------------------------------

// Priorités : env SCRIBE_WINDOW_TOKENS > marqueur [1m] > famille prouvée >
// observé > 200k. Sinon DÉFAUT 200k avec defaulted=true : le deny ne s'arme
// jamais sur une fenêtre par défaut.
function resolveWindow(model, observedTokens) {
  const env = process.env.SCRIBE_WINDOW_TOKENS;
  if (env !== undefined && env !== null && env !== "") {
    const n = parseInt(env, 10);
    if (!isNaN(n) && n > 0) {
      return { windowTokens: n, defaulted: false, source: "env" };
    }
  }
  const id = (model || "").toLowerCase();
  if (id.indexOf("[1m]") !== -1) {
    return { windowTokens: WINDOW_1M, defaulted: false, source: "marqueur" };
  }
  // Table de familles : UNIQUEMENT les familles PROUVÉES par sonde sur le
  // compte d'origine (fable-5 et opus-4 observés à 1M en 2026-07). Vérifiez
  // sur VOTRE compte (la fenêtre dépend de l'offre) ; en cas de doute, fixez
  // SCRIBE_WINDOW_TOKENS. Toute famille NON listée reste "défaut 200k" : le
  // deny ne s'y arme jamais.
  if (id.indexOf("fable-5") !== -1 || id.indexOf("opus-4") !== -1) {
    return { windowTokens: WINDOW_1M, defaulted: false, source: "famille" };
  }
  if ((observedTokens || 0) > WINDOW_200K) {
    return { windowTokens: WINDOW_1M, defaulted: false, source: "observe" };
  }
  return { windowTokens: WINDOW_200K, defaulted: true, source: "defaut" };
}

function formatWindowLabel(windowTokens) {
  return windowTokens >= WINDOW_1M ? "1M" : Math.round(windowTokens / 1000) + "k";
}

// ---------------------------------------------------------------------------
// Divers
// ---------------------------------------------------------------------------

function isDisabled() {
  return process.env.SCRIBE_DISABLE === "1";
}

function fileMtimeMs(file) {
  try {
    const st = fs.statSync(file);
    if (st.size === 0) return null;
    return st.mtimeMs;
  } catch (e) {
    return null;
  }
}

// Stat sûre pour les baselines de levée : mtime + taille, ou null.
function fileStatSafe(file) {
  try {
    const st = fs.statSync(file);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch (e) {
    return null;
  }
}

module.exports = {
  REDACTION_PREFIXES: REDACTION_PREFIXES,
  EXCERPT_MAX: EXCERPT_MAX,
  WINDOW_1M: WINDOW_1M,
  WINDOW_200K: WINDOW_200K,
  JOURNAL_CAP_BYTES: JOURNAL_CAP_BYTES,
  TAIL_BLOCK_MAX: TAIL_BLOCK_MAX,
  logErr: logErr,
  writeStdout: writeStdout,
  readFileSwallow: readFileSwallow,
  writeFileAtomic: writeFileAtomic,
  readStdinJson: readStdinJson,
  redact: redact,
  truncateUnicodeSafe: truncateUnicodeSafe,
  sha8: sha8,
  sinkString: sinkString,
  makeExcerpt: makeExcerpt,
  resolveRootDir: resolveRootDir,
  sensitiveMarkers: sensitiveMarkers,
  scribeAgentName: scribeAgentName,
  canonPath: canonPath,
  canonPathDeep: canonPathDeep,
  normPath: normPath,
  isSensitiveProject: isSensitiveProject,
  sasDir: sasDir,
  scribeDir: scribeDir,
  journalPath: journalPath,
  sanitizeSessionId: sanitizeSessionId,
  sessionStateFile: sessionStateFile,
  guardStateFile: guardStateFile,
  dueFile: dueFile,
  loadSessionState: loadSessionState,
  saveSessionState: saveSessionState,
  sweepStaleState: sweepStaleState,
  ensureScribeDir: ensureScribeDir,
  ensureGitignoreRule: ensureGitignoreRule,
  stripContentFields: stripContentFields,
  appendEvent: appendEvent,
  lastJournalLines: lastJournalLines,
  tailLines: tailLines,
  readTranscriptTail: readTranscriptTail,
  resolveWindow: resolveWindow,
  formatWindowLabel: formatWindowLabel,
  isDisabled: isDisabled,
  fileMtimeMs: fileMtimeMs,
  fileStatSafe: fileStatSafe,
};
