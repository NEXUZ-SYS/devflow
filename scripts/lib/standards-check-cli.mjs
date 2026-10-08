// scripts/lib/standards-check-cli.mjs — check/baseline/enforce/explain/gate (ADR-015).
//
// Gate determinístico sobre o engine (T6). Usado pelo pre-commit, pela CI e pela fase V,
// que falham FECHADOS: 0 ok · 1 violação block nova ou catraca enfraquecida · 2 uso incorreto
// ou ação recusada · 3 erro de execução (inclui baseline inválido e qualquer exceção não prevista).
//
// Catraca sob o operador (D6): `baseline init`, `baseline accept`, `baseline reinit` e `enforce` para baixo
// exigem terminal interativo. `baseline prune` (só encolhe) e `enforce` para cima são livres.
// A garantia (D8) é o `gate --ci`, que compara a catraca com o merge-base.
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, resolve } from "node:path";
import {
  checkFiles, findProjectRoot, trustedPluginRoot, loadEffectiveStandards, applicableStandards, resolveBaseline,
} from "./standards-engine.mjs";
import { standardFromText } from "./standards-loader.mjs";
import { resolveLevel, maxLevel, LEVELS, RANK } from "./standards-level.mjs";
import {
  saveBaseline, initBaseline, pruneBaseline, acceptFinding, reinitStandard, capCredit, toRelPosix, parseBaseline,
  baselineLogicalRel, baselineSymlinkComponent, BaselineError, BASELINE_VERSION,
} from "./standards-baseline.mjs";
import { compareRatchet, baselineAtBase, VIOLATION_KINDS } from "./standards-ratchet.mjs";
import { verifyOverrideApproval, isValidPr, isValidRepo } from "./standards-label-approval.mjs";
import { inlineSafe } from "./untrusted-frame.mjs";
import {
  gitRun, gitEnv, resolveMergeBase, materializeBlobs, UsageError, quote, GIT_TIMEOUT_MS, GIT_MAX_BUFFER, DEFAULT_BASE_REF,
} from "./standards-git.mjs";

// Git com idioma fixo. As leituras curtas têm teto de tempo; o `checkout-index` do --staged
// (GIT_OPTS direto) não tem, porque materializa um commit inteiro.
const GIT_OPTS = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: GIT_MAX_BUFFER };
const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { ...GIT_OPTS, env: gitEnv(), timeout: GIT_TIMEOUT_MS });
const nul = (s) => s.split("\0").filter(Boolean);
const who = () => process.env.USER || process.env.USERNAME || "operador";

/** Comando real do plugin para citar em mensagens (nunca um binário `devflow standards`). */
export const pluginCmd = () => `node "${trustedPluginRoot() || "<plugin>"}/scripts/devflow-standards.mjs"`;

// Linha de achado no log. O caminho vem do repositório e a mensagem pode repeti-lo: uma quebra de
// linha (ou "\r", ESC, U+2028…) no nome do arquivo não pode abrir uma linha nova no log do check
// nem do gate. O caminho passa por `inlineSafe`; do id do std, da regra e da mensagem saem só os
// caracteres de controle (o resto fica como o linter escreveu). O `--json` continua trazendo os valores reais.
const LOG_PATH_MAX = 400;
const logPath = (p) => inlineSafe(p, LOG_PATH_MAX);
const oneLine = (s) => String(s ?? "").replace(/[\x00-\x1f\x7f\x85\u2028\u2029]+/g, " ");
const fmt = (f) => `${logPath(f.path)}:${f.line ?? "?"} [${oneLine(f.stdId)}/${oneLine(f.ruleId)}] ${oneLine(f.message)}`;
const opt = (args, k) => {
  const eq = args.find(a => a.startsWith(`${k}=`));
  if (eq) return eq.slice(k.length + 1);
  const i = args.indexOf(k);
  return i >= 0 && i + 1 < args.length && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};

const FP_RE = /^[0-9a-f]{40}$/;
const STD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const REASON_MAX = 500;
const REINIT_USAGE = `uso: baseline reinit <std-id> --reason "<justificativa>" [--allow-new-paths] (um standard por vez; <std-id> só com letras, dígitos, ponto, hífen e sublinhado; justificativa obrigatória, até ${REASON_MAX} caracteres)`;

function refuseNonInteractive(what) {
  console.error(`recusado: ${what} afrouxa a catraca e exige o terminal interativo do operador (ADR-015 D6).`);
  console.error(`Peça ao humano para rodar no terminal dele: ${pluginCmd()} ${what}`);
  return 2;
}

// CI = variável `CI` não vazia e diferente de "false"/"0" (GitHub usa "true"; outros, "1").
export function isCI(env = process.env) {
  const v = String(env.CI ?? "").trim().toLowerCase();
  return v !== "" && v !== "false" && v !== "0";
}

/**
 * Baseline do merge-base de HEAD com `ref`, lido pelo caminho LÓGICO do baseline.
 * - ref começando com "-" → UsageError (exit 2): seria opção do git (`--independent`).
 * - `ci`: a base é um `refs/…` completo, um SHA completo ou um nome em `refs/remotes/` sem
 *   homônimo em tags ou branches, e tem de ser ancestral do HEAD (`resolveMergeBase`). Symlink
 *   em qualquer componente do caminho do baseline — na árvore OU na base —, base que não
 *   resolve, timeout ou erro de git que não seja "caminho ausente" → lança (exit 3).
 * - Local: os mesmos casos → baseline atual com nota.
 * - "Adoção" só quando `git cat-file -e <mb>:<lógico>` confirma que o caminho não existe na
 *   base → baseline atual com nota. O `check --base-ref` isolado não confere a adoção contra a
 *   árvore da base: isso é do `gate`.
 *
 * `run` (executor do git) é injetável em teste.
 */
