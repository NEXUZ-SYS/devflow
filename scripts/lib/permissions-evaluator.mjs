// scripts/lib/permissions-evaluator.mjs — vendor-neutral deny-first permissions.
//
// Spec: devflow-permissions/v0
// Order: deny → allow → mode → callback
//
// Used by:
//   - hooks/pre-tool-use (Task 3.2) — runs evaluatePermissions before any
//     other gate; deny wins immediately
//   - scripts/devflow-context.mjs verify (Task X.5.d, future)
//
// Pure node:* — uses scripts/lib/{glob,frontmatter,url-validator}.mjs.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { matchGlob, validateSubset } from "./glob.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";
import { validateUrl } from "./url-validator.mjs";

// ─── Loading ───────────────────────────────────────────────────────────────

const EMPTY_CONFIG = Object.freeze({
  spec: "devflow-permissions/v0",
  evaluationOrder: ["deny", "allow", "mode", "callback"],
  deny: { fs: [], exec: [], net: [] },
  allow: { fs: { read: [], write: [] }, exec: [], tool: [] },
  mode: "prompt",
  callback: { url: null },
});

export function loadPermissions(projectRoot) {
  const path = join(projectRoot, ".context", "permissions.yaml");
  if (!existsSync(path)) return { ...EMPTY_CONFIG };
  let parsed;
  try {
    const wrapped = `---\n${readFileSync(path, "utf-8")}\n---\n`;
    parsed = parseFrontmatter(wrapped).data || {};
  } catch (err) {
    console.error(`[permissions-evaluator] parse error: ${err.message}`);
    // Fail-closed (M1 fix from Semana 3 audit): force mode:deny on parse failure
    return { ...EMPTY_CONFIG, mode: "deny" };
  }
  const cfg = {
    spec: parsed.spec || EMPTY_CONFIG.spec,
    evaluationOrder: parsed.evaluationOrder || EMPTY_CONFIG.evaluationOrder,
    deny: parsed.deny || EMPTY_CONFIG.deny,
    allow: parsed.allow || EMPTY_CONFIG.allow,
    mode: parsed.mode || EMPTY_CONFIG.mode,
    callback: parsed.callback || EMPTY_CONFIG.callback,
    claudeCodeCompat: parsed.claudeCodeCompat || {},
  };
  // M1 fix: validate schema at load time. If schema errors found (e.g., a
  // glob with extglob/negação would silently fail-open at match time),
  // log loudly AND force mode:deny. Operator must fix permissions.yaml.
  const errors = validatePermissionsSchema(cfg);
  if (errors.length > 0) {
    console.error(`[permissions-evaluator] schema errors — falling back to mode:deny (fail-closed):`);
    for (const e of errors) console.error(`  - ${e}`);
    return { ...cfg, mode: "deny" };
  }
  return cfg;
}

// ─── Schema validation (SI-3 + SI-5) ───────────────────────────────────────

function validateGlobs(patterns, label, errors) {
  if (!Array.isArray(patterns)) return;
  for (const p of patterns) {
    if (typeof p !== "string") continue;
    try {
      validateSubset(p);
    } catch (err) {
      errors.push(`${label}: glob '${p}' rejected (SI-5) — ${err.message}`);
    }
  }
}

