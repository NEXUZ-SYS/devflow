// scripts/lib/standards-engine.mjs — engine único de standards (ADR-015 D5).
//
// Carrega os standards pela raiz confiável do plugin, roda os linters no sandbox SI-4 com o
// contrato de saída D4, classifica os achados por nível (block | warn | review) e separa,
// pelo baseline, o que é novo do que já foi aceito. Hook, CLI, gate e fase V consomem este
// módulo — nenhum deles decide standards por conta própria.
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveReadPaths } from "./context-paths.mjs";
import { loadStandardsMerged, findApplicableStandards } from "./standards-loader.mjs";
import { runOneLinter, verifyPluginRoot } from "./run-linter.mjs";
import { parseLinterOutput } from "./linter-protocol.mjs";
import { resolveLevel, maxLevel } from "./standards-level.mjs";
import {
  fingerprint, toRelPosix, loadBaseline, parseBaseline, baselineLogicalRel, splitByBaseline,
  BaselineError, stripRoots, realPathOr, BASELINE_MAX_BYTES,
} from "./standards-baseline.mjs";
import { readFrameworkVersionsFromPath } from "./devflow-config.mjs";
import { gitRun, gitWhy, gitEnv } from "./standards-git.mjs";

const SELECTS = new Set(["all", "blockable", "nonblockable"]);
const GIT_OPTS = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000, maxBuffer: 16 * 1024 * 1024 };

// D5: a raiz do plugin vem deste arquivo, nunca do ambiente. CLAUDE_PLUGIN_ROOT é
// envenenável e não existe no git hook nem no CI.
const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Raiz do plugin derivada do próprio `import.meta.url`, validada por `verifyPluginRoot`. */
export function trustedPluginRoot() {
  return verifyPluginRoot(SELF_ROOT) ? SELF_ROOT : undefined;
}

const realOr = (p) => { try { return realpathSync(p); } catch { return p; } };
const within = (root, p) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);

/**
 * Raiz do projeto DevFlow (o diretório com `.context`) a partir de `start`.
 *
 * Dentro de um repositório git, sobe no MÁXIMO até o toplevel (inclusive): um `.context`
 * plantado num ancestral (/tmp/.context, $HOME/.context) não vira raiz. A subida é pelo
 * caminho lógico, mas para quando o caminho real sai do toplevel (cwd alcançado por symlink).
 * Fora de git, vale só o próprio `start`. Sem `.context` → null.
 */
export function findProjectRoot(start) {
  const begin = resolve(start || process.cwd());
  let top = null;
  try {
    top = execFileSync("git", ["-C", begin, "rev-parse", "--show-toplevel"], { ...GIT_OPTS, env: gitEnv() }).trim() || null;
  } catch { /* fora de repositório git (ou start inexistente) */ }
  const realTop = top ? realOr(top) : null;
  for (let d = begin; ; d = dirname(d)) {
    const real = realOr(d);
    if (realTop && !within(realTop, real)) break; // saiu do repositório
    if (existsSync(join(d, ".context"))) return d;
    if (!realTop || real === realTop || dirname(d) === d) break;
  }
  if (top && existsSync(join(top, ".context"))) return top;
  return null;
}

// `null` (e não `undefined`) de propósito: `loadStandardsMerged` tem `pluginRoot =
// process.env.CLAUDE_PLUGIN_ROOT` como default, e `undefined` reativaria o env envenenável.
export function loadEffectiveStandards(projectRoot) {
  return loadStandardsMerged(projectRoot, trustedPluginRoot() ?? null);
}

const versionCtx = (projectRoot) => ({
  versions: readFrameworkVersionsFromPath(join(projectRoot, ".context", ".devflow.yaml")),
});

export function applicableStandards(projectRoot, rel, standards = loadEffectiveStandards(projectRoot)) {
  return findApplicableStandards(rel, standards, versionCtx(projectRoot));
}

/**
 * Baseline efetivo: o arquivo da árvore; se ele sumiu, a versão do HEAD; senão, nenhum.
 * Lança `BaselineError` se o arquivo (ou a versão do HEAD) for inválido — ou se a versão do
 * HEAD não pôde ser LIDA: timeout do git, blob acima do teto do baseline (ENOBUFS) ou git morto
 * por sinal. "Não consegui ler" não é "não existe": tratar como "nenhum" faria o hook sugerir
 * `baseline init` por cima de um baseline versionado.
 *
 * `run` (executor do git) e `maxBytes` são injetáveis em teste.
 */