export function baselineAtRef(projectRoot, ref, { ci = false, run = gitRun } = {}) {
  ref = String(ref ?? "");
  if (!ref || ref.startsWith("-")) throw new UsageError(`--base-ref inválido ${quote(ref)}: esperado um ref git que não comece com "-"`);
  if (ci) {
    const link = baselineSymlinkComponent(projectRoot);
    if (link) throw new Error(`link simbólico no caminho do baseline (${quote(link)}); recusado em CI (fail-closed)`);
  }
  const current = (note) => ({ baseline: resolveBaseline(projectRoot, { run }).baseline, note });
  const { mb, why } = resolveMergeBase(projectRoot, ref, { run, ci });
  if (!mb) {
    if (ci) throw new Error(`merge-base com ${quote(ref)} não resolve (fail-closed em CI): ${why}`);
    return current(`sem merge-base com ${quote(ref)}: usando o baseline atual`);
  }
  const short = mb.slice(0, 8);
  const b = baselineAtBase(projectRoot, mb, { run });
  if (b.state === "symlink") {
    const msg = `${b.what} no caminho do baseline na base ${short} (${quote(b.component)})`;
    if (ci) throw new Error(`${msg}; recusado em CI (fail-closed)`);
    return current(`${msg}: usando o atual`);
  }
  if (b.state === "absent") return current(`a base ${short} não tem baseline (adoção): usando o atual`);
  if (b.state === "error") {
    if (ci) throw new Error(`não consegui ler o baseline da base ${short}: ${b.detail}; recusado em CI (fail-closed)`);
    return current(`não consegui ler o baseline da base ${short}: usando o atual`);
  }
  return { baseline: parseBaseline(b.text, b.where), note: `baseline do merge-base ${short} com ${quote(ref)}` };
}

// Baseline do ÍNDICE (para --staged): a entrada do caminho lógico no índice; sem entrada,
// a versão do HEAD (mesma regra do resolveBaseline); sem nenhuma, null. Entrada que não é
// blob comum (symlink 120000) é baseline inválido.
function baselineFromIndex(projectRoot) {
  const rel = baselineLogicalRel(projectRoot);
  const ls = git(projectRoot, "ls-files", "-s", "-z", "--", rel);
  const entry = nul(ls)[0];
  if (entry) {
    const mode = entry.split(" ")[0];
    if (mode !== "100644" && mode !== "100755") throw new BaselineError(`baseline inválido (índice:${rel}): modo ${mode} não é arquivo comum`);
    const sh = gitRun(projectRoot, ["show", `:./${rel}`]);
    if (sh.status !== 0) throw new Error(`git show :${rel} falhou: ${(sh.stderr || "").trim().slice(0, 200)}`);
    return parseBaseline(sh.stdout, `índice:${rel}`);
  }
  const head = gitRun(projectRoot, ["cat-file", "-e", `HEAD:./${rel}`]);
  if (head.status !== 0) return null;
  const sh = gitRun(projectRoot, ["show", `HEAD:./${rel}`]);
  if (sh.status !== 0) throw new Error(`git show HEAD:${rel} falhou`);
  return parseBaseline(sh.stdout, `HEAD:${rel}`);
}

// Só arquivo comum da árvore: rastreado e apagado some; symlink (dentro ou fora) não é
// seguido — o alvo interno, se houver, já é analisado pelo próprio caminho.
function isRegularFile(abs) {
  try { return lstatSync(abs).isFile(); } catch { return false; }
}

function allFiles(root) {
  return nul(git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"))
    .filter(rel => isRegularFile(join(root, rel)));
}

// --staged: conteúdo do ÍNDICE materializado num tmp. Só blobs comuns (100644/100755); um
// symlink no índice (120000) nunca vira link no tmp — seria um caminho para fora do projeto.
function stagedSelection(root) {
  const staged = nul(git(root, "diff", "--cached", "--name-only", "--relative", "-z", "--diff-filter=ACMR"));
  const modes = new Map();
  for (const entry of nul(git(root, "ls-files", "-s", "-z"))) {
    const tab = entry.indexOf("\t");
    if (tab > 0) modes.set(entry.slice(tab + 1), entry.split(" ")[0]);
  }
  const files = [];
  for (const rel of staged) {
    const mode = modes.get(rel);
    if (mode === "100644" || mode === "100755") files.push(rel);
    else console.error(`[standards] ${logPath(rel)}: ignorado (modo ${mode ?? "?"} no índice não é arquivo comum)`);
  }
  const prefix = git(root, "rev-parse", "--show-prefix").trim();
  const tmp = mkdtempSync(join(tmpdir(), "devflow-staged-"));
  const cleanup = () => rmSync(tmp, { recursive: true, force: true });
  try {
    if (files.length) {
      execFileSync("git", ["-C", root, "checkout-index", `--prefix=${tmp}/`, "-z", "--stdin"],
        { ...GIT_OPTS, stdio: ["pipe", "pipe", "ignore"], input: files.join("\0") + "\0" });
    }
  } catch (e) { cleanup(); throw e; }
  // checkout-index grava o caminho completo do repositório sob o prefixo.
  return { files, contentRoot: prefix ? join(tmp, prefix) : tmp, cleanup };
}

const CHECK_USAGE = "uso: check --staged | --all | <paths…> [--json] [--base-ref=<ref>] [--ci]";
const CHECK_OPTS = { flags: new Set(["--staged", "--all", "--json", "--ci"]), valued: new Set(["--base-ref"]) };

// Opção que o subcomando não conhece é uso incorreto (exit 2), nunca ignorada: `--CI` no lugar
// de `--ci` rodava o gate em modo local e saía 0 com a catraca enfraquecida.
function assertKnownOptions(args, { flags, valued }, usage) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("-") || a === "-") continue; // posicional
    const eq = a.indexOf("=");
    const name = eq > 0 ? a.slice(0, eq) : a;
    if (valued.has(name)) {
      if (eq < 0 && i + 1 < args.length && !args[i + 1].startsWith("--")) i++; // valor separado por espaço
      continue;
    }
    if (!flags.has(a)) throw new UsageError(`opção desconhecida ${quote(a)}\n${usage}`);
  }
}

