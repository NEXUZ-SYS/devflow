// skills/scrape-stack-batch/scripts/input-resolver.mjs — Fase A of pipeline.
//
// Resolves the final list of <library@version> pairs to scrape from 3 input
// modes (mutually overrideable): --from-package, --from-manifest, args.
// Dedups across sources. Per SI-3, any user-supplied URL goes through
// validateUrl() before downstream stages.

import { readFileSync, existsSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { loadManifest } from "../../../scripts/lib/manifest-stacks.mjs";
import { parseFrontmatter } from "../../../scripts/lib/frontmatter.mjs";
import { validateUrl } from "../../../scripts/lib/url-validator.mjs";

// Strip semver range prefix to get a clean version (^1.2.3 → 1.2.3)
function cleanVersion(v) {
  if (typeof v !== "string") return null;
  const m = v.match(/^[~^>=<\s]*([0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?)/);
  return m ? m[1] : v;
}

export function parseArgPairs(args) {
  const out = [];
  for (const arg of args) {
    const m = arg.match(/^([@a-zA-Z0-9._-]+\/?[a-zA-Z0-9._-]*)@([0-9].*)$/);
    if (!m) {
      throw new Error(`malformed lib spec: '${arg}' (expected '<lib>@<version>')`);
    }
    const library = m[1];
    const version = cleanVersion(m[2]);
    if (!library || !version) {
      throw new Error(`malformed library or version in: '${arg}'`);
    }
    out.push({ library, version });
  }
  return out;
}

export function resolveFromPackage(projectRoot) {
  const pkgPath = join(projectRoot, "package.json");
  if (!existsSync(pkgPath)) return [];
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    return [];
  }
  const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return Object.entries(all).map(([library, version]) => ({
    library,
    version: cleanVersion(version),
  })).filter(x => x.version);
}

export function resolveFromManifest(projectRoot) {
  const manifestPath = join(projectRoot, ".context", "stacks", "manifest.yaml");
  if (!existsSync(manifestPath)) return [];
  // Manifest may include a `wishlist:` section; loadManifest doesn't expose it,
  // so re-parse here using the same wrapper trick.
  const raw = readFileSync(manifestPath, "utf-8");
  const wrapped = `---\n${raw}\n---\n`;
  let data;
  try {
    data = parseFrontmatter(wrapped).data || {};
  } catch {
    return [];
  }
  const wishlist = Array.isArray(data.wishlist) ? data.wishlist : [];
  return wishlist
    .filter(x => x && typeof x === "object" && x.library && x.version)
    .map(x => ({ library: x.library, version: cleanVersion(x.version) }))
    .filter(x => x.version);
}

export function resolveAll(projectRoot, opts) {
  const sources = [];
  if (opts.fromPackage) sources.push(...resolveFromPackage(projectRoot));
  if (opts.fromManifest) sources.push(...resolveFromManifest(projectRoot));
  if (Array.isArray(opts.args) && opts.args.length > 0) {
    sources.push(...parseArgPairs(opts.args));
  }
  // Dedup by library@version (first wins)
  const seen = new Set();
  const out = [];
  for (const s of sources) {
    const key = `${s.library}@${s.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  // Sort alphabetically for deterministic order
  out.sort((a, b) => a.library.localeCompare(b.library));
  return out;
}

// SI-3: any ad-hoc URL passed by user (e.g., --from-url for single-lib scrape)
// MUST pass validateUrl before being handed to downstream stages.
export async function validateAdHocUrl(url) {
  return validateUrl(url);
}
