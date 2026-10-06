// scripts/lib/standards-loader.mjs — load and filter standards from the
// canonical .context/engineering/standards/ path (DDC layout v2), with
// transparent fallback to the legacy .context/standards/ during transition.
//
// Used by:
//   - hooks/post-tool-use (Task 1.3) to find applicable standards for an Edit/Write event
//   - scripts/devflow-standards.mjs verify (Task 1.4) for static validation
//
// Pure node:* — uses scripts/lib/{glob,frontmatter,context-paths}.mjs primitives. No npm deps.

import { readdirSync, readFileSync, statSync, lstatSync, existsSync } from "node:fs";
import { join, basename, dirname, resolve, isAbsolute } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { matchGlob, validateSubset } from "./glob.mjs";
import { resolveReadPaths, contextPaths } from "./context-paths.mjs";
import { readRegularFileSafe } from "./safe-read.mjs";

// standards.local.yaml é pequeno por natureza (uma lista de ids); teto generoso só para não
// truncar um arquivo legítimo — bem abaixo disso já seria uma anomalia.
const MAX_LOCAL_YAML_BYTES = 1024 * 1024;

// Bloco de frontmatter de um std sem o espaço em branco final de cada linha (o `\s` do JS:
// inclui "\r", U+00A0, U+2028, U+2029 e U+FEFF). O parser compartilhado lê cada linha com
// `(.*)$`, e o `.` não casa "\r", U+2028 nem U+2029: uma linha terminada num deles era PULADA
// inteira. `deprecated: true` ou `level: warn` ficavam sem efeito até alguém limpar o fim da
// linha — config dormente, que nenhum guard via ser escrita. Só as linhas até a cerca de
// fechamento mudam; o corpo fica como veio. O parser genérico (ADRs, knowledge, stacks e
// outros o usam) não muda: a limpeza é do loader de std.
function trimFrontmatterLineEnds(raw) {
  const text = String(raw ?? "");
  const lines = text.split("\n");
  if (lines[0].trimEnd() !== "---") return text;
  // Mesma cerca de fechamento que o parser enxerga: a primeira linha seguinte começada em "---".
  const close = lines.findIndex((l, i) => i > 0 && l.startsWith("---"));
  if (close < 0) return text;
  for (let i = 0; i < close; i++) lines[i] = lines[i].trimEnd();
  if (lines[close].trimEnd() === "---") lines[close] = "---";
  return lines.join("\n");
}

// Escalares que decidem o enforcement, aparados: `source: "local "` e `level: " block "` (o
// espaço DENTRO das aspas sobrevive ao parser) valem como o que se lê.
const trimmed = (v) => (typeof v === "string" ? v.trim() : v);
function cleanEnforcement(enf) {
  if (!enf || typeof enf !== "object" || Array.isArray(enf)) return enf || {};
  const out = { ...enf };
  for (const k of ["level", "linter"]) if (typeof out[k] === "string") out[k] = out[k].trim();
  if (out.rules && typeof out.rules === "object" && !Array.isArray(out.rules)) {
    out.rules = Object.fromEntries(Object.entries(out.rules).map(([k, v]) => [k, trimmed(v)]));
  }
  return out;
}

// Parser único de um std (ADR-015): o loader, o engine e o guard da catraca leem o
// frontmatter pelo MESMO caminho — sem diferencial de parser. `raw` é o conteúdo
// (real ou proposto/simulado via overrides); `file`/`filePath`/`origin` são
// metadados de proveniência que não vêm do frontmatter.
export function standardFromText(raw, { file, filePath, origin } = {}) {
  const parsed = parseFrontmatter(trimFrontmatterLineEnds(raw));
  const fm = parsed.data || {};
  if (!fm.id) return null;
  // `deprecated` é booleano: o que o apara é a limpeza do fim da linha acima ("true" entre
  // aspas continua sendo string e não desativa o std).
  if (fm.deprecated === true) return null;
  const enforcement = cleanEnforcement(fm.enforcement);
  const applyTo = Array.isArray(fm.applyTo) ? fm.applyTo : [];
  for (const pattern of applyTo) {
    try {
      validateSubset(pattern);
    } catch (err) {
      console.error(`[standards-loader] ${fm.id}: invalid glob '${pattern}': ${err.message}`);
      return null;
    }
  }
  const hasLinter = !!enforcement.linter;
  return {
    id: fm.id,
    file,
    filePath,
    description: fm.description || "",
    version: fm.version || "0.0.0",
    applyTo,
    relatedAdrs: fm.relatedAdrs || [],
    // Faixa de versao do framework do perfil dono (inclusiva nos dois lados).
    // String(...) e deliberado: `appliesFrom: 16` sem aspas vira Number no
    // YAML, e a comparacao precisa ser homogenea.
    appliesFrom: fm.appliesFrom != null ? String(fm.appliesFrom) : null,
    appliesUntil: fm.appliesUntil != null ? String(fm.appliesUntil) : null,
    enforcement,
    source: trimmed(fm.source) || null,
    weak: !hasLinter && fm.weakStandardWarning !== true,
    body: parsed.body || "",
    ...(origin ? { origin } : {}),
  };
}

