/**
 * gen-known-hashes — gera o registry de hashes históricos (maintainer-side).
 *
 * Cobre só artefatos VERBATIM (skills/** + assets/standards/profiles/**), ao longo
 * do HISTÓRICO DE COMMITS (git tags não servem — releases são commits). Usado pela
 * migração do provenance-sync: "esse arquivo é output de alguma versão passada?".
 *
 *   node gen-known-hashes.mjs           # backfill completo (working tree + histórico)
 *   node gen-known-hashes.mjs --append  # mescla com o registry existente (dedup)
 */
import { readdirSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

function walk(root, sub, out) {
  let entries;
  try { entries = readdirSync(join(root, sub), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const rel = sub ? join(sub, e.name) : e.name;
    if (e.isDirectory()) walk(root, rel, out);
    else if (e.isFile()) out.push(rel);
  }
}

// Artefatos VERBATIM: skills/** + assets/standards/profiles/** (.md + .js). Sem agents nem std raiz.
export function distributableFiles(pluginRoot) {
  const out = [];
  walk(pluginRoot, "skills", out);
  walk(pluginRoot, join("assets", "standards", "profiles"), out);
  return out.filter((f) => f.endsWith(".md") || f.endsWith(".js"));
}

export function genFromWorkingTree(pluginRoot) {
  const set = new Set();
  for (const rel of distributableFiles(pluginRoot)) {
    try { set.add(createHash("sha256").update(readFileSync(join(pluginRoot, rel))).digest("hex")); }
    catch { /* skip */ }
  }
  return set;
}

function commitsTouching(pluginRoot, relPath) {
  try {
    return execFileSync("git", ["log", "--pretty=%H", "--", relPath], { cwd: pluginRoot, encoding: "utf-8" })
      .split("\n").map((s) => s.trim()).filter(Boolean);
  } catch { return null; } // null = git indisponível/shallow
}

function blobHashAt(pluginRoot, sha, relPath) {
  try { return createHash("sha256").update(execFileSync("git", ["show", `${sha}:${relPath}`], { cwd: pluginRoot })).digest("hex"); }
  catch { return null; }
}

export function genBackfill(pluginRoot) {
  const set = genFromWorkingTree(pluginRoot);
  let warned = false;
  for (const rel of distributableFiles(pluginRoot)) {
    const commits = commitsTouching(pluginRoot, rel);
    if (commits === null) {
      if (!warned) { console.error("WARN: git indisponível/shallow — registry só do working tree"); warned = true; }
      continue;
    }
    for (const sha of commits) {
      const h = blobHashAt(pluginRoot, sha, rel);
      if (h) set.add(h);
    }
  }
  return set;
}

function registryPath(pluginRoot) { return join(pluginRoot, "assets", "provenance", "known-hashes.json"); }

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const append = process.argv.includes("--append");
  const set = append ? genFromWorkingTree(pluginRoot) : genBackfill(pluginRoot);
  const p = registryPath(pluginRoot);
  if (append && existsSync(p)) {
    try { (JSON.parse(readFileSync(p, "utf-8")).hashes || []).forEach((h) => set.add(h)); } catch { /* */ }
  }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ schema: 1, hashes: [...set].sort() }, null, 2) + "\n");
  console.log(`known-hashes.json: ${set.size} hashes (${append ? "append" : "backfill"})`);
}