export function validatePermissionsSchema(cfg) {
  const errors = [];

  if (cfg.spec && cfg.spec !== "devflow-permissions/v0") {
    errors.push(`spec must be 'devflow-permissions/v0', got '${cfg.spec}'`);
  }

  // SI-5: validate every glob in deny + allow.fs
  if (cfg.deny) {
    validateGlobs(cfg.deny.fs, "deny.fs", errors);
    validateGlobs(cfg.deny.exec, "deny.exec", errors);
    validateGlobs(cfg.deny.net, "deny.net", errors);
  }
  if (cfg.allow) {
    if (cfg.allow.fs) {
      validateGlobs(cfg.allow.fs.read, "allow.fs.read", errors);
      validateGlobs(cfg.allow.fs.write, "allow.fs.write", errors);
    }
    validateGlobs(cfg.allow.exec, "allow.exec", errors);
    validateGlobs(cfg.allow.tool, "allow.tool", errors);
  }

  // mode
  if (cfg.mode && !["prompt", "accept", "deny"].includes(cfg.mode)) {
    errors.push(`mode must be 'prompt' | 'accept' | 'deny', got '${cfg.mode}'`);
  }

  // SI-3: callback URL must pass validateUrl. Sync regex covers the same
  // denylist as scripts/lib/url-validator.mjs (defense-in-depth — runtime
  // hooks should re-call validateUrl async before any actual HTTP).
  // H2 fix from Semana 3 audit: add link-local IPv4/IPv6, ULA, instance-data,
  // trailing-dot bypass.
  if (cfg.callback?.url) {
    if (!cfg.callback.url.startsWith("https://")) {
      errors.push(`callback URL must use https:// scheme: '${cfg.callback.url}'`);
    } else {
      const badPatterns = [
        /^https?:\/\/169\.254\./,                     // 169.254.0.0/16 link-local + metadata
        /^https?:\/\/\[fd00:ec2::254\]/,              // exact AWS IPv6 metadata
        /^https?:\/\/metadata\./,                      // metadata.google.internal etc.
        /^https?:\/\/instance-data\.ec2\.internal/,    // AWS instance-data
        /^https?:\/\/(10|127|0)\./,                    // RFC1918 10/8 + loopback + 0/8
        /^https?:\/\/192\.168\./,                      // RFC1918 192.168/16
        /^https?:\/\/172\.(1[6-9]|2[0-9]|3[01])\./,    // RFC1918 172.16-31/12
        /^https?:\/\/\[(::1|fe[89ab]|fc|fd)/i,         // IPv6 loopback, link-local, ULA
        /^https?:\/\/[^/]+\./i,                        // any host with trailing-dot bypass — checked below
      ];
      // Trailing-dot detection: parse hostname and reject if it ends in '.'
      try {
        const u = new URL(cfg.callback.url);
        if (u.hostname.endsWith(".")) {
          errors.push(`callback URL '${cfg.callback.url}' rejected (SI-3 trailing-dot hostname bypass)`);
        }
      } catch { /* malformed — handled below */ }
      // Drop the trailing-dot generic pattern; we used the URL parser above
      const enforced = badPatterns.slice(0, -1);
      for (const re of enforced) {
        if (re.test(cfg.callback.url)) {
          errors.push(`callback URL '${cfg.callback.url}' rejected (SI-3 cloud metadata, RFC1918, or link-local)`);
          break;
        }
      }
    }
  }

  return errors;
}

// ─── Evaluation engine ─────────────────────────────────────────────────────

function safeMatchGlob(pattern, target) {
  try {
    return matchGlob(pattern, target);
  } catch {
    return false;
  }
}

function matchAny(patterns, target) {
  if (!Array.isArray(patterns) || target == null) return false;
  return patterns.some(p => safeMatchGlob(p, target));
}

// H1 fix from Semana 3 audit: extract URLs/hostnames from a Bash command so
// deny.net (cloud metadata, link-local) is enforceable at runtime.
function extractNetTargets(command) {
  if (!command || typeof command !== "string") return [];
  const targets = [];
  // Match http(s)://host/path patterns (covers curl/wget/fetch invocations)
  const urlRegex = /https?:\/\/([^\s'"`/]+)([^\s'"`]*)?/gi;
  let m;
  while ((m = urlRegex.exec(command)) !== null) {
    targets.push(`${m[1]}${m[2] || ""}`);
    targets.push(m[1]);  // bare hostname for direct hostname matches
  }
  return targets;
}

export async function evaluatePermissions(event, cfg) {
  const tool = event.tool;
  const path = event.path;
  const command = event.command;
  const url = event.url;  // future events (WebFetch etc.) may pass URL directly

  // ─── 1. DENY (hard) ──────────────────────────────────────────────────────
  if (cfg.deny) {
    if (path && matchAny(cfg.deny.fs, path)) {
      return { decision: "deny", reason: `deny.fs matches '${path}'` };
    }
    if (command && matchAny(cfg.deny.exec, command)) {
      return { decision: "deny", reason: `deny.exec matches '${command}'` };
    }
    // H1 fix: deny.net evaluated against URL (direct event field) AND
    // against URLs/hostnames extracted from Bash commands.
    let netTargets = [];
    if (url) {
      netTargets.push(url);
      try {
        const u = new URL(url);
        netTargets.push(u.hostname);
        netTargets.push(`${u.hostname}${u.pathname}`);
      } catch { /* malformed URL — keep original target */ }
    } else {
      netTargets = extractNetTargets(command);
    }
    for (const target of netTargets) {
      if (matchAny(cfg.deny.net, target)) {
        return { decision: "deny", reason: `deny.net matches '${target}'` };
      }
    }
  }

  // ─── 2. ALLOW (explicit) ─────────────────────────────────────────────────
  if (cfg.allow) {
    if (tool && matchAny(cfg.allow.tool, tool)) {
      return { decision: "allow", reason: `allow.tool matches '${tool}'` };
    }
    if (command && matchAny(cfg.allow.exec, command)) {
      return { decision: "allow", reason: `allow.exec matches '${command}'` };
    }
    if (path && cfg.allow.fs) {
      // Tool name distinguishes read vs write semantics
      const isRead = tool === "Read" || tool === "Glob" || tool === "Grep";
      const isWrite = tool === "Edit" || tool === "Write" || tool === "NotebookEdit";
      if (isRead && matchAny(cfg.allow.fs.read, path)) {
        return { decision: "allow", reason: `allow.fs.read matches '${path}'` };
      }
      if (isWrite && matchAny(cfg.allow.fs.write, path)) {
        return { decision: "allow", reason: `allow.fs.write matches '${path}'` };
      }
    }
  }

  // ─── 3. MODE (default) ───────────────────────────────────────────────────
  const mode = cfg.mode || "prompt";
  if (mode === "accept") return { decision: "allow", reason: "mode: accept" };
  if (mode === "deny")   return { decision: "deny", reason: "mode: deny" };
  // mode === "prompt"
  return { decision: "prompt", reason: "mode: prompt (no rule matched)" };

  // (callback layer would go here as a 4th step — async call to cfg.callback.url
  //  with the event payload, expecting a {decision} response. Not implemented
  //  in v1.0; the schema validation rejects unsafe URLs already.)
}
