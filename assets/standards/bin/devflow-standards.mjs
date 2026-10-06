#!/usr/bin/env node
// .context/bin/devflow-standards.mjs — atalho do projeto para o CLI de standards do DevFlow.
//
// Localiza o plugin DevFlow instalado nesta máquina e repassa os argumentos ao
// `scripts/devflow-standards.mjs` dele. É o comando do pre-commit do projeto:
//
//   node .context/bin/devflow-standards.mjs check --staged
//
// Copiado VERBATIM do plugin (ADR-012). Não edite: o gate do CI acusa o shim alterado, e uma
// cópia editada deixa de ser atualizada pelo /devflow:devflow-sync.
//
// É atrito local, não garantia. O pre-commit sai do caminho com `--no-verify`, e quem controla
// o ambiente escolhe o plugin que roda. A garantia é o gate do CI, que usa o plugin fixado.
//
// Onde o plugin é procurado, nesta ordem:
//   1. DEVFLOW_PLUGIN_ROOT — caminho absoluto, e só se o diretório for mesmo o plugin;
//   2. o registro de plugins do Claude Code
//      (<CLAUDE_CONFIG_DIR ou ~/.claude>/plugins/installed_plugins.json): a instalação deste
//      repositório (numa worktree, a do repositório principal); senão, a de escopo `user`.
// Sem plugin → exit 3, o código de "erro de execução" do CLI: o commit não passa calado.
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

const PLUGIN_KEY = "devflow@NEXUZ-SYS";
const PLUGIN_NAME = "devflow";
const CLI = ["scripts", "devflow-standards.mjs"];
const REGISTRY_MAX_BYTES = 4 * 1024 * 1024;
const MANIFEST_MAX_BYTES = 256 * 1024;
const GIT_TIMEOUT_MS = 5000;

// Arquivo regular, com teto de tamanho. O_NONBLOCK: um FIFO no lugar do arquivo não trava o
// open nem a leitura; `isFile` recusa FIFO, socket e dispositivo. Nunca lança: devolve null.
function readRegular(path, maxBytes) {
  let fd;
  try { fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0)); } catch { return null; }
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > maxBytes) return null;
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < st.size) {
      const n = readSync(fd, buf, off, st.size - off, off);
      if (n <= 0) break;
      off += n;
    }
    return buf.subarray(0, off).toString("utf8");
  } catch {
    return null;
  } finally {
    try { closeSync(fd); } catch { /* já fechado */ }
  }
}

const isFile = (path) => { try { return statSync(path).isFile(); } catch { return false; } };
const real = (path) => { try { return realpathSync(path); } catch { return resolve(path); } };

// O marcador do plugin: o manifesto com o nome do DevFlow e o CLI de standards no lugar.
function isPlugin(dir) {
  if (typeof dir !== "string" || !isAbsolute(dir)) return false;
  const manifest = readRegular(join(dir, ".claude-plugin", "plugin.json"), MANIFEST_MAX_BYTES);
  if (manifest === null) return false;
  try {
    if (JSON.parse(manifest)?.name !== PLUGIN_NAME) return false;
  } catch {
    return false;
  }
  return isFile(join(dir, ...CLI));
}

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: GIT_TIMEOUT_MS });
  return r.status === 0 ? String(r.stdout).trim() : "";
}

// Raízes que identificam este projeto no registro: o toplevel e, numa worktree, o repositório
// principal (é o caminho dele que o registro guarda). Fora de git, o diretório atual.
function projectRoots() {
  const roots = [git(["rev-parse", "--show-toplevel"]) || process.cwd()];
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (/[\\/]\.git$/.test(common)) roots.push(dirname(common));
  return [...new Set(roots.map(real))];
}

function fromRegistry() {
  const home = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const text = readRegular(join(home, "plugins", "installed_plugins.json"), REGISTRY_MAX_BYTES);
  if (text === null) return null;
  let entries;
  try { entries = JSON.parse(text)?.plugins?.[PLUGIN_KEY]; } catch { return null; }
  if (!Array.isArray(entries)) return null;
  const usable = entries.filter(e => e && typeof e === "object" && typeof e.installPath === "string");
  const candidates = [];
  for (const root of projectRoots()) {
    candidates.push(...usable.filter(e => e.scope !== "user" && typeof e.projectPath === "string" && real(e.projectPath) === root));
  }
  candidates.push(...usable.filter(e => e.scope === "user"));
  for (const e of candidates) if (isPlugin(e.installPath)) return e.installPath;
  return null;
}

function locate() {
  const fromEnv = process.env.DEVFLOW_PLUGIN_ROOT;
  if (fromEnv) {
    if (isPlugin(fromEnv)) return fromEnv;
    console.error("devflow-standards: DEVFLOW_PLUGIN_ROOT ignorado — não é o caminho absoluto da raiz do plugin DevFlow.");
  }
  return fromRegistry();
}

const root = locate();
if (!root) {
  console.error("devflow-standards: plugin DevFlow não localizado nesta máquina.");
  console.error("Instale o plugin no Claude Code (devflow@NEXUZ-SYS) ou aponte DEVFLOW_PLUGIN_ROOT para a raiz dele (caminho absoluto).");
  process.exit(3);
}
// Argumentos em array e sem shell: nada do que veio na linha de comando é interpretado.
const run = spawnSync(process.execPath, [join(root, ...CLI), ...process.argv.slice(2)], { stdio: "inherit" });
if (run.error) {
  console.error(`devflow-standards: não consegui executar o plugin (${run.error.code || run.error.message}).`);
  process.exit(3);
}
process.exit(typeof run.status === "number" ? run.status : 3);