// Exatamente UMA seleção; validada antes de qualquer git ou tmp.
function assertSelection(args) {
  const modes = [args.includes("--staged"), args.includes("--all"), positional(args).length > 0].filter(Boolean).length;
  if (modes === 0) throw new UsageError(CHECK_USAGE);
  if (modes > 1) throw new UsageError(`uso: escolha UMA seleção — --staged, --all ou <paths…>\n${CHECK_USAGE}`);
}

function pathExists(abs) {
  try { lstatSync(abs); return true; } catch (e) {
    if (e?.code === "ENOENT" || e?.code === "ENOTDIR") return false;
    throw e;
  }
}

function selectFiles(root, args) {
  if (args.includes("--staged")) return stagedSelection(root);
  if (args.includes("--all")) return { files: allFiles(root), contentRoot: root, cleanup: () => {} };
  // Caminho pedido pelo nome que não existe é uso incorreto (exit 2): sem isto o check saía 0 com
  // "✓" sem ter olhado nada. Resolvido contra a raiz, como o engine faz. Arquivo apagado que
  // aparece em --staged ou --all não passa por aqui.
  const files = positional(args);
  for (const p of files) {
    if (!pathExists(resolve(root, p))) throw new UsageError(`caminho não encontrado: ${quote(p)}\n${CHECK_USAGE}`);
  }
  return { files, contentRoot: root, cleanup: () => {} };
}

// Posicionais: tudo que não é flag nem valor de flag com espaço (--reason x, --level y).
const VALUED = new Set(["--reason", "--level", "--base-ref", "--pr", "--repo"]);
function positional(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (VALUED.has(args[i])) { i++; continue; }
    if (!args[i].startsWith("--")) out.push(args[i]);
  }
  return out;
}

// Todos os achados do projeto, sem baseline — base de init/prune/accept.
async function allFindings(root) {
  const r = await checkFiles({ projectRoot: root, files: allFiles(root), baseline: null });
  return { r, all: [...r.blocking, ...r.warnings, ...r.review] };
}

function reportErrors(errors) {
  for (const e of errors) console.error(`erro [${oneLine(e.stdId)}] ${logPath(e.path)}: ${oneLine(e.reason)}`);
}

// Achado sem linha = linter no protocolo legado (uma linha VIOLATION por arquivo, com a contagem
// na mensagem). A contagem some na normalização da impressão digital, então a catraca daquele
// standard conta por ARQUIVO: ocorrência nova em arquivo que já tem uma aceita não bloqueia.
// Avisa uma vez por standard que pode chegar a block. Só stderr; não decide o exit code.
function warnLegacyLinters(root, findings) {
  const ids = new Set(findings.filter(f => f.line === null).map(f => String(f.stdId)));
  if (!ids.size) return;
  const blockable = new Set(loadEffectiveStandards(root).filter(s => maxLevel(s) === "block").map(s => String(s.id)));
  for (const id of [...ids].sort()) {
    if (!blockable.has(id)) continue;
    console.error(`aviso [${oneLine(id)}]: linter em protocolo legado (achado sem linha): a catraca deste standard conta por arquivo, não por ocorrência. Atualize o linter em machine/ para o protocolo v2 (VIOLATION <regra> <arquivo>:<linha> <mensagem>) antes do baseline init.`);
  }
}

const CHECK_OK = "✓ standards: nenhuma violação nova de nível block";