export function loadStandards(projectRoot) {
  // Use canonical path first; fall back to legacy locations still present on disk.
  const readPaths = resolveReadPaths(projectRoot, "standards");
  // Use the first path that actually exists on disk; default to canonical.
  const dir = readPaths.find(p => existsSync(p)) ?? readPaths[0];
  if (!existsSync(dir)) return [];

  const standards = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "README.md") continue;
    if (entry === "machine") continue;
    if (!entry.endsWith(".md")) continue;

    const filePath = join(dir, entry);
    const stat = statSync(filePath);
    if (!stat.isFile()) continue;

    let std;
    try {
      std = standardFromText(readFileSync(filePath, "utf-8"), { file: entry, filePath });
    } catch (err) {
      console.error(`[standards-loader] skipping ${entry}: ${err.message}`);
      continue;
    }
    if (std) standards.push(std);
  }
  return standards;
}

// Comparacao por SERIE: inteiros, nunca lexicografica ("9" < "10" seria falso).
function inRange(series, from, until) {
  const n = Number(series);
  if (!Number.isFinite(n)) return false;
  if (from != null && n < Number(from)) return false;
  if (until != null && n > Number(until)) return false; // appliesUntil e INCLUSIVO
  return true;
}

// Faixa de versão (ADR-008 v1.3.0). Sem faixa → true; sem ctx.versions → true (contrato antigo);
// série desconhecida ou fora da faixa → false (fail-closed).
export function versionAllows(std, ctx = {}) {
  const hasRange = std.appliesFrom != null || std.appliesUntil != null;
  if (!hasRange) return true;
  const versions = ctx.versions instanceof Map ? ctx.versions : null;
  if (!versions) return true;
  const series = versions.get(std.framework);
  return series != null && inRange(series, std.appliesFrom, std.appliesUntil);
}

/**
 * Chokepoint unico do filtro de standards.
 *
 * `ctx` e OPCIONAL (3o parametro): sem ele o comportamento e byte-identico ao
 * anterior a faixa de versao — retrocompatibilidade e a propriedade de
 * seguranca principal desta feature.
 *   ctx.versions: Map<framework, serie>
 *   ctx.onSkip:   ({id, reason}) => void   (fail-closed nunca e silencioso)
 */