export function resolveBaseline(projectRoot, { run = gitRun, maxBytes = BASELINE_MAX_BYTES } = {}) {
  const fromFile = loadBaseline(projectRoot);
  if (fromFile) return { baseline: fromFile, source: "arquivo" };
  // Caminho LÓGICO (sem realpath): um symlink de diretório na árvore não pode desviar o
  // endereço do blob no HEAD para um caminho que lá não existe.
  const rel = baselineLogicalRel(projectRoot);
  // "HEAD:./rel" é relativo ao -C (projectRoot), não ao toplevel do repositório.
  const r = run(projectRoot, ["show", `HEAD:./${rel}`], { maxBuffer: maxBytes });
  if (r.status === 0 && !r.error) return { baseline: parseBaseline(r.stdout, `HEAD:${rel}`), source: "HEAD (arquivo ausente da árvore)" };
  // Sem git no PATH, fora de repositório, sem HEAD ou arquivo não versionado: o git sai sozinho
  // com exit ≠ 0 (ou nem inicia, ENOENT). Qualquer outra forma de falhar é leitura interrompida.
  const interrupted = r.error ? r.error.code !== "ENOENT" : (r.signal || r.status === null);
  if (interrupted) throw new BaselineError(`baseline inválido (HEAD:${rel}): git show falhou (${gitWhy(r)}); a versão do HEAD não pôde ser lida`);
  return { baseline: null, source: "nenhum" };
}

async function pool(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const k = next++; out[k] = await fn(items[k]); }
  });
  await Promise.all(workers);
  return out;
}

// Raízes a tirar das mensagens: as cruas e as reais (o linter pode ecoar process.cwd(),
// que é o caminho físico). realPathOr pode lançar (ciclo de symlink) — aí fica só a crua.
function rootsOf(...dirs) {
  const out = [];
  for (const d of dirs) {
    out.push(d);
    try { out.push(realPathOr(d)); } catch { /* RealPathLoopError: ignora a variante real */ }
  }
  return out;
}

// Diretórios dos linters do projeto (`machine/` sob standards/), relativos à raiz, em POSIX: o
// canônico e o legado, pelos mesmos caminhos que o loader e a catraca usam — inclusive o legado
// que ainda não existe no disco.
function machineDirs(projectRoot) {
  return resolveReadPaths(projectRoot, "standards", { includeMissing: true })
    .map(d => relative(projectRoot, join(d, "machine")).split(sep).join("/"));
}

/**
 * Roda os linters aplicáveis sobre `files` e classifica os achados.
 *
 * O que está sob `machine/` dos standards do projeto (canônico e legado) NÃO é analisado: são os
 * linters do próprio projeto, e o canal de saída do protocolo (`console.log`) já os faria
 * "violar" outro standard. A exclusão mora aqui, no funil, para que hook síncrono e assíncrono,
 * `check --staged`, `check --all`, o snapshot do `gate --ci` e a análise da árvore da base vejam
 * o mesmo conjunto. Quem protege esses arquivos é a catraca (`compareMachine`: HEAD × base, pelo
 * hash de blob), o guard do `pre-tool-use` e o CODEOWNERS — não o lint.
 *
 * `stdFilter(std)` (opcional) restringe os standards executados nesta chamada: o `gate` roda
 * primeiro os linters que já existiam na base e só depois os novos ou alterados (T18).
 *
 * @returns {Promise<{blocking, warnings, review, baselined, errors, hasBaseline, baselineSource, baselineError}>}
 */
