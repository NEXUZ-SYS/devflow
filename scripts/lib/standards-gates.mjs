// scripts/lib/standards-gates.mjs — oferta dos gates de standards ao projeto (spec §3.7, ADR-015).
//
// Só LÊ e IMPRIME. Quem escreve é a skill (project-init / context-sync), pela ferramenta Write
// e depois do consentimento do operador: escrita por node:fs seria invisível ao pre-tool-use.
//
// O que é copiado para o projeto é VERBATIM (ADR-012): o shim e os dois arquivos de CI são
// assets fixos, sem campo preenchido por projeto, e o drift é decidido por hash (cópia intocada
// de outra versão → `outdated`; editada → `edited`, preservar). O que varia por projeto é lido
// em tempo de execução pelo próprio CI: a base vem do evento e a versão do plugin vem do pin
// (`.context/bin/devflow-plugin.ref`). Os trechos de pre-commit e de CODEOWNERS são texto para
// acrescentar a um arquivo do projeto, não artefatos scaffoldados.
//
//   node scripts/lib/standards-gates.mjs <projectRoot> [--owner=@dono[,@org/time]]
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, resolve, isAbsolute, sep } from "node:path";
import { resolveReadPaths } from "./context-paths.mjs";
import { trustedPluginRoot, loadEffectiveStandards, resolveBaseline } from "./standards-engine.mjs";
import { RESERVED_STANDARDS_ARGV, readVerifyFromPath } from "./devflow-config.mjs";
import { resolveLevel, maxLevel } from "./standards-level.mjs";
import { readRegularFileDetailed } from "./safe-read.mjs";
import { loadRegistry, decideArtifact } from "./provenance-sync.mjs";
import { checkGate, parseHost, containmentViolation, lineDiff, readAutonomy } from "./release-scaffold.mjs";
import { ratchetOwners } from "./standards-label-approval.mjs";
import { gitRun } from "./standards-git.mjs";
import { pluginCmd } from "./standards-check-cli.mjs";

export const SHIM_TARGET = ".context/bin/devflow-standards.mjs";
export const PIN_TARGET = ".context/bin/devflow-plugin.ref";
export const GITHUB_WORKFLOW_TARGET = ".github/workflows/devflow-standards.yml";
export const GITLAB_CI_TARGET = ".gitlab/ci/devflow-standards.yml";
/** O que o `.gitignore` do projeto tem de ignorar: o cache pré-edição e o streak do anti-loop. */
export const RUNTIME_IGNORE = ".context/runtime/";
/** Pin aceito pelos scripts de CI: uma tag de release do plugin ou um SHA completo. */
export const PIN_RE = /^(?:v\d+\.\d+\.\d+|[0-9a-f]{40})$/;

