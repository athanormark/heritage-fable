#!/usr/bin/env node
"use strict";

/*
 * suggest-compact.js
 *
 * PreToolUse hook (matcher Edit|Write). Purely advisory.
 * It NEVER blocks a tool call and NEVER auto-compacts: it only surfaces a
 * "/compact" suggestion through additionalContext when the live context size
 * (or the tool-call count) crosses a threshold.
 *
 * Two independent signals:
 *   PRIMARY   - real context size, read from the session transcript (the last
 *               assistant "usage" record). This is the strongest signal.
 *   SECONDARY - per-session tool-call counter (fallback when the transcript
 *               cannot be read).
 *
 * Self-contained: zero external dependency. All helpers are inlined.
 * Always exits 0. Any error is swallowed.
 *
 * Window detection: a "[1m]" marker in the model id means a 1M window;
 * otherwise, observing more than 200k tokens infers 1M; default is 200k.
 *
 * Defaults are calibrated for a 1M window (suggest near 65%, not 25%):
 *   threshold = 650000 tokens on 1M  (160000 on 200k)
 *   interval  = 100000 tokens on 1M  (60000 on 200k)
 * Everything is overridable by environment variable.
 * Set COMPACT_CONTEXT_THRESHOLD=0 to disable the context signal entirely.
 *
 * State (per session) lives in the OS temp dir:
 *   claude-tool-count-<sessionId>
 *   claude-context-bucket-<sessionId>
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

// ---------------------------------------------------------------------------
// Small, swallow-everything helpers
// ---------------------------------------------------------------------------

function getTempDir() {
  try {
    return os.tmpdir();
  } catch (e) {
    return ".";
  }
}

function writeFileSwallow(file, data) {
  try {
    fs.writeFileSync(file, data, "utf8");
  } catch (e) {
    // ignore: state is best-effort only
  }
}

function readFileSwallow(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    return null;
  }
}

function log(msg) {
  // stderr of a non-blocking PreToolUse hook does NOT reach the model;
  // it is only for local debugging.
  try {
    console.error(msg);
  } catch (e) {
    // ignore
  }
}

function output(obj) {
  // Single JSON object on stdout. This is the documented mechanism to inject
  // context from a PreToolUse hook without blocking the tool call.
  // We write synchronously to fd 1 so the bytes are flushed even when stdout
  // is a pipe and the process exits right after (console.log can be async on
  // a piped stdout and would be truncated).
  const line = JSON.stringify(obj) + "\n";
  try {
    fs.writeSync(1, line);
  } catch (e) {
    try {
      process.stdout.write(line);
    } catch (e2) {
      // ignore
    }
  }
}

// Read a JSON payload from stdin, with a hard timeout so the hook can never
// hang a tool call.
function readStdinJson(opts) {
  const timeoutMs = (opts && opts.timeoutMs) || 1000;
  return new Promise(function (resolve) {
    let raw = "";
    let done = false;

    function finish() {
      if (done) return;
      done = true;
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        resolve({});
      }
    }

    const timer = setTimeout(finish, timeoutMs);
    try {
      timer.unref && timer.unref();
    } catch (e) {
      // ignore
    }

    try {
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", function (chunk) {
        raw += chunk;
      });
      process.stdin.on("end", function () {
        clearTimeout(timer);
        finish();
      });
      process.stdin.on("error", function () {
        clearTimeout(timer);
        finish();
      });
    } catch (e) {
      clearTimeout(timer);
      finish();
    }
  });
}

// ---------------------------------------------------------------------------
// Context-window math
// ---------------------------------------------------------------------------

const WINDOW_1M = 1000000;
const WINDOW_200K = 200000;

// Defaults (1M is the large-window default for long-running worktrees).
const DEFAULT_THRESHOLD_1M = 650000;
const DEFAULT_THRESHOLD_200K = 160000;
const DEFAULT_INTERVAL_1M = 100000;
const DEFAULT_INTERVAL_200K = 60000;

// Tool-count fallback.
const DEFAULT_COMPACT_THRESHOLD = 50;
const TOOL_COUNT_REPEAT = 25;

// Housekeeping.
const COMPACT_STATE_TTL_DAYS = 14;

function clampCounter(n) {
  // Guard against corrupted state files.
  if (typeof n !== "number" || !isFinite(n)) return 1;
  if (n < 1) return 1;
  if (n > 1000000) return 1000000;
  return Math.floor(n);
}

function parseEnvInt(name) {
  const v = process.env[name];
  if (v === undefined || v === null || v === "") return null;
  const n = parseInt(v, 10);
  if (isNaN(n)) return null;
  return n;
}

function formatWindowLabel(windowTokens) {
  return windowTokens >= WINDOW_1M ? "1M" : "200k";
}

// Read the latest context size from the transcript JSONL file.
// Returns { tokens, model }. tokens is the sum of input + cache-read +
// cache-creation input tokens on the LAST assistant usage record.
function readLatestContextTokens(transcriptPath) {
  const result = { tokens: 0, model: "" };
  if (!transcriptPath) return result;

  let content;
  try {
    content = fs.readFileSync(transcriptPath, "utf8");
  } catch (e) {
    return result;
  }
  if (!content) return result;

  const lines = content.split(/\r?\n/);
  // Walk backwards: we want the most recent usage record.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (e) {
      continue;
    }

    // Skip sub-agent (sidechain) records: we want the main thread's context
    // size, not a sub-agent's, which would under-report the real window usage.
    if (rec && rec.isSidechain === true) continue;

    const message = rec && rec.message ? rec.message : null;
    const usage = message && message.usage ? message.usage : null;
    if (!usage) continue;

    const input = Number(usage.input_tokens) || 0;
    const cacheRead = Number(usage.cache_read_input_tokens) || 0;
    const cacheCreate = Number(usage.cache_creation_input_tokens) || 0;
    const total = input + cacheRead + cacheCreate;
    if (total <= 0) continue;

    result.tokens = total;
    if (message && typeof message.model === "string") {
      result.model = message.model;
    } else if (typeof rec.model === "string") {
      result.model = rec.model;
    }
    return result;
  }
  return result;
}

// Decide the context window from the model id and the observed token count.
function resolveContextWindowTokens(model, observedTokens) {
  const id = (model || "").toLowerCase();
  if (id.indexOf("[1m]") !== -1) return WINDOW_1M;
  // The 1M window is the standard here, but the session transcript records the
  // model id WITHOUT the [1m] marker (verified on a real transcript:
  // "claude-opus-4-8"), so detect the opus-4 family directly. Otherwise a 1M
  // session under 200k would be treated as a 200k window and fire a suggestion
  // far too early.
  if (id.indexOf("opus-4") !== -1) return WINDOW_1M;
  if ((observedTokens || 0) > WINDOW_200K) return WINDOW_1M;
  return WINDOW_200K;
}

// Threshold, scaled by window, overridable by env.
function resolveContextThreshold(windowTokens) {
  const fromEnv = parseEnvInt("COMPACT_CONTEXT_THRESHOLD");
  if (fromEnv !== null) return fromEnv; // 0 disables the context signal
  return windowTokens >= WINDOW_1M
    ? DEFAULT_THRESHOLD_1M
    : DEFAULT_THRESHOLD_200K;
}

// Re-suggestion interval, scaled by window, overridable by env.
function resolveContextInterval(windowTokens) {
  const fromEnv = parseEnvInt("COMPACT_CONTEXT_INTERVAL");
  if (fromEnv !== null && fromEnv > 0) return fromEnv;
  return windowTokens >= WINDOW_1M
    ? DEFAULT_INTERVAL_1M
    : DEFAULT_INTERVAL_200K;
}

// Bucket: -1 below threshold, else floor((tokens - threshold) / interval).
function computeContextBucket(tokens, threshold, interval) {
  if (threshold <= 0) return -1; // signal disabled
  if (tokens < threshold) return -1;
  if (interval <= 0) return 0;
  return Math.floor((tokens - threshold) / interval);
}

// ---------------------------------------------------------------------------
// Per-session state
// ---------------------------------------------------------------------------

function sanitizeSessionId(input) {
  let sid =
    (input && typeof input.session_id === "string" && input.session_id) ||
    process.env.CLAUDE_SESSION_ID ||
    "default";
  sid = String(sid).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!sid) sid = "default";
  return sid;
}

function toolCountFile(tempDir, sessionId) {
  return path.join(tempDir, "claude-tool-count-" + sessionId);
}

function contextBucketFile(tempDir, sessionId) {
  return path.join(tempDir, "claude-context-bucket-" + sessionId);
}

// Remove stale state files (older than TTL), preserving the active session.
function sweepStaleState(tempDir, activeSessionId) {
  let entries;
  try {
    entries = fs.readdirSync(tempDir);
  } catch (e) {
    return;
  }
  const ttlMs = COMPACT_STATE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (let i = 0; i < entries.length; i++) {
    const name = entries[i];
    if (
      name.indexOf("claude-tool-count-") !== 0 &&
      name.indexOf("claude-context-bucket-") !== 0
    ) {
      continue;
    }
    // Never sweep the active session's files.
    if (
      name === "claude-tool-count-" + activeSessionId ||
      name === "claude-context-bucket-" + activeSessionId
    ) {
      continue;
    }
    const full = path.join(tempDir, name);
    try {
      const st = fs.statSync(full);
      if (now - st.mtimeMs > ttlMs) {
        fs.unlinkSync(full);
      }
    } catch (e) {
      // ignore individual failures
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(input) {
  const messages = [];
  const tempDir = getTempDir();
  const sessionId = sanitizeSessionId(input);

  // Best-effort housekeeping; never fatal.
  try {
    sweepStaleState(tempDir, sessionId);
  } catch (e) {
    // ignore
  }

  // ---- PRIMARY signal: real context size from the transcript -------------
  try {
    const transcriptPath =
      (input && typeof input.transcript_path === "string"
        ? input.transcript_path
        : "") || "";
    const ctx = readLatestContextTokens(transcriptPath);
    const tokens = ctx.tokens || 0;

    if (tokens > 0) {
      const windowTokens = resolveContextWindowTokens(ctx.model, tokens);
      const threshold = resolveContextThreshold(windowTokens);
      const interval = resolveContextInterval(windowTokens);
      const bucket = computeContextBucket(tokens, threshold, interval);

      if (bucket >= 0) {
        const bucketPath = contextBucketFile(tempDir, sessionId);
        const prevRaw = readFileSwallow(bucketPath);
        let prevBucket = -1;
        if (prevRaw !== null) {
          const parsed = parseInt(prevRaw.trim(), 10);
          if (!isNaN(parsed)) prevBucket = parsed;
        }

        if (bucket > prevBucket) {
          writeFileSwallow(bucketPath, String(bucket));
          const label = formatWindowLabel(windowTokens);
          const pct = Math.round((tokens / windowTokens) * 100);
          const approxK = Math.round(tokens / 1000);
          messages.push(
            "[suggest-compact] Context is at roughly " +
              approxK +
              "k tokens (" +
              pct +
              "% of the " +
              label +
              " window). Consider running /compact at the next logical phase " +
              "boundary, after writing down any state you want to keep. This " +
              "is advisory only; it does not compact anything."
          );
        }
      } else {
        // Tokens fell below the threshold: a /compact likely happened, so
        // re-arm the signal by resetting the high-water-mark to -1. Otherwise,
        // within the same session id, the second climb would stay silent
        // (new bucket < old HWM).
        const bucketPath = contextBucketFile(tempDir, sessionId);
        const prevRaw = readFileSwallow(bucketPath);
        if (prevRaw !== null && prevRaw.trim() !== "-1") {
          writeFileSwallow(bucketPath, "-1");
        }
      }
    }
  } catch (e) {
    // swallow: primary signal is best-effort
  }

  // ---- SECONDARY signal: per-session tool-call counter -------------------
  try {
    const countPath = toolCountFile(tempDir, sessionId);
    const prevRaw = readFileSwallow(countPath);
    let count = 0;
    if (prevRaw !== null) {
      const parsed = parseInt(prevRaw.trim(), 10);
      if (!isNaN(parsed)) count = clampCounter(parsed);
    }
    count = clampCounter(count + 1);
    writeFileSwallow(countPath, String(count));

    let threshold = parseEnvInt("COMPACT_THRESHOLD");
    if (threshold === null || threshold <= 0) {
      threshold = DEFAULT_COMPACT_THRESHOLD;
    }

    let shouldRemind = false;
    if (count === threshold) {
      shouldRemind = true;
    } else if (count > threshold) {
      shouldRemind = (count - threshold) % TOOL_COUNT_REPEAT === 0;
    }

    if (shouldRemind) {
      messages.push(
        "[suggest-compact] " +
          count +
          " tool calls in this session. If you have just crossed a phase " +
          "boundary (planning done, debugging done), consider /compact to keep " +
          "the working context lean. Advisory only."
      );
    }
  } catch (e) {
    // swallow: secondary signal is best-effort
  }

  // ---- Emit a single advisory JSON if we have anything to say ------------
  if (messages.length > 0) {
    output({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: messages.join("\n"),
      },
    });
  }
}

// Entry point: read stdin, run main, always exit 0.
// We set process.exitCode = 0 and let the process drain naturally instead of
// calling process.exit(0): on some platforms a piped stdout write is async and
// process.exit() would truncate the JSON before it is flushed.
(function run() {
  process.exitCode = 0;
  readStdinJson({ timeoutMs: 1000 })
    .then(function (input) {
      try {
        main(input || {});
      } catch (e) {
        log("[suggest-compact] non-fatal: " + (e && e.message));
      }
    })
    .catch(function () {
      // ignore
    });
})();