// Só o `gate` passa opções: `stdFilter` restringe os standards desta passada, `quietOk` cala a
// linha de sucesso (em duas passadas o gate imprime uma só, no fim), `snapshot` troca a seleção
// de arquivos pelos blobs do HEAD já materializados, `onResult` recebe o resultado do engine e
// `capBaseline` limita o crédito do baseline do check ao que a base produz.
async function cmdCheck(root, args, { stdFilter, quietOk = false, snapshot = null, onResult = null, capBaseline = null } = {}) {
  assertKnownOptions(args, CHECK_OPTS, CHECK_USAGE);
  assertSelection(args);
  let baseline; // undefined → o engine resolve (árvore, senão HEAD)
  const hasRef = args.some(a => a === "--base-ref" || a.startsWith("--base-ref="));
  const ref = opt(args, "--base-ref");
  if (hasRef) {
    const r = baselineAtRef(root, ref, { ci: args.includes("--ci") || isCI() });
    baseline = r.baseline;
    console.error(`[standards] ${r.note}`);
  } else if (args.includes("--staged")) {
    baseline = baselineFromIndex(root); // o que vai ser commitado, não a árvore
  }
  // Sem baseline escolhido acima (override aprovado: vale o da árvore), resolve aqui o mesmo que
  // o engine resolveria, para limitar. Baseline inválido lança (`BaselineError` → exit 3).
  if (capBaseline) baseline = capBaseline(baseline === undefined ? resolveBaseline(root).baseline : baseline);
  const { files, contentRoot, cleanup } = snapshot ? { ...snapshot, cleanup: () => {} } : selectFiles(root, args);
  let r;
  try { r = await checkFiles({ projectRoot: root, files, contentRoot, baseline, stdFilter }); } finally { cleanup(); }
  if (onResult) onResult(r);

  const json = args.includes("--json");
  const out = json ? console.error : console.log;
  if (json) console.log(JSON.stringify(r));
  if (r.baselineError) { console.error(`erro: ${r.baselineError}`); return 3; }
  for (const f of r.warnings) out(`warn   ${fmt(f)}`);
  for (const f of r.review) out(`review ${fmt(f)}`);
  if (r.blocking.length) {
    out(`✗ ${r.blocking.length} violação(ões) nova(s) de nível block:`);
    for (const f of r.blocking) out(`  ${fmt(f)}`);
    if (!r.hasBaseline) out(`Sem baseline: o operador registra o legado no terminal dele com ${pluginCmd()} baseline init`);
  }
  if (r.errors.length) { reportErrors(r.errors); return 3; }
  if (r.blocking.length) return 1;
  if (!quietOk) out(CHECK_OK);
  return 0;
}

// Referência do `reinit` para "caminho novo" e "cresceu": o baseline da base, que o agente não
// altera no PR. Sem merge-base com a base padrão, o do HEAD; sem nenhum dos dois legível (sem
// commit, fora de git), o da árvore — que o agente consegue editar, e por isso vem com aviso.
// Base sem baseline é adoção: todo caminho conta como novo.
function reinitReference(root, tree) {
  const { mb } = resolveMergeBase(root, DEFAULT_BASE_REF);
  const tries = [...(mb ? [[mb, `o baseline do merge-base ${mb.slice(0, 8)} com ${DEFAULT_BASE_REF}`]] : []),
    ["HEAD", `o baseline do HEAD (sem merge-base com ${DEFAULT_BASE_REF})`]];
  for (const [rev, label] of tries) {
    let b;
    try { b = baselineAtBase(root, rev); } catch { continue; }
    if (b.state === "present") return { baseline: parseBaseline(b.text, b.where), note: label };
    if (b.state === "absent") return { baseline: { version: BASELINE_VERSION, entries: [] }, note: `${label}, que não tem baseline` };
  }
  return { baseline: tree, note: "o baseline da árvore (sem commit legível)", unprotected: true };
}

