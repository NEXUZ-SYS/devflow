// scripts/lib/standards-materialize.mjs
// Decide QUAIS standards default materializar no projeto.
//
// A selecao casa `applyTo` contra os CAMINHOS REAIS do repositorio, nao contra
// extensoes sintetizadas: 3 defaults tem prefixo `src/**` (std-caching e
// std-layer-boundaries sao `src/**/*.{ts,tsx}`, std-domain-events e
// `src/**/*.ts`), e um projeto TypeScript sem `src/` nao deve recebe-los. So o
// caminho real revela isso.
//
// NAO usa findApplicableStandards: aquela funcao filtra por applyTo E por faixa
// de versao (ctx.versions), e o eixo de versao e irrelevante aqui — standard
// default nao declara faixa (o check S8 do standard-audit reprova).
//
// Per Dependency Policy: pure node:*.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { matchGlob } from "./glob.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".venv", "venv", "__pycache__", "coverage",
]);
// Alinhado com os demais walks do repo (detect-framework usa 3,
// framework-version usa 6). 12 era arbitrario (achado R4 da fase R).
const MAX_DEPTH = 6;
// Teto de arquivos: a pergunta e BOOLEANA por padrao ("existe algum .ts sob
// src/?"), entao varrer um monorepo inteiro e desperdicio — e resolveArtifacts
// roda em TODO sync. Se o teto for atingido antes de um padrao casar, o std
// simplesmente NAO e materializado: o lado conservador (nao escreve).
const MAX_FILES = 20000;

export function listProjectFiles(projectRoot, limit = MAX_FILES) {
  const out = [];
  walk(projectRoot, "", out, 0, limit);
  return out;
}

function walk(root, sub, out, depth, limit) {
  if (depth > MAX_DEPTH || out.length >= limit) return;
  let entries;
  try { entries = readdirSync(join(root, sub), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (out.length >= limit) return;
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    if (e.isSymbolicLink()) continue;
    const rel = sub ? `${sub}/${e.name}` : e.name;
    if (e.isDirectory()) walk(root, rel, out, depth + 1, limit);
    else if (e.isFile()) out.push(rel);
  }
}

// disable: do standards.local.yaml — mesma gramatica que o standards-loader le.
function disabledIds(projectRoot) {
  const p = join(projectRoot, ".context", "standards.local.yaml");
  if (!existsSync(p)) return new Set();
  let content;
  try { content = readFileSync(p, "utf-8"); } catch { return new Set(); }
  const inline = content.match(/^disable\s*:\s*\[([^\]]*)\]/m);
  if (inline) {
    return new Set(inline[1].split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean));
  }
  const block = content.match(/^disable\s*:\s*\n((?:[ \t]*-[ \t]+[^\n]+\n?)*)/m);
  if (block) {
    return new Set(block[1].split("\n")
      .map((l) => l.replace(/^[ \t]*-[ \t]+/, "").trim().replace(/['"]/g, ""))
      .filter(Boolean));
  }
  return new Set();
}

export function selectDefaults({ projectRoot, pluginRoot }) {
  const dir = join(pluginRoot, "assets", "standards");
  if (!existsSync(dir)) return [];
  const files = listProjectFiles(projectRoot);
  const disabled = disabledIds(projectRoot);
  const selected = [];

  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".md") || entry === "README.md") continue;
    let fm;
    try { fm = parseFrontmatter(readFileSync(join(dir, entry), "utf-8")).data || {}; } catch { continue; }
    if (!fm.id || fm.deprecated === true) continue;
    if (disabled.has(fm.id)) continue;

    // some() para no primeiro casamento: a pergunta e booleana, nao precisa
    // enumerar todos os arquivos que casam.
    const applyTo = Array.isArray(fm.applyTo) ? fm.applyTo : [];
    const matches = applyTo.some((pattern) =>
      files.some((f) => { try { return matchGlob(pattern, f); } catch { return false; } }),
    );
    if (!matches) continue;

    const jsSrc = join(dir, "machine", `${fm.id}.js`);
    const hasLinter = existsSync(jsSrc);
    selected.push({ id: fm.id, mdSrc: join(dir, entry), jsSrc: hasLinter ? jsSrc : null, hasLinter });
  }
  return selected;
}