export function findApplicableStandards(filePath, standards, ctx = {}) {
  if (!Array.isArray(standards)) return [];
  return standards.filter(std => {
    if (!Array.isArray(std.applyTo) || std.applyTo.length === 0) return false;
    const pathMatches = std.applyTo.some(pattern => {
      try {
        return matchGlob(pattern, filePath);
      } catch {
        return false;
      }
    });
    if (!pathMatches) return false;

    if (versionAllows(std, ctx)) return true;

    const hasRange = std.appliesFrom != null || std.appliesUntil != null;
    const versions = ctx.versions instanceof Map ? ctx.versions : null;
    if (hasRange && versions) {
      const series = versions.get(std.framework);
      if (typeof ctx.onSkip === "function") {
        if (series == null) {
          ctx.onSkip({ id: std.id, reason: `versao de '${std.framework}' desconhecida — standard com faixa pulado` });
        } else {
          ctx.onSkip({ id: std.id, reason: `serie ${series} fora da faixa [${std.appliesFrom ?? "-"}, ${std.appliesUntil ?? "-"}]` });
        }
      }
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// loadStandardsMerged — merges plugin-bundled defaults + project standards
// ---------------------------------------------------------------------------

/**
 * Parse a bare YAML standards.local.yaml (NO frontmatter fences) and return
 * the list of ids under the `disable:` key.
 *
 * Supports:
 *   disable: [a, b]          (inline array)
 *   disable:                 (block form)
 *     - a
 *     - b
 */
function parseDisableList(content) {
  // Inline form: disable: [a, b, ...]
  const inlineMatch = content.match(/^disable\s*:\s*\[([^\]]*)\]/m);
  if (inlineMatch) {
    const inner = inlineMatch[1].trim();
    if (!inner) return [];
    return inner.split(",").map(s => s.trim()).filter(Boolean);
  }

  // Block form: disable:\n  - a\n  - b
  // A linha passa por trim() antes do match: sem isso `(.+)$` não casava "std-a\r" e o item era
  // ignorado — o mesmo arquivo em CRLF e em LF tinha significados diferentes, e um `disable:`
  // dormente em CRLF acordava quando a ferramenta regravava em LF (T16, rodada 3). Tirar só um
  // "\r" deixava o mesmo buraco para "\r\r" e para U+2028/U+2029, que o `.` também não casa (M6).
  const blockMatch = content.match(/^disable\s*:\s*\n((?:[ \t]*-[ \t]+[^\n]+\n?)*)/m);
  if (blockMatch) {
    return blockMatch[1]
      .split("\n")
      .map(line => line.trim().match(/^-\s+(.+)$/))
      .filter(Boolean)
      .map(m => m[1].trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * Read *.md files from a directory, tagging each with the given origin.
 * Applies R7 symlink containment: symlinks are skipped (lstatSync check).
 * Silently drops files without a valid `id` in frontmatter.
 *
 * `overrides.files` (Map<absPath, string|null>) simula conteúdo proposto
 * (string) ou remoção (null) de um arquivo std sem tocar o disco — usado pelo
 * guard da T16 para comparar o enforcement efetivo com o MESMO parser.
 *
 * `dir` e as chaves de `overrides.files` são normalizados com `path.resolve()`
 * antes de comparar: um `projectRoot` relativo (comum em teste) produziria um
 * `dir` relativo enquanto a chave do override já é absoluta, e a comparação
 * `dirname(chave) === dir` falharia em silêncio — o loader leria o disco e
 * descartaria o conteúdo proposto (o guard da T16 compararia disco com disco).
 * Por contrato a chave já deve ser absoluta (`Map<absPath, ...>`); uma chave
 * relativa é recusada com `throw` em vez de resolvida contra `process.cwd()`
 * (o que produziria um caminho plausível, porém errado, em silêncio).
 */
function readStandardsFromDir(dir, origin, overrides = {}) {
  const absDir = resolve(dir);
  const files = new Map();
  for (const [rawKey, value] of overrides.files || []) {
    if (!isAbsolute(rawKey)) {
      throw new Error(`[standards-loader] overrides.files key must be an absolute path: ${rawKey}`);
    }
    files.set(resolve(rawKey), value);
  }
  const names = new Set(existsSync(absDir) ? readdirSync(absDir) : []);
  for (const p of files.keys()) if (dirname(p) === absDir) names.add(basename(p));
  const standards = [];

  for (const entry of [...names].sort()) {
    if (!entry.endsWith(".md") || entry === "README.md" || entry === "machine") continue;

    // `filePath` fica no MESMO formato de `dir` (relativo permanece relativo)
    // — é o valor devolvido no objeto std, e outros consumidores (ex.:
    // run-linter.mjs, que calcula um caminho relativo a partir de
    // projectRoot) dependem dessa forma. Só a comparação com o override usa
    // a forma absoluta (`absFilePath`), resolvida do mesmo jeito que as
    // chaves de `overrides.files` acima.
    const filePath = join(dir, entry);
    const absFilePath = resolve(absDir, entry);
    let raw;
    let fromOverride = false;
    if (files.has(absFilePath)) {
      raw = files.get(absFilePath);
      if (raw === null) continue; // remoção simulada
      fromOverride = true;
    } else {
      // R7 — symlink guard: use lstatSync and skip symlinks. Falha de stat
      // (ex.: arquivo removido entre o readdir e aqui) é silenciosa, como
      // sempre foi — não é o mesmo tipo de erro que um std ilegível.
      let lst;
      try {
        lst = lstatSync(filePath);
      } catch {
        continue;
      }
      if (lst.isSymbolicLink() || !lst.isFile()) continue;
    }

    // readFileSync fica DENTRO do try que também roda o parser: um std
    // ilegível (EACCES) ou removido entre o lstat e a leitura (ENOENT) é
    // pulado com aviso — igual a um frontmatter malformado — em vez de
    // derrubar loadStandardsMerged inteiro (ruling do controller, T4 R1).
    let std;
    try {
      if (!fromOverride) raw = readFileSync(filePath, "utf-8");
      std = standardFromText(raw, { file: entry, filePath, origin });
    } catch (err) {
      console.error(`[standards-loader] skipping ${entry}: ${err.message}`);
      continue;
    }
    if (std) standards.push(std);
  }
  return standards;
}

/**
 * Merge plugin-bundled defaults with project standards.
 *
 * - Plugin defaults  → origin: "default"  (from <pluginRoot>/assets/standards/)
 * - Project stds     → origin: "project"  (from contextPaths(projectRoot).standards)
 * - Same id → project wins (drop default); one entry per id.
 * - Any id in <projectRoot>/.context/standards.local.yaml `disable:` list is removed.
 * - pluginRoot defaults to process.env.CLAUDE_PLUGIN_ROOT (R9 env fallback).
 *
 * `overrides = { files?: Map<absPath, string|null>, localYaml?: string|null }`
 * simula o conteúdo proposto (string) ou a remoção (null) de arquivos de std e
 * do `standards.local.yaml`, sem tocar o disco. Só se aplica às leituras dos
 * diretórios do PROJETO — os defaults do plugin nunca são simulados.
 */
export function loadStandardsMerged(
  projectRoot,
  pluginRoot = process.env.CLAUDE_PLUGIN_ROOT,
  overrides = {},
) {
  const pluginDefaultsDir = pluginRoot
    ? join(pluginRoot, "assets", "standards")
    : null;

  // Use resolveReadPaths to include the legacy .context/standards/ fallback
  // (same as loadStandards), so projects not yet migrated to DDC v2 are covered.
  // Um override cujo diretório é um legado AINDA inexistente também entra: a simulação
  // de "criar .context/standards/std-x.md" tem de ver o std que o disco verá depois da
  // escrita (achado herdado da T4, fechado na T16). Sem overrides, nada muda.
  const overrideDirs = new Set();
  for (const [key] of overrides.files || []) if (isAbsolute(key)) overrideDirs.add(dirname(resolve(key)));
  const projectStandardsDirs = resolveReadPaths(projectRoot, "standards", { includeMissing: true })
    .filter((d, i) => i === 0 || existsSync(d) || overrideDirs.has(resolve(d)));

  const defaults = pluginDefaultsDir
    ? readStandardsFromDir(pluginDefaultsDir, "default")
    : [];

  // Read from all resolved paths (canonical first, then legacy).
  // De-duplicate by id: first occurrence wins (canonical takes precedence).
  const projectStdsById = new Map();
  for (const dir of projectStandardsDirs) {
    for (const std of readStandardsFromDir(dir, "project", overrides)) {
      if (!projectStdsById.has(std.id)) {
        projectStdsById.set(std.id, std);
      }
    }
  }
  const projectStds = Array.from(projectStdsById.values());

  // Merge: project overrides default by id
  const merged = new Map();
  for (const std of defaults) {
    merged.set(std.id, std);
  }
  for (const std of projectStds) {
    // project always wins — override any default with same id
    merged.set(std.id, std);
  }

  // R1 — disable list from standards.local.yaml (overrides.localYaml: null = removido)
  // Leitura via safe-read (não readFileSync): um FIFO ou symlink plantado no lugar deste
  // arquivo travaria os dois hooks de SessionStart (session-start e session-start-norms),
  // que dependem deste merge. readRegularFileSafe faz o arquivo "ilegível" virar null
  // (equivalente a "sem disable list"), nunca travar.
  const localYamlPath = contextPaths(projectRoot).standardsLocalYaml;
  let localContent = null;
  if (Object.prototype.hasOwnProperty.call(overrides, "localYaml")) {
    localContent = overrides.localYaml;
  } else {
    localContent = readRegularFileSafe(localYamlPath, MAX_LOCAL_YAML_BYTES);
  }
  const disableSet = new Set(localContent ? parseDisableList(localContent) : []);

  return Array.from(merged.values()).filter(std => !disableSet.has(std.id));
}
