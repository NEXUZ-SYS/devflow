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
import { contextPaths } from "./context-paths.mjs";

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

// Caminho canonico do linter no PROJETO — relativo a `.context/`, que e a base
// do sandbox origin:"project" em resolveAndCheckSandbox. O bundle usa
// `machine/<id>.js`, relativo a `assets/standards/`. A mesma string NAO serve
// as duas origens; e por isso que a copia do .md nao e verbatim.
export function projectLinterRel(id) {
  return `engineering/standards/machine/${id}.js`;
}

/**
 * Reescreve `enforcement.linter` do .md para a forma canonica do projeto.
 *
 * NUNCA produz `linter: null` — e a diferenca entre esta funcao e o `eject`
 * simples, que ANULA o linter (devflow-standards.mjs:594) e por isso nao serve
 * para materializar: aplicado aos 26 defaults, desligaria os 20 linters ativos.
 *
 * So o FRONTMATTER e tocado: o corte no segundo `---` garante que uma mencao a
 * `linter:` no corpo nao seja reescrita. Deterministico e idempotente — o hash
 * do resultado precisa bater dos dois lados (plugin e projeto).
 */
export function retargetLinter(mdContent, id) {
  if (typeof mdContent !== "string" || !mdContent.startsWith("---")) return mdContent;
  const end = mdContent.indexOf("\n---", 3);
  if (end === -1) return mdContent;
  const head = mdContent.slice(0, end);
  const rest = mdContent.slice(end);
  // `linter: null` (warn-only) fica como esta: nao ha linter a retargetar.
  const retargeted = head.replace(
    /^(\s*)linter:\s*machine\/[^\s]+\.js\s*$/m,
    `$1linter: ${projectLinterRel(id)}`,
  );
  return retargeted + rest;
}

/**
 * Lista de artefatos no formato que applySync consome.
 *
 * O .md leva `transform` (retarget do linter) quando tem linter; o
 * machine/*.js vai VERBATIM — copiado do bundle LOCAL do plugin, nunca
 * fetchado da rede, entao o guardrail anti-RCE da ADR-007 permanece literal.
 */
export function resolveMaterializedStandards({ projectRoot, pluginRoot }) {
  const stdDir = contextPaths(projectRoot).standards;
  const machineDir = contextPaths(projectRoot).standardsMachine;
  const arts = [];

  for (const { id, mdSrc, jsSrc, hasLinter } of selectDefaults({ projectRoot, pluginRoot })) {
    arts.push({
      src: mdSrc,
      dest: join(stdDir, `${id}.md`),
      framework: "default",
      ...(hasLinter ? { transform: (c) => retargetLinter(c, id) } : {}),
    });
    if (jsSrc) {
      arts.push({ src: jsSrc, dest: join(machineDir, `${id}.js`), framework: "default" });
    }
  }
  return arts;
}