async function cmdBaseline(root, args, isInteractive) {
  const action = args[0];
  if (action === "init") {
    // C15: existe no arquivo OU vale a versão do HEAD (arquivo removido, mas versionado).
    const cur = resolveBaseline(root);
    if (cur.baseline) {
      console.error(`recusado: baseline já existe (fonte: ${cur.source}); use prune (encolhe) ou accept (operador)`);
      return 2;
    }
    if (!isInteractive()) return refuseNonInteractive("baseline init");
    const { r, all } = await allFindings(root);
    if (r.errors.length) { reportErrors(r.errors); return 3; }
    warnLegacyLinters(root, all);
    saveBaseline(root, initBaseline(all, { by: who() }));
    console.log(`✓ baseline criado com ${all.length} ocorrência(s)`);
    return 0;
  }
  if (action === "prune") {
    const { baseline: bl } = resolveBaseline(root);
    if (!bl) { console.error("sem baseline para podar"); return 2; }
    const { r, all } = await allFindings(root);
    if (r.errors.length) { reportErrors(r.errors); return 3; }
    const { baseline, removed } = pruneBaseline(bl, all);
    saveBaseline(root, baseline);
    console.log(`✓ ${removed.length} entrada(s) removida(s); contagens ajustadas ao atual`);
    return 0;
  }
  if (action === "accept") {
    const fp = positional(args.slice(1))[0];
    const reason = opt(args, "--reason");
    // Validado ANTES de recusar ou imprimir: o fp vem do agente e iria parar num comando
    // que o humano cola no terminal. Inválido → exit 2 sem ecoar o valor.
    if (!FP_RE.test(fp || "")) {
      console.error("uso: baseline accept <fp> --reason \"<justificativa>\" (fp = 40 dígitos hexadecimais minúsculos, como no check --json)");
      return 2;
    }
    if (!reason || !reason.trim()) {
      console.error('uso: baseline accept <fp> --reason "<justificativa>" (a justificativa é obrigatória)');
      return 2;
    }
    if (!isInteractive()) return refuseNonInteractive(`baseline accept ${fp} --reason "…"`);
    const { baseline: bl } = resolveBaseline(root); // BaselineError → 3 (runStandardsCommand)
    const { r, all } = await allFindings(root);
    const finding = all.find(f => f.fp === fp);
    if (!finding) {
      if (r.errors.length) { reportErrors(r.errors); return 3; }
      console.error(`achado ${fp} não encontrado no projeto atual`);
      return 2;
    }
    let next;
    try {
      next = acceptFinding(bl || { version: BASELINE_VERSION, entries: [] }, finding, { reason, by: who() });
    } catch (e) {
      if (e instanceof BaselineError) throw e;
      console.error(`uso: ${e.message}`); // M-6: acceptFinding lança Error genérico sem reason
      return 2;
    }
    saveBaseline(root, next);
    console.log(`✓ aceito: ${fmt(finding)}`);
    return 0;
  }
  if (action === "reinit") {
    const rest = args.slice(1);
    const ids = positional(rest);
    const id = ids[0];
    const reason = opt(rest, "--reason");
    const unknown = rest.some(a => a.startsWith("--") && a !== "--reason" && !a.startsWith("--reason=") && a !== "--allow-new-paths");
    // Validado ANTES de recusar ou imprimir, como o fp do accept: id, justificativa e opções
    // vêm do agente e iriam parar num comando que o humano cola no terminal. Qualquer coisa
    // fora do esperado → exit 2 sem ecoar o valor. Opção desconhecida não é ignorada:
    // `--dry-run` gravaria.
    if (unknown || ids.length !== 1 || !STD_ID_RE.test(id) || !reason || !reason.trim() || reason.length > REASON_MAX) {
      console.error(REINIT_USAGE);
      return 2;
    }
    if (!isInteractive()) return refuseNonInteractive(`baseline reinit ${id} --reason "…"`);
    const { baseline: bl } = resolveBaseline(root); // BaselineError → 3 (runStandardsCommand)
    if (!bl) {
      console.error(`sem baseline para refazer: o operador registra o legado com ${pluginCmd()} baseline init`);
      return 2;
    }
    // Igualdade estrita: um std com `id: [std-x]` não pode casar o alvo por coerção.
    const isTarget = (s) => typeof s.id === "string" && s.id === id;
    if (!loadEffectiveStandards(root).some(isTarget)) {
      console.error(`standard ${id} não encontrado`);
      return 2;
    }
    // Só o linter do alvo roda: as entradas dos outros standards não mudam, e um linter
    // quebrado de outro standard não impede a operação. Erro no do alvo fecha antes de gravar.
    const r = await checkFiles({ projectRoot: root, files: allFiles(root), baseline: null, stdFilter: isTarget });
    if (r.errors.length) { reportErrors(r.errors); return 3; }
    // "Não rodou" não é "sem achados": sem linter, ou com applyTo que não casa nada, refazer
    // zeraria as entradas do standard.
    if (r.linterRuns === 0) {
      console.error(`recusado: nenhum linter rodou para ${id} (standard sem linter, ou o applyTo não casa nenhum arquivo). Sem execução não há o que refazer; para tirar entradas que sobraram, use ${pluginCmd()} baseline prune`);
      return 2;
    }
    const all = [...r.blocking, ...r.warnings, ...r.review];
    warnLegacyLinters(root, all);
    const ref = reinitReference(root, bl);
    if (ref.unprotected) console.error("aviso: sem commit para comparar, os caminhos novos são medidos contra o baseline da árvore, que pode ter sido editado; confira o diff do baseline antes de commitar.");
    const out = reinitStandard(bl, all, id, { reason, by: who(), reference: ref.baseline });
    if (!out.changed) {
      console.log(`✓ ${id}: nada a refazer (${out.kept.entries} entrada(s) mantida(s); ${r.linterRuns} execução(ões) de linter)`);
      return 0;
    }
    // Migração de mensagem ou de regra não cria caminho novo; arquivo que não tinha entrada
    // do standard só entra com a flag, depois de o operador ver a lista. Sem teto de linhas.
    if (out.newPaths.length && !rest.includes("--allow-new-paths")) {
      console.error(`recusado: ${out.newPaths.length} caminho(s) com achado de ${id} não tinham nenhuma entrada deste standard em ${ref.note}:`);
      for (const p of out.newPaths) console.error(`  ${logPath(p)}`);
      console.error("Migração de mensagem ou de regra não cria caminho novo. Confira os arquivos; para aceitá-los, repita o comando com --allow-new-paths. Nada foi gravado.");
      return 2;
    }
    // Outro comando pode ter gravado enquanto os linters rodavam: gravar por cima apagaria o
    // que ele aceitou.
    if (JSON.stringify(resolveBaseline(root).baseline) !== JSON.stringify(bl)) {
      console.error("erro: o baseline mudou durante a execução (outro comando gravou); nada foi gravado. Rode de novo.");
      return 3;
    }
    saveBaseline(root, out.baseline);
    const n = (t) => `${t.entries} entrada(s) (${t.count} ocorrência(s))`;
    console.log(`✓ ${id}: baseline refeito — mantidas ${n(out.kept)}; novas ${n(out.added)}; alteradas ${n(out.altered)}; removidas ${n(out.removed)}; reduzidas ${n(out.reduced)}`);
    console.log(`  ${r.linterRuns} execução(ões) de linter`);
    console.log(`  comparado com: ${ref.note}`);
    for (const [rule, c] of out.byRule) console.log(`  regra ${oneLine(rule)}: ${c}`);
    for (const p of out.newPaths) console.log(`  caminho novo: ${logPath(p)}`);
    for (const [p, a, b] of out.grownPaths) console.log(`  cresceu: ${logPath(p)} (${a} → ${b})`);
    return 0;
  }
  console.error("uso: baseline init | prune | accept <fp> --reason \"<justificativa>\" | reinit <std-id> --reason \"<justificativa>\"");
  return 2;
}

