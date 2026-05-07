// scripts/lib/adr-chain.mjs — dedup-aware ADR ↔ standards/stacks integration.
//
// Used by:
//   - skills/adr-builder/SKILL.md Step 5d (post-CREATE chain offer)
//   - scripts/adr-audit.mjs Check #13 (standards-coverage warning)
//
// Pure node:* — uses scripts/lib/{standards-loader,manifest-stacks}.mjs.
//
// Design (per user pushback on naive "offer to create"):
//   - Standards: 3 outcomes — link existing | create new | pick from candidates
//   - Stacks:    3 outcomes — link existing | refresh different version | scrape new
//   - AUDIT:     warning when ADR has Guardrails but no standard back-references it

import { loadStandards } from "./standards-loader.mjs";
import { loadManifest } from "./manifest-stacks.mjs";

const STOPWORDS = new Set([
  "de","do","da","para","em","no","na","com","por","sem","sob","sobre",
  "the","a","an","and","or","with","from","to","of","is","are","be",
  "adr","standard","standards","stack","stacks","rule","rules"
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9À-ſ]+/g, " ")   // also splits on hyphens (so "error-handling" → "error","handling")
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Stack glob hints — used to detect overlap between adr.stack and std.applyTo
const STACK_GLOBS = {
  python:     ["**/*.py", "**/pyproject.toml"],
  typescript: ["**/*.ts", "**/*.tsx", "src/**/*.ts"],
  javascript: ["**/*.js", "**/*.mjs"],
  go:         ["**/*.go"],
  rust:       ["**/*.rs"],
  universal:  [],
};

function stackBoost(adrStack, applyTo) {
  if (!adrStack || adrStack === "universal") return 0;
  const expected = STACK_GLOBS[adrStack.toLowerCase()] || [];
  if (expected.length === 0) return 0;
  const applyToArr = Array.isArray(applyTo) ? applyTo : [];
  // Boost if there's any shared substring between expected globs and applyTo
  for (const exp of expected) {
    for (const have of applyToArr) {
      if (exp === have) return 0.20;
      // Partial: same extension
      const expExt = exp.match(/\.(\w+)$/);
      const haveExt = have.match(/\.(\w+)$/);
      if (expExt && haveExt && expExt[1] === haveExt[1]) return 0.10;
    }
  }
  return 0;
}

// Extract ADR slug ("error-handling-strategy") from an ADR object.
function adrIdentity(adr) {
  // adr.name from frontmatter is the canonical slug
  return String(adr.name || adr.id || "");
}

function standardLinksAdr(std, adrSlug) {
  const refs = std.relatedAdrs || [];
  if (!Array.isArray(refs)) return false;
  return refs.some(r => {
    const s = String(r);
    if (s === adrSlug) return true;
    if (s.endsWith(`-${adrSlug}`)) return true;
    // Common patterns: "ADR-002", "ADR-002-foo", "002-foo", "002"
    const adrNumMatch = s.match(/(\d{3})/);
    return false;  // strict: only literal slug match avoids false positives
  });
}

// ─── Public: standards lookup ──────────────────────────────────────────────

export function findRelatedStandards(adr, projectRoot, opts = {}) {
  const threshold = opts.threshold ?? 0.20;
  const topN = opts.topN ?? 3;
  const standards = loadStandards(projectRoot);
  if (standards.length === 0) return { matches: [], wouldCreate: deriveStdId(adr) };

  const adrSlug = adrIdentity(adr);
  const adrTokens = [
    ...tokenize(adrSlug),
    ...tokenize(adr.description),
    ...tokenize(adr.guardrailsText),
  ];

  const scored = standards.map(std => {
    const stdTokens = [
      ...tokenize(std.id),
      ...tokenize(std.description),
    ];
    let score = jaccard(adrTokens, stdTokens);
    score += stackBoost(adr.stack, std.applyTo);
    if (score > 1) score = 1;

    const alreadyLinked = standardLinksAdr(std, adrSlug);
    return {
      id: std.id,
      score: Math.round(score * 100) / 100,
      applyTo: std.applyTo || [],
      alreadyLinked,
    };
  });

  const filtered = scored
    .filter(x => !x.alreadyLinked && x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return {
    matches: filtered,
    wouldCreate: filtered.length === 0 ? deriveStdId(adr) : null,
  };
}

function deriveStdId(adr) {
  const slug = adrIdentity(adr) || "from-adr";
  // Drop common ADR slug prefixes/suffixes like "adopt-", "-strategy"
  const cleaned = slug
    .replace(/^(adopt|use|migrate|introduce)-/i, "")
    .replace(/-strategy$|-policy$/i, "");
  return `std-${cleaned}`;
}

// Lookup direction inverse: which existing standards already link this ADR?
// Used by adr-audit Check #13.
export function findStandardsLinkingAdr(adrSlug, projectRoot) {
  const standards = loadStandards(projectRoot);
  return standards.filter(std => standardLinksAdr(std, adrSlug));
}

// ─── Public: stacks lookup ─────────────────────────────────────────────────

// Match: optional @scope, lib name, @, semver. Lookbehind for separator
// (so consecutive matches don't consume their preceding space). \b doesn't
// fire before '@' since '@' is non-word.
const PKG_VERSION_RE = /(?<=^|[\s(`"',])(@?[a-z][a-z0-9._-]*(?:\/[a-z0-9._-]+)?)@(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)\b/g;
const SAFE_LIB_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

export function extractStackMentions(adr) {
  if (adr.category !== "arquitetura") return [];
  const text = `${adr.description || ""}\n${adr.body || ""}`;
  const seen = new Set();
  const out = [];
  let m;
  PKG_VERSION_RE.lastIndex = 0;
  while ((m = PKG_VERSION_RE.exec(text)) !== null) {
    const lib = m[1].toLowerCase();
    const version = m[2];
    if (!SAFE_LIB_RE.test(lib) || lib.includes("..")) continue;
    const key = `${lib}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ lib, version });
  }
  return out;
}

export function findStackMatches(mentions, projectRoot) {
  const manifest = loadManifest(projectRoot);
  const fws = manifest.frameworks || {};
  return mentions.map(m => {
    const fw = fws[m.lib];
    if (!fw) {
      return { lib: m.lib, version: m.version, status: "new" };
    }
    if (fw.skipDocs) {
      return { lib: m.lib, version: m.version, status: "skipped",
               reason: "framework declared skipDocs:true" };
    }
    if (fw.version === m.version) {
      return { lib: m.lib, version: m.version, status: "linked",
               existingRef: fw.artisanalRef };
    }
    return { lib: m.lib, version: m.version, status: "drift",
             currentVersion: fw.version, currentRef: fw.artisanalRef };
  });
}

// ─── Helper for adr-audit Check #13 ────────────────────────────────────────

export function adrHasGuardrails(body) {
  if (typeof body !== "string") return false;
  return /^##\s+Guardrails\b/m.test(body);
}
