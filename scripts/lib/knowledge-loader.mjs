// scripts/lib/knowledge-loader.mjs
// Carrega o índice de docs de conhecimento (Stage-1) e os corpos sempre-ativos.
import { existsSync, readdirSync, readFileSync, statSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { contextPaths } from "./context-paths.mjs";

const LAYER_DIRS = ["business", "product", "operations", "engineering"];

function* walkMd(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    // Use lstatSync so symlinks are never followed — a symlink is detected and skipped
    // regardless of whether it points to a directory or a file. This prevents:
    //   - circular symlinks (→ infinite recursion / ELOOP)
    //   - directory escape (symlink pointing outside .context/ is read-through via statSync)
    const lst = lstatSync(full, { throwIfNoEntry: false });
    if (!lst) continue;
    if (lst.isSymbolicLink()) continue; // skip all symlinks
    if (lst.isDirectory()) {
      // não descer em subsistemas mecanizados de engineering (adrs/standards/stacks/templates)
      if (["adrs", "standards", "stacks", "templates", "machine"].includes(entry)) continue;
      yield* walkMd(full);
    } else if (lst.isFile() && entry.endsWith(".md") && entry !== "README.md") {
      yield full;
    }
  }
}

export function loadKnowledgeIndex(projectRoot) {
  const p = contextPaths(projectRoot);
  const index = [];
  for (const layer of LAYER_DIRS) {
    for (const file of walkMd(p[layer])) {
      try {
        const { data } = parseFrontmatter(readFileSync(file, "utf-8"));
        if (data.type !== "knowledge") continue;
        index.push({
          file,
          layer: data.layer ?? layer,
          name: data.name,
          description: data.description ?? "",
          activation: data.activation ?? "on-demand",
          owner: data.owner ?? "",
        });
      } catch { /* doc malformado é ignorado no índice */ }
    }
  }
  return index;
}

export function loadAlwaysActive(projectRoot) {
  const out = [];
  for (const entry of loadKnowledgeIndex(projectRoot)) {
    if (entry.activation !== "always") continue;
    const { body } = parseFrontmatter(readFileSync(entry.file, "utf-8"));
    out.push({ ...entry, body });
  }
  return out;
}