export async function checkFiles({
  projectRoot, files, baseline, contentRoot = projectRoot, budgetMs = Infinity, concurrency = 8, select = "all", stdFilter,
}) {
  if (!SELECTS.has(select)) throw new TypeError(`checkFiles: select inválido '${select}' (esperado all|blockable|nonblockable)`);
  if (stdFilter !== undefined && typeof stdFilter !== "function") throw new TypeError("checkFiles: stdFilter inválido (esperado uma função)");
  if (typeof budgetMs !== "number" || Number.isNaN(budgetMs) || budgetMs < 0) {
    throw new TypeError(`checkFiles: budgetMs inválido '${budgetMs}' (esperado número ≥ 0 ou Infinity)`);
  }
  const standards = loadEffectiveStandards(projectRoot);
  const ctx = versionCtx(projectRoot);
  const result = {
    blocking: [], warnings: [], review: [], baselined: [], errors: [],
    hasBaseline: false, baselineSource: "nenhum", baselineError: null, linterRuns: 0,
  };

  let bl = baseline;
  if (bl === undefined) {
    try {
      const r = resolveBaseline(projectRoot);
      bl = r.baseline;
      result.baselineSource = r.source;
    } catch (e) {
      if (!(e instanceof BaselineError)) throw e;
      result.baselineError = e.message;
      result.baselineSource = "invalido";
      bl = null;
    }
  } else if (bl) {
    result.baselineSource = "fornecido";
  }
  result.hasBaseline = Boolean(bl);

  const machine = machineDirs(projectRoot);
  const jobs = [];
  const seen = new Set();
  for (const file of files || []) {
    // O toRelPosix recebe o caminho ABSOLUTO: com caminho relativo ele é só lexical e
    // "ext/x.ts" com `ext` → fora passaria como interno. O caminho é resolvido contra o
    // `contentRoot` — onde o conteúdo está. Com os blobs do índice ou do HEAD num tmp, a árvore
    // de trabalho não decide o caminho: `src/` trocado por um link para fora do applyTo fazia
    // `src/new.js` virar `fora/new.js` e sair sem lint. Sem `contentRoot` próprio, é o projeto.
    const abs = isAbsolute(String(file)) ? String(file) : resolve(contentRoot, String(file));
    const rel = toRelPosix(contentRoot, abs);
    if (!rel || seen.has(rel)) continue; // fora do conteúdo, a própria raiz ou repetido
    seen.add(rel);
    if (machine.some(m => rel.startsWith(`${m}/`))) continue; // linter do projeto: não é alvo do check
    for (const std of findApplicableStandards(rel, standards, ctx)) {
      if (!std.enforcement?.linter) continue;
      if (stdFilter && !stdFilter(std)) continue;
      const blockable = maxLevel(std) === "block";
      if (select === "blockable" && !blockable) continue;
      if (select === "nonblockable" && blockable) continue;
      jobs.push({ std, rel });
    }
  }
  // Quantas execuções foram despachadas: "rodou e não achou nada" não é "não rodou".
  result.linterRuns = jobs.length;

  const trustedPlugin = trustedPluginRoot();
  const controller = new AbortController();
  const finite = Number.isFinite(budgetMs);
  const deadline = finite ? Date.now() + budgetMs : Infinity;
  const timer = finite ? setTimeout(() => controller.abort(), Math.max(0, budgetMs)) : null;
  let runs;
  try {
    runs = await pool(jobs, Math.max(1, Math.floor(concurrency) || 1), async ({ std, rel }) => {
      if (controller.signal.aborted || Date.now() >= deadline) {
        return { ok: false, reason: `orçamento de ${budgetMs}ms esgotado; linter não executado` };
      }
      // Caminho RELATIVO + cwd no contentRoot: a mensagem do linter não carrega o diretório
      // do clone, do CI ou do tmp do --staged (impressão digital estável).
      const r = await runOneLinter(std, rel, { projectRoot, cwd: contentRoot, trustedPlugin, signal: controller.signal });
      if (!r.ok && controller.signal.aborted) return { ok: false, reason: `orçamento de ${budgetMs}ms estourado; linter abortado` };
      return r;
    });
  } finally {
    if (timer) clearTimeout(timer);
  }

  const roots = rootsOf(contentRoot, projectRoot);
  const found = [];
  runs.forEach((run, k) => {
    const { std, rel } = jobs[k];
    if (!run.ok) { result.errors.push({ stdId: std.id, path: rel, reason: run.reason }); return; }
    for (const v of parseLinterOutput(run.stdout, { stdId: std.id, filePath: rel })) {
      // path = rel do arquivo analisado (nunca null, nunca o caminho cru do linter); a
      // mensagem que entra na impressão digital e no baseline é a já sem as raízes.
      const finding = {
        stdId: String(std.id),
        ruleId: String(v.ruleId),
        path: rel,
        line: Number.isInteger(v.line) ? v.line : null,
        message: stripRoots(v.message, roots),
        level: resolveLevel(std, v.ruleId, { advisory: v.advisory }),
      };
      finding.fp = fingerprint(finding);
      found.push(finding);
    }
  });

  const { accepted, fresh } = splitByBaseline(found, bl);
  result.baselined = accepted;
  for (const x of fresh) {
    if (x.level === "block") result.blocking.push(x);
    else if (x.level === "review") result.review.push(x);
    else result.warnings.push(x);
  }
  return result;
}