// Reescreve `level:` no bloco `enforcement:` do frontmatter (estilo bloco YAML).
function editLevel(src, level) {
  const eol = src.includes("\r\n") ? "\r\n" : "\n"; // preserva o EOL original
  const out = src.split(/\r?\n/);
  if (out[0] !== "---") return null;
  const close = out.indexOf("---", 1);
  if (close < 0) return null;
  const enf = out.findIndex((l, i) => i > 0 && i < close && /^enforcement:/.test(l));
  if (enf < 0) { out.splice(close, 0, "enforcement:", `  level: ${level}`); return out.join(eol); }
  if (!/^enforcement:\s*$/.test(out[enf])) return null; // estilo fluxo: edição manual
  const child = /^(\s+)\S/.exec(out[enf + 1] || "");
  const indent = child && enf + 1 < close ? child[1] : "  ";
  let i = enf + 1;
  let at = -1;
  while (i < close && (/^\s*$/.test(out[i]) || /^\s+\S/.test(out[i]))) {
    if (out[i].startsWith(`${indent}level:`)) at = i;
    i++;
  }
  if (at >= 0) out[at] = `${indent}level: ${level}`;
  else out.splice(enf + 1, 0, `${indent}level: ${level}`);
  return out.join(eol);
}

function cmdEnforce(root, args, isInteractive) {
  const id = positional(args)[0];
  const level = opt(args, "--level");
  if (!id || !LEVELS.includes(level)) { console.error("uso: enforce <std-id> --level block|warn|review"); return 2; }
  const std = loadEffectiveStandards(root).find(s => s.id === id);
  if (!std) { console.error(`standard ${id} não encontrado`); return 2; }
  if (std.origin === "default") {
    // --with-linter: o eject simples zera o campo `linter` e o standard promovido ficaria só texto.
    console.error(`${id} é default do plugin: ejete primeiro com ${pluginCmd()} eject ${id.replace(/^std-/, "")} --with-linter`);
    return 2;
  }
  const current = resolveLevel(std, "");
  if (RANK[level] < RANK[current] && !isInteractive()) return refuseNonInteractive(`enforce ${id} --level ${level}`);
  const file = resolve(root, std.filePath);
  // Contenção por caminho real: diretório de standards que é symlink para fora não recebe
  // escrita (mesma regra do saveBaseline).
  if (!toRelPosix(root, file)) {
    console.error(`erro: ${std.filePath} resolve para fora do projeto; recusado`);
    return 3;
  }
  const next = editLevel(readFileSync(file, "utf8"), level);
  const parsed = next && standardFromText(next, { file: std.file, filePath: std.filePath, origin: std.origin });
  if (!parsed || resolveLevel(parsed, "") !== level) {
    console.error(`erro: não consegui gravar level: ${level} em ${std.filePath} (edite o frontmatter à mão)`);
    return 3;
  }
  writeFileSync(file, next);
  console.log(`✓ ${id}: level ${current} → ${level}`);
  return 0;
}

function cmdExplain(root, args) {
  const paths = positional(args);
  if (!paths.length) { console.error("uso: explain <paths…>"); return 2; }
  const stds = loadEffectiveStandards(root);
  for (const p of paths) {
    const rel = toRelPosix(root, resolve(root, p));
    if (!rel) { console.log(`${p} (fora do projeto)`); continue; }
    console.log(rel);
    const found = applicableStandards(root, rel, stds);
    if (!found.length) console.log("  (nenhuma norma aplicável)");
    for (const s of found) {
      console.log(`  ${s.id} — nível ${resolveLevel(s, "")} (máx ${maxLevel(s)})${s.enforcement?.linter ? "" : " — sem linter"} — ${s.description}`);
    }
  }
  return 0;
}

const GATE_USAGE = "uso: gate [--base-ref=<ref>] [--ci] [--allow-weakening --pr=<n> --repo=<owner>/<nome>]";
const GATE_OPTS = { flags: new Set(["--ci", "--allow-weakening"]), valued: new Set(["--base-ref", "--pr", "--repo"]) };
const hasOpt = (args, k) => args.some(a => a === k || a.startsWith(`${k}=`));
// Teto de linhas no log, só para as de baseline: um baseline regravado inteiro geraria uma linha
// por entrada. As outras classes (std, versões, linter, shim, verify, link) saem todas, antes.
const GATE_MAX_BASELINE_LINES = 200;
const capped = (lines, what) => {
  for (const v of lines.slice(0, GATE_MAX_BASELINE_LINES)) console.error(`  ${v}`);
  if (lines.length > GATE_MAX_BASELINE_LINES) console.error(`  … e mais ${lines.length - GATE_MAX_BASELINE_LINES} de ${what}`);
};
const totalsByKind = (items) => VIOLATION_KINDS.map(k => `${k} ${items.filter(v => v.kind === k).length}`).join(" · ");
function listViolations(items) {
  for (const v of items) if (v.kind !== "baseline") console.error(`  ${v.text}`);
  capped(items.filter(v => v.kind === "baseline").map(v => v.text), "baseline");
}

// Blobs do HEAD num tmpdir, pelos bytes do objeto (sem atributos nem filtros): é o que o check
// do CI linta. A árvore de trabalho passou pelo `.gitattributes` da branch no checkout.
function headSnapshot(root, blobs) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "devflow-head-")));
  const cleanup = () => rmSync(tmp, { recursive: true, force: true });
  try {
    const tree = join(tmp, "tree");
    mkdirSync(tree);
    materializeBlobs(root, blobs, tree);
    return { files: blobs.map(e => e.rel), contentRoot: tree, cleanup };
  } catch (e) { cleanup(); throw e; }
}