const SHIM_CMD = `node ${SHIM_TARGET} check --staged`;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const CODEOWNERS_FILES = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"]; // a ordem do GitHub
const CODEOWNERS_SAMPLE = "<@dono-das-normas>";
const OWNER_RE = /^@[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?$/; // o mesmo formato que o gate aceita como dono
const PREFIX_RE = /^(?:[A-Za-z0-9_.-]+\/)*$/;
// Diretórios de standards que o gate trata como catraca em QUALQUER projeto, relativos ao
// projeto: o canônico e o legado, pelos mesmos caminhos do engine. O check não analisa o
// `machine/` de nenhum dos dois e um arquivo novo ali é violação — os dois precisam de dono.
const STANDARDS_DIRS = resolveReadPaths(sep, "standards", { includeMissing: true }).map(d => relative(sep, d).split(sep).join("/"));
const ARTIFACT_MAX_BYTES = 1024 * 1024;
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function pluginRoot() {
  const root = trustedPluginRoot();
  if (!root) throw new Error("raiz do plugin não verificada");
  return root;
}
const asset = (...parts) => join(pluginRoot(), "assets", "standards", ...parts);

export const shimSource = () => asset("bin", "devflow-standards.mjs");
export const githubActionsSource = () => asset("ci", "github-actions.yml");
export const gitlabSource = () => asset("ci", "gitlab-ci.yml");

/** Versão do plugin instalado (`X.Y.Z` do manifesto). Lança se o manifesto não a traz. */
export function pluginVersion() {
  const { version } = JSON.parse(readFileSync(join(pluginRoot(), ".claude-plugin", "plugin.json"), "utf8"));
  if (typeof version !== "string" || !VERSION_RE.test(version)) throw new Error("versão do plugin fora do formato X.Y.Z");
  return version;
}

const LEFTHOOK_FILES = ["lefthook.yml", "lefthook.yaml", ".lefthook.yml", ".lefthook.yaml"];
const lefthookFile = (root) => LEFTHOOK_FILES.find(f => existsSync(join(root, f))) || null;

export function detectHookManager(root) {
  if (lefthookFile(root)) return "lefthook";
  if (existsSync(join(root, ".husky"))) return "husky";
  if (existsSync(join(root, ".pre-commit-config.yaml"))) return "pre-commit";
  return null;
}

/**
 * Trecho que liga o pre-commit ao shim no gerenciador `manager` (`null` = nenhum detectado: a
 * oferta é o lefthook). É texto para ACRESCENTAR ao arquivo do gerenciador, não para substituí-lo.
 */
export function preCommitSnippet(manager) {
  if (manager === "husky") return { file: ".husky/pre-commit", content: `${SHIM_CMD}\n` };
  if (manager === "pre-commit") return {
    file: ".pre-commit-config.yaml",
    content: `  - repo: local\n    hooks:\n      - id: devflow-standards\n        name: devflow standards\n        entry: ${SHIM_CMD}\n        language: system\n        pass_filenames: false\n`,
  };
  if (manager === "lefthook" || manager === null) return {
    file: "lefthook.yml",
    content: `pre-commit:\n  commands:\n    devflow-standards:\n      run: ${SHIM_CMD}\n`,
  };
  throw new Error(`gerenciador de hooks desconhecido: ${JSON.stringify(manager)}`);
}

/** Workflow do GitHub Actions: o asset, byte a byte. Nada é preenchido por projeto (ADR-012). */
export const githubActionsSnippet = () => readFileSync(githubActionsSource(), "utf8");
/** Job do GitLab CI: o asset, byte a byte. Sem override (o mecanismo é da API do GitHub). */
export const gitlabSnippet = () => readFileSync(gitlabSource(), "utf8");

/** O pin que os scripts de CI leem em tempo de execução: a tag de release da versão instalada. */
export function pluginPin({ version = pluginVersion() } = {}) {
  if (typeof version !== "string" || !VERSION_RE.test(version)) throw new Error(`versão inválida para o pin: ${JSON.stringify(version)} (esperado X.Y.Z)`);
  return { file: PIN_TARGET, content: `v${version}\n` };
}

/**
 * Trecho do CODEOWNERS para ACRESCENTAR NO FIM do arquivo do projeto (no CODEOWNERS vale a
 * última regra que casa). `owner`: um ou mais donos separados por espaço, cada um `@usuario` ou
 * `@org/time` — e-mail não serve, porque não vira login para o override. Sem `owner`, o trecho
 * leva um marcador de exemplo que não é um dono válido: versionado como está, não libera nada.
 * `prefix`: caminho do projeto dentro do repositório ("" na raiz, "apps/x/" num subdiretório).
 */
export function codeownersSnippet(owner, { prefix = "" } = {}) {
  let owners = CODEOWNERS_SAMPLE;
  if (owner !== undefined) {
    // Só ASCII imprimível: quebra de linha, tab ou caractere de controle abririam outra regra.
    const tokens = String(owner ?? "").split(" ").filter(Boolean);
    if (!tokens.length || /[^\x20-\x7e]/.test(String(owner)) || !tokens.every(t => OWNER_RE.test(t))) {
      throw new Error(`dono inválido para o CODEOWNERS: ${JSON.stringify(owner)} (esperado @usuario ou @org/time)`);
    }
    owners = tokens.join(" ");
  }
  if (typeof prefix !== "string" || !PREFIX_RE.test(prefix)) throw new Error(`prefixo inválido para o CODEOWNERS: ${JSON.stringify(prefix)}`);
  return [
    "# DevFlow — catraca dos standards (ADR-015). Mantenha este bloco NO FIM do arquivo: no",
    "# CODEOWNERS vale a última regra que casa, e uma regra posterior tiraria a posse daqui.",
    `/${GITHUB_WORKFLOW_TARGET} ${owners}`,
    ...STANDARDS_DIRS.map(d => `/${prefix}${d}/ ${owners}`), // canônico e legado
    `/${prefix}.context/standards.local.yaml ${owners}`,
    `/${prefix}.context/.devflow.yaml ${owners}`,
    `/${prefix}.context/bin/ ${owners}`,
    "",
  ].join("\n");
}

export const verifyEntry = () => [...RESERVED_STANDARDS_ARGV];

// ── estado no projeto (só leitura) ──────────────────────────────────────────────────

const BLOCKED_WHY = {
  "outside-root": "o destino fica fora do projeto",
  symlink: "o destino é um link simbólico",
  "parent-escapes": "um diretório do caminho aponta para fora do projeto",
};

// O que há em `rel`: {kind: "absent"} | {kind: "blocked", reason} | {kind: "file", bytes}.
// Link simbólico, diretório, FIFO, arquivo grande demais ou caminho que sai do projeto nunca é
// lido — e a skill não escreve por cima.
function readTarget(projectRoot, rel) {
  const violation = containmentViolation(projectRoot, rel);
  if (violation) return { kind: "blocked", reason: BLOCKED_WHY[violation] };
  let st;
  try { st = lstatSync(join(projectRoot, rel)); } catch (e) {
    return e?.code === "ENOENT" ? { kind: "absent" } : { kind: "blocked", reason: `o destino não pôde ser lido (${e?.code || "erro"})` };
  }
  if (!st.isFile()) return { kind: "blocked", reason: "o destino existe e não é um arquivo comum" };
  if (st.size > ARTIFACT_MAX_BYTES) return { kind: "blocked", reason: "o destino é grande demais para ser este artefato" };
  try { return { kind: "file", bytes: readFileSync(join(projectRoot, rel)) }; } catch (e) {
    return { kind: "blocked", reason: `o destino não pôde ser lido (${e?.code || "erro"})` };
  }
}

// Artefato verbatim: `absent` · `current` (byte-idêntico ao asset) · `outdated` (cópia intocada
// de outra versão do plugin: atualizar com diff + confirmação) · `edited` (edição local:
// preservar) · `blocked` (não ler nem escrever).
function verbatimState(projectRoot, from, to, registry) {
  const source = readFileSync(from);
  const out = { from, to, sha256: sha256(source) };
  const target = readTarget(projectRoot, to);
  if (target.kind === "absent") return { ...out, state: "absent" };
  if (target.kind === "blocked") return { ...out, state: "blocked", reason: target.reason };
  const { action } = decideArtifact({ projHash: sha256(target.bytes), pluginHash: out.sha256, recorded: null, registry });
  if (action === "current") return { ...out, state: "current" };
  return {
    ...out,
    state: action === "untouched" ? "outdated" : "edited",
    diff: lineDiff(target.bytes.toString("utf8"), source.toString("utf8"), to),
  };
}

function pinState(projectRoot) {
  const out = pluginPin();
  const target = readTarget(projectRoot, PIN_TARGET);
  if (target.kind === "absent") return { ...out, state: "absent" };
  if (target.kind === "blocked") return { ...out, state: "blocked", reason: target.reason };
  const current = target.bytes.toString("utf8").replace(/\r?\n$/, "");
  if (!PIN_RE.test(current)) return { ...out, state: "invalid" };
  return current === out.content.trimEnd() ? { ...out, state: "current" } : { ...out, state: "differs", current };
}

// Conteúdo de um arquivo de configuração do projeto, ou null (ausente, link, grande demais…).
function readConfig(projectRoot, rel) {
  if (containmentViolation(projectRoot, rel)) return null;
  const r = readRegularFileDetailed(join(projectRoot, rel));
  return r.ok ? r.text : null;
}

function repoState(projectRoot) {
  const gate = checkGate(projectRoot);
  if (!gate.git) return { git: false, github: false, gitlab: false, prefix: "" };
  // Só o host de cada remote: a URL pode trazer credencial e não entra na saída.
  const hosts = gate.remotes.map(parseHost).filter(Boolean);
  const r = gitRun(projectRoot, ["rev-parse", "--show-prefix"]);
  const prefix = r.status === 0 ? r.stdout.replace(/\n$/, "") : "";
  // GitLab: o host do remote (gitlab.com ou gitlab.<empresa>) ou, numa instância com outro
  // nome, o `.gitlab-ci.yml` que o projeto já tem.
  const gitlab = hosts.some(h => h === "gitlab.com" || h.startsWith("gitlab."))
    || (prefix === "" && existsSync(join(projectRoot, ".gitlab-ci.yml")));
  return { git: true, github: gate.github, gitlab, prefix };
}

// `.context/runtime/` é ignorado por um `.gitignore` do repositório? O `info/exclude` e o
// excludesFile global da máquina não contam: valem só para este clone.
function runtimeIgnored(projectRoot, inGit) {
  if (inGit) {
    const r = gitRun(projectRoot, ["check-ignore", "-v", "--", `${RUNTIME_IGNORE}probe`]);
    if (r.status === 1) return false;
    if (r.status === 0) {
      const source = r.stdout.split(":")[0];
      return Boolean(source) && !isAbsolute(source) && !source.startsWith("~") && !/(^|\/)\.git\//.test(source);
    }
  }
  const text = readConfig(projectRoot, ".gitignore") || "";
  return text.split(/\r?\n/).some(l => /^\/?\.context\/runtime\/?$/.test(l.trim()));
}

function baselineState(projectRoot) {
  const initCommand = `${pluginCmd()} baseline init`; // o caminho real do plugin: o operador roda no terminal dele
  try {
    const { baseline, source } = resolveBaseline(projectRoot);
    return { exists: Boolean(baseline), source, initCommand };
  } catch (e) {
    return { exists: true, error: String(e?.message || e), initCommand };
  }
}

function verifyState(projectRoot) {
  const out = { file: ".context/.devflow.yaml", entry: verifyEntry(), yaml: `standards: ${JSON.stringify(verifyEntry()).replace(/,/g, ", ")}` };
  try {
    return { ...out, declared: Boolean(readVerifyFromPath(join(projectRoot, out.file)).signals.standards) };
  } catch (e) {
    return { ...out, declared: false, error: String(e?.message || e) };
  }
}

function preCommitState(projectRoot, manager) {
  const snippet = preCommitSnippet(manager);
  const file = manager === "lefthook" ? lefthookFile(projectRoot) : snippet.file;
  const text = readConfig(projectRoot, file);
  return {
    file, content: snippet.content, command: SHIM_CMD,
    exists: existsSync(join(projectRoot, file)),
    installed: text !== null && text.includes(SHIM_CMD),
    ...(manager === null ? { note: "nenhum gerenciador de hooks detectado: a oferta é o lefthook, que precisa estar instalado (`lefthook install`)" } : {}),
  };
}

// Caminhos que o gate trata como catraca, para conferir se o CODEOWNERS atual dá dono a todos:
// o baseline e, em cada um dos dois layouts, um standard e um linter.
const ratchetSample = (prefix) => [
  ".context/engineering/standards/baseline.json",
  ...STANDARDS_DIRS.flatMap(d => [`${d}/std-exemplo.md`, `${d}/machine/std-exemplo.js`]),
  ".context/standards.local.yaml", ".context/.devflow.yaml",
  SHIM_TARGET, PIN_TARGET,
].map(p => `${prefix}${p}`);

function codeownersState(projectRoot, repo, owner) {
  // O CODEOWNERS fica na raiz do REPOSITÓRIO; a oferta só o lê quando o projeto está na raiz.
  const file = (repo.prefix ? null : CODEOWNERS_FILES.find(f => existsSync(join(projectRoot, f)))) || CODEOWNERS_FILES[0];
  const text = repo.prefix ? null : readConfig(projectRoot, file);
  const out = { file, exists: text !== null, content: codeownersSnippet(owner, { prefix: repo.prefix }) };
  if (text === null) return { ...out, covered: false };
  const { owners, uncovered, why } = ratchetOwners(text, ratchetSample(repo.prefix));
  return owners.size
    ? { ...out, covered: true, owners: [...owners].sort() }
    : { ...out, covered: false, ...(uncovered ? { uncovered, why } : {}) };
}

function standardsState(projectRoot) {
  const row = (s) => ({ id: s.id, level: resolveLevel(s, ""), maxLevel: maxLevel(s), linter: Boolean(s.enforcement?.linter) });
  const all = loadEffectiveStandards(projectRoot);
  return { local: all.filter(s => s.origin !== "default").map(row), defaults: all.filter(s => s.origin === "default").map(row) };
}

/**
 * A oferta inteira para `projectRoot`: o que copiar, o que acrescentar e o estado de cada item.
 * Não escreve nada. `owner` entra no trecho do CODEOWNERS; `registry` (hashes conhecidos de
 * versões anteriores) é injetável em teste.
 */
export function gatesOffer(projectRoot, { owner, registry = loadRegistry(pluginRoot()) } = {}) {
  const root = resolve(projectRoot);
  const repo = repoState(root);
  const manager = detectHookManager(root);
  const atRoot = repo.prefix === "";
  const autonomy = readAutonomy(root);
  const warnings = [];
  if (autonomy !== "supervised") {
    warnings.push(`autonomia '${autonomy}': a oferta exige o operador presente (supervised); não escreva nenhum item nesta sessão (ADR-012)`);
  }
  if (!atRoot) {
    warnings.push(`projeto num subdiretório do repositório (${repo.prefix}): os arquivos de CI assumem o projeto DevFlow na raiz do repositório e não são oferecidos; o CODEOWNERS fica na raiz do repositório, e o trecho já sai com o prefixo`);
  }
  return {
    pluginVersion: pluginVersion(),
    repo,
    autonomy,
    warnings,
    baseline: baselineState(root),
    shim: verbatimState(root, shimSource(), SHIM_TARGET, registry),
    manager,
    preCommit: preCommitState(root, manager),
    pin: pinState(root),
    // ADR-012: workflow de CI só com repositório git e remote do forge correspondente.
    githubActions: { ...verbatimState(root, githubActionsSource(), GITHUB_WORKFLOW_TARGET, registry), applicable: repo.github && atRoot },
    gitlab: {
      ...verbatimState(root, gitlabSource(), GITLAB_CI_TARGET, registry),
      applicable: repo.gitlab && atRoot,
      include: `include:\n  - local: /${GITLAB_CI_TARGET}\n`,
    },
    codeowners: codeownersState(root, repo, owner),
    verify: verifyState(root),
    gitignore: { file: ".gitignore", line: RUNTIME_IGNORE, ignored: runtimeIgnored(root, repo.git) },
    standards: standardsState(root),
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────

const USAGE = "uso: standards-gates.mjs <projectRoot> [--owner=@dono[,@org/time]]";

function main(argv) {
  const positional = argv.filter(a => !a.startsWith("--"));
  const options = argv.filter(a => a.startsWith("--"));
  const unknown = options.find(a => !a.startsWith("--owner="));
  const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
  if (positional.length !== 1 || unknown || !isDir(positional[0])) {
    console.error(unknown ? `opção desconhecida ${JSON.stringify(unknown)}\n${USAGE}` : USAGE);
    return 2;
  }
  const ownerOpt = options.find(a => a.startsWith("--owner="));
  const owner = ownerOpt === undefined ? undefined : ownerOpt.slice("--owner=".length).split(",").join(" ");
  if (owner !== undefined) {
    try { codeownersSnippet(owner); } catch (e) { console.error(`${e.message}\n${USAGE}`); return 2; }
  }
  console.log(JSON.stringify(gatesOffer(positional[0], { owner }), null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`erro: ${e?.message ?? e}`);
    process.exitCode = 3;
  }
}
