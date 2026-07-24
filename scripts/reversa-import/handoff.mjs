// scripts/reversa-import/handoff.mjs
// Resolve a ÂNCORA do corpus Reversa — o documento que o próprio Reversa
// escreveu como porta de entrada para um agente de codificação.
// Puro, só-leitura. A ausência de âncora é resultado de primeira classe,
// nunca erro: sem âncora, o Planning parte só da evidência.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { stripInjection } from "./sanitize.mjs";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const TABLE_ROW_RE = /^\|\s*`?([^`|]+?)`?\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/;
const RC_ROW_RE = /^\|\s*\*\*(RC-\d+)\*\*\s*\|\s*([^|]+?)\s*\|\s*`?([^`|]+?)`?\s*\|\s*([^|]+?)\s*\|/;
const NUMBERED_RE = /^\s*\d+\.\s+(.*\S)\s*$/;

function readSafe(p) { try { return readFileSync(p, "utf-8"); } catch { return ""; } }
function clean(s) { return stripInjection(String(s)).text.trim(); }

/** Lê o valor de uma chave escalar do frontmatter. Sem dependência de YAML. */
export function frontmatterValue(text, key) {
  const m = String(text).match(FRONTMATTER_RE);
  if (!m) return null;
  const re = new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m");
  const hit = m[1].match(re);
  return hit ? hit[1].replace(/^["']|["']$/g, "") : null;
}

/** Corpo de uma seção `## <título>` até o próximo heading de mesmo nível. */
function section(text, titleRe) {
  const lines = String(text).split("\n");
  const out = [];
  let inside = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (inside) break;
      inside = titleRe.test(line);
      continue;
    }
    if (inside) out.push(line);
  }
  return out.join("\n");
}

function parseReadingOrder(text) {
  const body = section(text, /Ordem de leitura/i);
  const names = body.match(/`([^`]+\.[a-z]+)`/g) || [];
  const seen = new Set();
  const out = [];
  for (const raw of names) {
    const n = raw.slice(1, -1);
    if (!seen.has(n)) { seen.add(n); out.push(n); }
  }
  return out;
}

function parseArtifactTable(text) {
  const body = section(text, /Lista de artefatos/i);
  const rows = [];
  for (const line of body.split("\n")) {
    const m = line.match(TABLE_ROW_RE);
    if (!m) continue;
    const artifact = clean(m[1]);
    if (!artifact || /^-+$/.test(artifact) || /^artefato$/i.test(artifact)) continue;
    rows.push({ artifact, producedBy: clean(m[2]), status: clean(m[3]) });
  }
  return rows;
}

function parseBlockers(text) {
  const body = section(text, /Bloqueadores/i);
  if (/nenhum bloqueador/i.test(body)) return [];
  return body.split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l && !l.startsWith("|") && !l.startsWith(">"))
    .map(clean)
    .filter(Boolean);
}

function parseNextSteps(text) {
  const body = section(text, /Próximos passos/i);
  return body.split("\n")
    .map((l) => l.match(NUMBERED_RE))
    .filter(Boolean)
    .map((m) => clean(m[1].replace(/\*\*/g, "")))
    .filter(Boolean);
}

function parseRcItems(text) {
  const body = section(text, /REFERIDOS À CODIFICAÇÃO/i);
  const out = [];
  for (const line of body.split("\n")) {
    const m = line.match(RC_ROW_RE);
    if (!m) continue;
    out.push({ id: m[1], what: clean(m[2]), where: clean(m[3]), how: clean(m[4]) });
  }
  return out;
}

/** Varre _reversa_sdd/** procurando um .md cujo frontmatter declare kind: handoff. */
function findByKind(sddDir) {
  const stack = [sddDir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(cur, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { stack.push(p); continue; }
      if (!e.name.endsWith(".md")) continue;
      let head = "";
      try {
        if (statSync(p).size > 1024 * 1024) continue; // âncora não é arquivo gigante
        head = readFileSync(p, "utf-8").slice(0, 2048);
      } catch { continue; }
      if (frontmatterValue(head, "kind") === "handoff") return p;
    }
  }
  return null;
}

const EMPTY = Object.freeze({
  found: false, path: null, relPath: null, rule: "none", kind: null,
  readingOrder: [], artifactTable: [], blockers: [], nextSteps: [], rcItems: [],
});

export function resolveHandoff(sourceDir) {
  const sdd = join(sourceDir, "_reversa_sdd");

  let path = findByKind(sdd);
  let rule = "kind-frontmatter";

  if (!path) {
    const planPath = join(sdd, "_plan", "implementation-plan.md");
    if (existsSync(planPath)) { path = planPath; rule = "plan-dir"; }
  }
  if (!path) {
    const recon = join(sdd, "reconstruction-plan.md");
    if (existsSync(recon)) { path = recon; rule = "reconstruction-plan"; }
  }
  if (!path) return { ...EMPTY };

  const text = readSafe(path);
  return {
    found: true,
    path,
    relPath: relative(sourceDir, path),
    rule,
    kind: frontmatterValue(text, "kind"),
    readingOrder: parseReadingOrder(text),
    artifactTable: parseArtifactTable(text),
    blockers: parseBlockers(text),
    nextSteps: parseNextSteps(text),
    rcItems: parseRcItems(text),
  };
}