// Predicado "o linter deste std não é o da base": std do projeto cujo `enforcement.linter`
// (relativo a `.context/`) é um arquivo de machine/ novo ou alterado, fica num machine/ que não
// deu para conferir, ou é um link para um deles. Os defaults do plugin nunca entram.
function untrustedStd(root, files, dirs) {
  const set = new Set(files);
  const hit = (rel) => set.has(rel) || dirs.some(d => rel.startsWith(d));
  return (std) => {
    const linter = std?.enforcement?.linter;
    if (std?.origin === "default" || typeof linter !== "string" || !linter) return false;
    const rel = posix.normalize(`.context/${linter}`);
    if (hit(rel)) return true;
    try {
      const real = toRelPosix(root, realpathSync(join(root, rel)));
      return real !== null && real !== rel && hit(real);
    } catch { return false; } // não existe: o engine acusa "linter not found" na passada dele
  };
}

/**
 * `gate`: a catraca contra a base (`compareRatchet`) seguida do `check --all`.
 *
 * Com `--ci` (ou `CI` no ambiente):
 *  - a base é resolvida sem ambiguidade e tem de ser ancestral do HEAD (o gate roda sobre o
 *    merge do PR); os caminhos da catraca na árvore têm de ser os blobs do HEAD;
 *  - violação da catraca → 1, salvo override aprovado (`--allow-weakening --pr --repo`): rótulo
 *    e review APPROVED no head do PR, os dois de quem é dono, no CODEOWNERS da base, de todos os
 *    arquivos da catraca que o PR alterou;
 *  - o `check` linta os BLOBS do HEAD (sem atributos nem filtros), com o baseline da BASE; com o
 *    override aprovado, com o baseline da árvore (o estado que foi aprovado);
 *  - o crédito desse baseline é limitado pela base: uma entrada só vale até o que os linters da
 *    base produzem na árvore da base (`cmp.baseFindings`). Crédito sem lastro — a violação foi
 *    corrigida e ninguém rodou `prune` — não cobre ocorrência do HEAD. Com o override aprovado,
 *    a entrada cujo aumento foi aprovado vale pelo que foi aprovado; as demais seguem limitadas;
 *  - nem o override libera crédito pré-pago: uma entrada do baseline que aceita mais ocorrências
 *    do que a árvore tem.
 * Sem `--ci` (fase V local): a violação vira nota e o `check` usa a árvore de trabalho e o
 * baseline da árvore — um `accept` do operador na branch não trava a V local, e o CI decide.
 *
 * Exit: erro 3 > catraca enfraquecida ou violação block nova 1 > 0. Opção desconhecida ou
 * argumento malformado → 2, antes de comparar a catraca ou de chamar a API.
 */
