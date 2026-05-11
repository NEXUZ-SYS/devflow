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

// Overlap coefficient: |A ∩ B| / min(|A|, |B|).
// Better than Jaccard when comparing a small "category" (std with ~5 tokens)
// to a large "instance" (ADR with ~50 tokens including verbose guardrails) —
// avoids the asymmetric-size penalty that Jaccard suffers from.
function tokenOverlap(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.min(a.size, b.size);
}

// Normalize a stack name for comparison: lowercase + strip non-alphanumeric.
// Examples: "TypeScript" → "typescript", "Next.js" → "nextjs", "Zod" → "zod".
function normalizeStackName(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Stripped from std.id when comparing to adr.stack — common camada suffixes.
const STD_LAYER_SUFFIX_RE = /-(frontend|bff|backend|data-infra|web|api|server|client|cli)$/;

// Strong boost when adr.stack matches std.id core (after stripping `std-` prefix
// and common camada suffixes). Captures cases where token overlap is low but
// the underlying stack is the same lib (e.g., Zod across multiple camadas).
function stackIdBoost(adrStack, stdId) {
  const adrCore = normalizeStackName(adrStack);
  const stdCore = normalizeStackName(
    String(stdId || "").replace(/^std-/, "").replace(STD_LAYER_SUFFIX_RE, "")
  );
  if (!adrCore || !stdCore || adrCore.length < 2 || stdCore.length < 2) return 0;
  if (adrCore === stdCore) return 0.50;
  // Partial: e.g., "nextjs" / "next", "typescript" / "ts" (both >= 3 chars)
  if (adrCore.length >= 3 && stdCore.length >= 3 &&
      (adrCore.includes(stdCore) || stdCore.includes(adrCore))) return 0.30;
  return 0;
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
  const strongOverlap = opts.strongOverlap ?? 0.50;
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
    // Composite scoring (v1.2):
    //   - overlap     (overlap coefficient): handles asymmetric sizes
    //     (small std + large ADR) better than Jaccard
    //   - idBoost     (stackIdBoost): strong signal when adr.stack matches
    //     std.id core (e.g., adr.stack="Zod" matches std-zod across camadas)
    //   - applyBoost  (stackBoost): applyTo glob extension overlap (legacy)
    //
    // Composite score is informational; LINK eligibility is gated separately
    // by (overlap >= strongOverlap) OR (idBoost > 0). See filter below.
    const overlap = tokenOverlap(adrTokens, stdTokens);
    const idBoost = stackIdBoost(adr.stack, std.id);
    const applyBoost = stackBoost(adr.stack, std.applyTo);
    let score = overlap + idBoost + applyBoost;
    if (score > 1) score = 1;

    const alreadyLinked = standardLinksAdr(std, adrSlug);
    return {
      id: std.id,
      score: Math.round(score * 100) / 100,
      tokenOverlap: Math.round(overlap * 100) / 100,
      stackIdBoost: Math.round(idBoost * 100) / 100,
      stackBoost: Math.round(applyBoost * 100) / 100,
      applyTo: std.applyTo || [],
      alreadyLinked,
    };
  });

  // v1.2 dedup-stricter LINK gate: low textual overlap alone (0.20-0.49) is
  // too weak — it admits cross-domain false positives via shared camada words
  // ("frontend"/"backend"/"bff"). Require either:
  //   • tokenOverlap >= strongOverlap (pure textual signal), OR
  //   • some textual overlap (>= threshold) AND a stack-identity confirmation
  //     (stackIdBoost: same lib name across camadas, or
  //      stackBoost:   same applyTo extension/glob)
  // The composite `score` threshold remains as a floor; the OR-gate above
  // does the actual discrimination.
  const filtered = scored
    .filter(x => {
      if (x.alreadyLinked) return false;
      if (x.score < threshold) return false;
      if (x.tokenOverlap >= strongOverlap) return true;
      if (x.tokenOverlap >= threshold && (x.stackIdBoost > 0 || x.stackBoost > 0)) return true;
      return false;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return {
    matches: filtered,
    wouldCreate: filtered.length === 0 ? deriveStdId(adr) : null,
  };
}

function deriveStdId(adr) {
  const slug = adrIdentity(adr) || "from-adr";
  // Drop common ADR slug prefixes/suffixes:
  // - "adr-" (universal in nxz.one and other orgs that prefix slugs)
  // - "adopt-", "use-", "migrate-", "introduce-" (intent-flavor prefixes)
  // - "-strategy", "-policy" (boilerplate suffixes)
  // - "-frontend|bff|backend|data-infra|web|api|server|client|cli" (camada
  //   suffix — convention is one std per lib with applyTo widening across
  //   camadas; stripping here lets ADR-N+1 in another camada dedup to the
  //   same std-X created by the first ADR)
  const cleaned = slug
    .replace(/^adr-/i, "")
    .replace(/^(adopt|use|migrate|introduce)-/i, "")
    .replace(/-strategy$|-policy$/i, "")
    .replace(STD_LAYER_SUFFIX_RE, "");
  return `std-${cleaned}`;
}

// Lookup direction inverse: which existing standards already link this ADR?
// Used by adr-audit Check #13.
export function findStandardsLinkingAdr(adrSlug, projectRoot) {
  const standards = loadStandards(projectRoot);
  return standards.filter(std => standardLinksAdr(std, adrSlug));
}

// ─── Public: stacks lookup ─────────────────────────────────────────────────

// Match: optional @scope, lib name, @, version (tolerant — accepts x.y.z,
// x.y.x, x.y, x bare; pre-release suffix optional). Lookbehind for separator
// so consecutive matches don't consume their preceding space.
//
// Tolerant version segment: accepts digits OR 'x'/'X' (semver wildcard).
// Up to 2 dot-separated segments after major (so `5.9.x`, `5.9.0`, `16.2`,
// `16` all match). Pre-release suffix optional.
const PKG_VERSION_RE = /(?<=^|[\s(`"',])(@?[a-z][a-z0-9._-]*(?:\/[a-z0-9._-]+)?)@(\d+(?:\.(?:\d+|[xX])){0,2}(?:-[a-zA-Z0-9.-]+)?)\b/g;
const SAFE_LIB_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

// Normalize a captured version: replace x/X with 0, pad to x.y.z.
// Examples: "5.9.x" → "5.9.0", "16" → "16.0.0", "5.9.0-alpha" → "5.9.0-alpha".
function normalizeVersion(v) {
  if (!v) return "";
  const m = v.match(/^(\d+(?:\.[\dxX]+)*)(.*)$/);
  if (!m) return v;
  const core = m[1];
  const suffix = m[2] || "";
  const parts = core.split(".").map(p => /^[xX]$/.test(p) ? "0" : p);
  while (parts.length < 3) parts.push("0");
  return parts.slice(0, 3).join(".") + suffix;
}

// Tier-2 prose regex: captures `<DisplayName> <X.Y[.Z[-suffix]]>`. Requires
// at least 2 dotted segments after major (so "Section 1" / "Phase 2" don't
// match — only X.Y minimum). Display name is captured loosely; manifest
// match is the discriminator that prevents false positives like "Process 1.2".
const PROSE_VERSION_RE = /(?<=^|[\s(`"',])([A-Za-z][A-Za-z0-9.+-]{1,30})\s+(\d+\.[\dxX]+(?:\.[\dxX]+)?(?:-[a-zA-Z0-9.-]+)?)(?=[\s.,;:)`"']|$)/g;

// Tier-0 frontmatter regex: more permissive than tier-2 since we trust the
// `stack` field as a structured declaration. Accepts bare major (e.g. "Tauri 2"),
// X.Y (e.g. "FastAPI 0.135"), full X.Y.Z, with optional 'x' wildcard, and
// optional trailing '+' suffix (e.g. "Ruff 0.7+" — ADR convention for
// "0.7 or later"; we strip the + and treat as the floor version).
const FM_STACK_RE = /^([A-Za-z][A-Za-z0-9.+-]{1,30})\s+(\d+(?:\.[\dxX]+){0,2}(?:-[a-zA-Z0-9.-]+)?)\+?\s*$/;

/**
 * Parse an ADR's `stack` frontmatter value into {lib, version}.
 *
 * Tolerates: parens-suffixed names (`Firestore (Web SDK) 12.0.x` → firestore@12.0.0),
 * trailing '+' on version (`Ruff 0.7+` → ruff@0.7.0), `.js` marketing suffix
 * (`Next.js 16.2.x` → next@16.2.0). Returns null for unversioned strings
 * (services/platforms like "GitHub Actions", "Datadog LLM Observability") —
 * those have no scrape-target semantic and shouldn't be auto-extracted.
 *
 * EXPORTED for CLI use: `adr-extract-stacks` calls this to determine WHY a
 * stack field couldn't be parsed and emit an actionable warning to stderr.
 *
 * Examples:
 *   "TypeScript 5.9.x"          → {lib: "typescript", version: "5.9.0"}
 *   "Next.js 16.2.x"            → {lib: "next", version: "16.2.0"}
 *   "FastAPI 0.135"             → {lib: "fastapi", version: "0.135.0"}
 *   "Tauri 2"                   → {lib: "tauri", version: "2.0.0"}
 *   "Ruff 0.7+"                 → {lib: "ruff", version: "0.7.0"}
 *   "Firestore (Web SDK) 12.0"  → {lib: "firestore", version: "12.0.0"}
 *   "Anthropic Claude API"      → null (no version)
 *   "universal"                 → null (placeholder)
 *   "Datadog LLM Observability" → null (no version — service, not package)
 */
export function parseStackFrontmatter(stackString) {
  if (!stackString || typeof stackString !== "string") return null;
  // Strip parens-and-content (`(Web SDK)`, `(Anthropic)`, `(Beta)`) — these
  // are clarification tags on the lib name, not part of the package id.
  const stripped = stackString.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  const m = stripped.match(FM_STACK_RE);
  if (!m) return null;
  const displayName = m[1];
  const version = normalizeVersion(m[2]);
  if (version === "0.0.0") return null;
  // Normalize lib name: lowercase, strip non-alphanumeric, drop common
  // marketing suffixes ("js" in "Next.js" → keep core "next" — pattern of
  // STACK_GLOBS table aliases). For unknown libs, use full normalized name.
  const norm = displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Heuristic: strip trailing "js" if present and the prefix is itself ≥ 3
  // alphanumeric chars (avoids truncating "rxjs" → "rx"). E.g. "next.js"
  // → norm "nextjs" → strip → "next". "react" → no change. "vite" → no change.
  let lib = norm;
  if (norm.endsWith("js") && norm.length >= 5 && /[a-z]/.test(norm[norm.length - 3])) {
    lib = norm.slice(0, -2);
  }
  if (!lib || lib.length < 2) return null;
  return { lib, version };
}

export function extractStackMentions(adr, opts = {}) {
  // Tier-0 (frontmatter): adr.stack is the structured declaration —
  // unambiguous regardless of manifest state. Bootstraps tier-2 prose
  // detection (see addFrameworksToManifest workflow).
  // Tier-1 (strict): <lib>@<version> form — works for any lib, no manifest
  // required. Catches new libs being introduced.
  // Tier-2 (prose, opt-in via opts.projectRoot): "<DisplayName> <version>"
  // matched only against libs already declared in manifest.yaml. Manifest
  // is the source of truth — prevents "Section 1.2" false positives without
  // requiring a hardcoded allowlist that would rot.
  const text = `${adr.description || ""}\n${adr.body || ""}`;
  const seen = new Set();
  const out = [];

  // ─── Tier 0: frontmatter stack field ────────────────────────────────────
  if (adr.stack && typeof adr.stack === "string") {
    const stackParse = parseStackFrontmatter(adr.stack);
    if (stackParse) {
      const key = `${stackParse.lib}@${stackParse.version}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(stackParse);
      }
    }
  }

  // ─── Tier 1: strict <lib>@<version> ─────────────────────────────────────
  let m;
  PKG_VERSION_RE.lastIndex = 0;
  while ((m = PKG_VERSION_RE.exec(text)) !== null) {
    const lib = m[1].toLowerCase();
    const rawVersion = m[2];
    const version = normalizeVersion(rawVersion);
    if (!SAFE_LIB_RE.test(lib) || lib.includes("..")) continue;
    if (version === "0.0.0") continue;
    const key = `${lib}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ lib, version });
  }

  // ─── Tier 2: prose form, manifest-gated ─────────────────────────────────
  if (opts.projectRoot) {
    const manifest = loadManifest(opts.projectRoot);
    const fws = manifest.frameworks || {};
    if (Object.keys(fws).length > 0) {
      // Build alias map: every manifest key + its display aliases → manifest key.
      // Aliases are derived by stripping non-alphanumeric and lowercasing both
      // sides, so "Next.js" / "NextJS" / "nextjs" all collapse to "nextjs"
      // and match the manifest key "next" (since "nextjs".includes("next")).
      const manifestKeys = Object.keys(fws);
      const normalizedKeys = manifestKeys.map(k => ({
        key: k,
        norm: normalizeStackName(k),
      }));

      let pm;
      PROSE_VERSION_RE.lastIndex = 0;
      while ((pm = PROSE_VERSION_RE.exec(text)) !== null) {
        const displayName = pm[1];
        const rawVersion = pm[2];
        const version = normalizeVersion(rawVersion);
        if (version === "0.0.0") continue;
        const dispNorm = normalizeStackName(displayName);
        if (dispNorm.length < 2) continue;
        // Match manifest key whose normalized form equals or is contained in
        // the display name (so manifest "next" matches "Next.js" via dispNorm
        // "nextjs" containing "next"). Symmetric containment too.
        const hit = normalizedKeys.find(({ norm }) =>
          norm === dispNorm || dispNorm.includes(norm) || norm.includes(dispNorm)
        );
        if (!hit) continue;
        const key = `${hit.key}@${version}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ lib: hit.key, version });
      }
    }
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

// ─── Source discovery: extract official URLs from ADR Evidências ───────────

/**
 * Extract URLs from `## Evidências / Anexos` section of an ADR.
 *
 * - Only HTTPS (security: official sources only — http/javascript: rejected).
 * - Markdown link syntax `[text](url)` parsed; bare URLs ignored.
 * - Deduplicated, original order preserved.
 *
 * Used by adr-extract-stacks → manifest.discoveryHints, then by
 * `devflow stacks discover-source` to surface curated sources.
 */
export function extractEvidenciasUrls(adrContent) {
  if (typeof adrContent !== "string") return [];
  // Find ## Evidências section header (with optional " / Anexos" suffix)
  const headRe = /^##\s+Evid[êe]ncias[^\n]*$/im;
  const headMatch = adrContent.match(headRe);
  if (!headMatch) return [];
  const startIdx = headMatch.index + headMatch[0].length;
  // Find next ## (or # — ADR titles use single-#) heading or EOF
  const after = adrContent.slice(startIdx);
  const nextHead = after.match(/^#{1,2}\s+\S/m);
  const endIdx = nextHead ? startIdx + nextHead.index : adrContent.length;
  const section = adrContent.slice(startIdx, endIdx);

  const seen = new Set();
  const urls = [];
  const linkRe = /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;
  let m;
  while ((m = linkRe.exec(section)) !== null) {
    const url = m[2];
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

// ─── Helper for adr-audit Check #13 ────────────────────────────────────────

export function adrHasGuardrails(body) {
  if (typeof body !== "string") return false;
  return /^##\s+Guardrails\b/m.test(body);
}