async function cmdGate(root, args, { api } = {}) {
  assertKnownOptions(args, GATE_OPTS, GATE_USAGE);
  if (positional(args).length) throw new UsageError(GATE_USAGE);
  const pr = opt(args, "--pr"), repo = opt(args, "--repo");
  if (hasOpt(args, "--pr") && !isValidPr(pr ?? "")) throw new UsageError(`--pr inválido ${quote(pr ?? "")}: esperado só dígitos\n${GATE_USAGE}`);
  if (hasOpt(args, "--repo") && !isValidRepo(repo ?? "")) throw new UsageError(`--repo inválido ${quote(repo ?? "")}: esperado <owner>/<nome>\n${GATE_USAGE}`);
  const ref = hasOpt(args, "--base-ref") ? opt(args, "--base-ref") ?? "" : DEFAULT_BASE_REF;
  const ci = args.includes("--ci") || isCI();

  const cmp = await compareRatchet(root, ref, { ci });
  for (const n of cmp.notices) console.error(`[standards] nota: ${n}`);
  let rc = 0;
  let approved = false;
  if (cmp.items.length) {
    if (ci && args.includes("--allow-weakening")) {
      const a = verifyOverrideApproval({
        repo, pr, codeownersText: cmp.codeownersText, ratchetPaths: cmp.changedRatchetFiles, headShas: cmp.headShas, ...(api ? { api } : {}),
      });
      console.error(`[standards] override: ${a.reason}`);
      approved = a.ok;
    }
    const totals = totalsByKind(cmp.items);
    if (!ci) console.error(`nota: catraca enfraquecida vs merge-base (o CI vai falhar sem aprovação de code owner) — ${totals}:`);
    else console.error(approved ? `⚠ catraca enfraquecida vs merge-base, aprovada por code owner — ${totals}:` : `✗ catraca enfraquecida vs merge-base — ${totals}:`);
    listViolations(cmp.items);
    if (ci && !approved) rc = 1;
  } else if (cmp.mergeBase) {
    console.error(`[standards] catraca íntegra vs merge-base ${cmp.mergeBase.slice(0, 8)}`);
  }
  // Baseline do check: sob --ci, o da base; sem --ci (V local), o da árvore. Com o override
  // aprovado, também o da árvore — mas o link simbólico no caminho do baseline segue recusado
  // em CI, como no `check --base-ref --ci` (o que foi aprovado tem de ser o arquivo versionado,
  // não o que um link alcança).
  const fromTree = !ci || approved;
  if (ci && approved) {
    const link = baselineSymlinkComponent(root);
    if (link) throw new Error(`link simbólico no caminho do baseline (${quote(link)}); recusado em CI (fail-closed)`);
    console.error("[standards] override aprovado: check com o baseline da árvore (o estado que o code owner aprovou)");
  }
  const checkArgs = fromTree ? ["--all"] : ["--all", `--base-ref=${ref}`, "--ci"];
  // Crédito limitado pela base (sob --ci, quando o baseline da base tem entradas). Com o override
  // aprovado ficam de fora as entradas cujo aumento o code owner aprovou; as que o PR não
  // aumentou continuam valendo só até o que a base produz.
  const exempt = new Set(approved ? cmp.baselineIncreases.map(e => e.fp) : []);
  const capBaseline = ci && cmp.baseFindings ? (bl) => capCredit(bl, cmp.baseFindings, exempt) : null;
  // Quantas ocorrências de cada impressão digital a árvore tem hoje (aceitas ou não).
  const found = new Map();
  const onResult = (r) => {
    for (const f of [...r.baselined, ...r.blocking, ...r.warnings, ...r.review]) found.set(f.fp, (found.get(f.fp) || 0) + 1);
  };
  // Sob --ci o check linta os blobs do HEAD, não a árvore de trabalho.
  const snapshot = ci ? headSnapshot(root, cmp.headBlobs) : null;
  let c;
  try {
    // Um linter novo ou alterado (violação da catraca; na adoção dos standards, só nota) é código
    // da branch rodando dentro do gate: se rodasse junto com os outros, podia reescrever os
    // arquivos e tirar uma violação da frente do linter antigo. Por isso são duas passadas: primeiro os linters que já existiam na base (e os do
    // plugin), sobre os arquivos intactos; só depois os novos ou alterados. O veredito da
    // primeira já está na memória quando o código da branch começa a rodar.
    const untrusted = untrustedStd(root, cmp.untrustedLinters, cmp.untrustedLinterDirs);
    if (!loadEffectiveStandards(root).some(untrusted)) c = await cmdCheck(root, checkArgs, { snapshot, onResult, capBaseline });
    else {
      console.error("[standards] linters novos ou alterados rodam depois dos que já existiam na base (duas passadas)");
      console.error("[standards] passada 1/2: linters que já existiam na base e os do plugin");
      const first = await cmdCheck(root, checkArgs, { stdFilter: (s) => !untrusted(s), quietOk: true, snapshot, onResult, capBaseline });
      console.error("[standards] passada 2/2: linters novos ou alterados");
      const second = await cmdCheck(root, checkArgs, { stdFilter: untrusted, quietOk: true, snapshot, onResult, capBaseline });
      c = Math.max(first, second);
      if (c === 0) console.log(CHECK_OK);
    }
  } finally {
    if (snapshot) snapshot.cleanup();
  }
  if (c === 3) return 3;
  // Crédito pré-pago: a entrada do baseline cresceu além do que a árvore tem. Aceitar um achado
  // que existe é uma decisão; aceitar ocorrências futuras é um cheque em branco — nem o
  // override aprovado libera.
  const prepaid = cmp.baselineIncreases.filter(e => e.head > Math.max(e.base, found.get(e.fp) || 0));
  if (prepaid.length) {
    console.error(ci
      ? `✗ baseline com crédito pré-pago em ${prepaid.length} entrada(s) — aceita mais ocorrências do que a árvore tem; o override não libera:`
      : `nota: baseline com crédito pré-pago em ${prepaid.length} entrada(s) — aceita mais ocorrências do que a árvore tem (o CI vai falhar, com ou sem override):`);
    capped(prepaid.map(e => `${inlineSafe(e.stdId, 120)}/${inlineSafe(e.ruleId, 120)} em ${inlineSafe(e.path, 200)} (aceita ${e.head}, a árvore tem ${found.get(e.fp) || 0}; a base aceitava ${e.base})`), "crédito pré-pago");
    if (ci) rc = 1;
  }
  return Math.max(rc, c);
}

async function dispatch(sub, args, root, isInteractive, deps = {}) {
  // O aviso de protocolo legado entra pelo `onResult`, só no subcomando `check`: as passadas do
  // `gate` chamam o cmdCheck com o próprio `onResult` e ficam como estavam.
  if (sub === "check") {
    return cmdCheck(root, args, { onResult: (r) => warnLegacyLinters(root, [...r.blocking, ...r.warnings, ...r.review, ...r.baselined]) });
  }
  if (sub === "baseline") return cmdBaseline(root, args, isInteractive);
  if (sub === "enforce") return cmdEnforce(root, args, isInteractive);
  if (sub === "explain") return cmdExplain(root, args);
  if (sub === "gate") return cmdGate(root, args, deps);
  console.error("uso: check | baseline | enforce | explain | gate");
  return 2;
}

/**
 * Exit code do subcomando; qualquer exceção não prevista vira 3 (fail-closed).
 * `api` (só o `gate`): cliente da API do GitHub para o override por rótulo, injetável em teste.
 */
export async function runStandardsCommand(sub, args, projectRoot, {
  isInteractive = () => Boolean(process.stdin.isTTY) && !isCI(),
  api,
} = {}) {
  try {
    const root = findProjectRoot(projectRoot) || resolve(projectRoot || process.cwd());
    return await dispatch(sub, args || [], root, isInteractive, { api });
  } catch (e) {
    if (e instanceof UsageError) { console.error(e.message); return 2; }
    console.error(`erro: ${e?.message ?? e}`);
    return 3;
  }
}
