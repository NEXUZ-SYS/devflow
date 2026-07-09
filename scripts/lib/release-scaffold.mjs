// scripts/lib/release-scaffold.mjs — scaffold de pipeline de release (ADR-012 v1.1.0).
//
// Copia artefatos VERBATIM de assets/release-scaffold/ para o repo do usuário.
// Nada é interpolado: a configuração por projeto é resolvida em runtime pelo
// próprio bump-version.sh.
//
// Enforcement (a proveniência por hash NÃO é atestação de supply-chain; ver a
// seção "Fronteira de confiança" da ADR-012 v1.1.0):
//
//   D7b — CONTROLE MECÂNICO. `.github/workflows/**` sai em `mustWriteViaTool` e
//         é gravado pela ferramenta `Write` do harness, que passa pelo gate de
//         permissões (`mode: prompt`; DENY em branch protegida). Este módulo
//         NUNCA escreve sob `.github/` via node:fs — escrita por node:fs é
//         invisível ao hook `pre-tool-use`.
//
//   D7a — AUXILIAR E AUTO-CONTORNÁVEL. O guard de autonomia lê
//         `.context/workflow/status.yaml` (a mesma fonte do hooks/post-tool-use),
//         que é gravável e isento de branch protection. Encurta o caminho do
//         erro honesto; não detém um adversário.
//
//   N6a — `verifyWritten` confere hash(dest) === hash(asset) para os artefatos
//         gravados pela ferramenta: o conteúdo deles transita pelo LLM, e o
//         workflow é o único artefato que executa em CI.
//
// Zero deps além de node:*. `git` é invocado por execFileSync com argv array
// (sem shell), nunca por string.

import { execFileSync } from "node:child_process";
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, lstatSync, realpathSync, chmodSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { isWithinDir } from "./path-guard.mjs";
import { readField } from "./devflow-config.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ASSET_DIR = join(PLUGIN_ROOT, "assets", "release-scaffold");

/**
 * Allowlist fechada. Um dest fora desta lista não é escrito por nada aqui.
 * `writer: "tool"` ⇒ a ferramenta Write do harness grava (D7b).
 */
export const SCAFFOLD = [
  { src: "release.yml", dest: ".github/workflows/release.yml", writer: "tool", mode: 0o644 },
  { src: "bump-version.sh", dest: "scripts/bump-version.sh", writer: "fs", mode: 0o755 },
  { src: "lib/changelog-cut.mjs", dest: "scripts/lib/changelog-cut.mjs", writer: "fs", mode: 0o644 },
];

const DEFAULT_PROTECTED = ["main", "master", "develop"];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

// ─── Gate ───────────────────────────────────────────────────────────────────

/**
 * Host de um remote git, parseado de forma ANCORADA.
 *
 * Aceita `scheme://[userinfo@]host[:port]/path` e o scp-like `[user@]host:path`.
 * O host é o que vem depois do ÚLTIMO '@' do authority — sem isso,
 * `https://github.com@evil.tld/x/y` passaria por GitHub. A porta é removida e o
 * host é lowercased antes da comparação.
 *
 * @returns {string|null} host normalizado, ou null se não der para parsear.
 */
export function parseHost(remote) {
  if (!remote) return null;
  const s = String(remote).trim();
  if (!s) return null;

  let authority;
  const scheme = s.indexOf("://");
  if (scheme !== -1) {
    const rest = s.slice(scheme + 3);
    const slash = rest.indexOf("/");
    authority = slash === -1 ? rest : rest.slice(0, slash);
  } else {
    // scp-like: [user@]host:path — o ':' separa host de path.
    const colon = s.indexOf(":");
    if (colon === -1) return null; // path local, não é URL
    authority = s.slice(0, colon);
  }

  const at = authority.lastIndexOf("@"); // descarta userinfo
  if (at !== -1) authority = authority.slice(at + 1);

  if (authority.startsWith("[")) {
    const close = authority.indexOf("]"); // IPv6 literal
    if (close !== -1) authority = authority.slice(0, close + 1);
  } else {
    const colon = authority.indexOf(":"); // porta
    if (colon !== -1) authority = authority.slice(0, colon);
  }

  return authority.toLowerCase() || null;
}

const isGitHubHost = (host) => host === "github.com";

/**
 * @returns {{git:boolean, github:boolean, reason:string, remotes:string[]}}
 */
export function checkGate(cwd) {
  let inRepo = false;
  try {
    inRepo = git(cwd, ["rev-parse", "--is-inside-work-tree"]) === "true";
  } catch {
    inRepo = false;
  }
  if (!inRepo) {
    return { git: false, github: false, reason: "não é um repositório git", remotes: [] };
  }

  let remotes = [];
  try {
    remotes = git(cwd, ["remote", "-v"])
      .split("\n")
      .map((l) => l.split(/\s+/)[1])
      .filter(Boolean);
  } catch {
    remotes = [];
  }

  const github = remotes.some((r) => isGitHubHost(parseHost(r)));
  const reason = !remotes.length
    ? "repositório git sem remote"
    : github
      ? "repositório git com remote GitHub"
      : "repositório git sem remote GitHub (GitHub Enterprise não é suportado no v1)";

  return { git: true, github, reason, remotes };
}

// ─── Autonomia (D7a) ────────────────────────────────────────────────────────

/**
 * Lê a autonomia da FONTE REAL: `.context/workflow/status.yaml`, a mesma que o
 * `hooks/post-tool-use` consulta. NÃO é o `.devflow.yaml` — lá esse campo não
 * existe, e lê-lo faria o guard falhar ABERTO.
 * Default `supervised` quando o arquivo ou a chave estão ausentes (idem hook).
 */
export function readAutonomy(cwd) {
  const p = join(cwd, ".context", "workflow", "status.yaml");
  if (!existsSync(p)) return "supervised";
  let text;
  try {
    text = readFileSync(p, "utf8");
  } catch {
    return "supervised";
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*autonomy\s*:\s*(.*)$/);
    if (!m) continue;
    const value = m[1]
      .replace(/\s+#.*$/, "") // comentário inline
      .trim()
      .replace(/^["']|["']$/g, "");
    if (value) return value.toLowerCase();
  }
  return "supervised";
}

function protectedBranches(cwd) {
  const p = join(cwd, ".context", ".devflow.yaml");
  if (!existsSync(p)) return DEFAULT_PROTECTED;
  let raw;
  try {
    raw = readField(readFileSync(p, "utf8"), "protectedBranches"); // ADR-011: parser único
  } catch {
    return DEFAULT_PROTECTED;
  }
  if (!raw) return DEFAULT_PROTECTED;
  const list = raw
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  return list.length ? list : DEFAULT_PROTECTED;
}

function currentBranch(cwd) {
  try {
    return git(cwd, ["branch", "--show-current"]);
  } catch {
    return "";
  }
}

// ─── Contenção (C.13 / C.13b) ───────────────────────────────────────────────

/** Ancestral existente mais próximo de `p` (p pode não existir ainda). */
function nearestExistingAncestor(p) {
  let cur = p;
  for (let i = 0; i < 64; i++) {
    if (existsSync(cur)) return cur;
    const parent = dirname(cur);
    if (parent === cur) return cur;
    cur = parent;
  }
  return cur;
}

/**
 * @returns {null|"outside-root"|"symlink"|"parent-escapes"}
 *
 * `isWithinDir` é LÉXICO e não segue symlink. Um diretório-pai que aponta para
 * fora da raiz passaria pelo teste léxico — daí a re-checagem por realpath.
 */
export function containmentViolation(cwd, dest) {
  const abs = resolve(cwd, dest);
  if (!isWithinDir(abs, cwd)) return "outside-root";
  if (isSymlink(abs)) return "symlink";

  let root;
  try {
    root = realpathSync(cwd);
  } catch {
    return "outside-root";
  }

  const anchor = nearestExistingAncestor(dirname(abs));
  let realAnchor;
  try {
    realAnchor = realpathSync(anchor);
  } catch {
    return "parent-escapes";
  }
  if (!isWithinDir(realAnchor, root)) return "parent-escapes";

  return null;
}

// ─── Plano ──────────────────────────────────────────────────────────────────

export function planScaffold(cwd) {
  return SCAFFOLD.map((item) => {
    const destAbs = join(cwd, item.dest);
    return {
      src: item.src,
      dest: item.dest,
      writer: item.writer,
      mode: item.mode,
      content: readFileSync(join(ASSET_DIR, item.src), "utf8"),
      status: existsSync(destAbs) || isSymlink(destAbs) ? "exists" : "create",
    };
  });
}

// ─── Apply ──────────────────────────────────────────────────────────────────

const refusal = (reason) => ({
  created: [],
  preserved: [],
  refused: [{ dest: "*", reason }],
  mustWriteViaTool: [],
  plan: [],
});

/**
 * @param {string} cwd
 * @param {{dryRun?:boolean, confirmed?:boolean}} opts
 * @returns {{created:string[], preserved:string[], refused:{dest:string,reason:string}[], mustWriteViaTool:{dest:string,content:string}[], plan:object[]}}
 */
export function applyScaffold(cwd, { dryRun = false, confirmed = false } = {}) {
  const gate = checkGate(cwd);
  if (!gate.git) return refusal("sem repositório git");

  // C.9 — o applier escreve por node:fs, invisível ao pre-tool-use. A
  // confirmação humana é obrigatória e vive no código, não na prosa da skill.
  if (!confirmed) return refusal("scaffold não confirmado (confirmed:true é obrigatório)");

  // D7a — auxiliar: fecha o caminho do erro honesto em modo não-supervisionado.
  const autonomy = readAutonomy(cwd);
  if (autonomy !== "supervised") {
    return refusal(`autonomia '${autonomy}': scaffold exige gate humano (supervised)`);
  }

  // C.9e — em branch protegida a ferramenta Write será NEGADA; recusar aqui
  // evita deixar scripts/** órfãos sem o workflow que os usa.
  const branch = currentBranch(cwd);
  if (branch && protectedBranches(cwd).includes(branch)) {
    return refusal(`branch protegida '${branch}': crie uma work branch antes de scaffoldar`);
  }

  const plan = planScaffold(cwd);
  const out = { created: [], preserved: [], refused: [], mustWriteViaTool: [], plan };

  for (const item of plan) {
    const violation = containmentViolation(cwd, item.dest);
    if (violation) {
      out.refused.push({ dest: item.dest, reason: `contenção: ${violation}` });
      continue;
    }
    if (item.status === "exists") {
      out.preserved.push(item.dest); // NUNCA sobrescrever arquivo do usuário
      continue;
    }
    if (dryRun) continue;

    if (item.writer === "tool") {
      // D7b — não escrevemos .github/** por node:fs. Entregamos o conteúdo.
      out.mustWriteViaTool.push({ dest: item.dest, content: item.content, mode: item.mode });
      continue;
    }

    const destAbs = join(cwd, item.dest);
    mkdirSync(dirname(destAbs), { recursive: true });
    writeFileSync(destAbs, item.content);
    chmodSync(destAbs, item.mode);
    out.created.push(item.dest);
  }

  return out;
}

// ─── verifyWritten (N6a) ────────────────────────────────────────────────────

/**
 * Confere que os artefatos gravados PELA FERRAMENTA (writer:'tool') são
 * byte-idênticos ao asset. O conteúdo deles transita pelo LLM; sem isto o único
 * artefato que executa em CI seria o único sem garantia de bytes.
 *
 * @returns {{ok:boolean, checked:string[], mismatch:{dest:string,reason:string}[]}}
 */
export function verifyWritten(cwd) {
  const checked = [];
  const mismatch = [];
  for (const item of SCAFFOLD.filter((s) => s.writer === "tool")) {
    const destAbs = join(cwd, item.dest);
    checked.push(item.dest);
    if (!existsSync(destAbs)) {
      mismatch.push({ dest: item.dest, reason: "ausente" });
      continue;
    }
    if (containmentViolation(cwd, item.dest)) {
      mismatch.push({ dest: item.dest, reason: "contenção" });
      continue;
    }
    const actual = sha256(readFileSync(destAbs));
    const expected = sha256(readFileSync(join(ASSET_DIR, item.src)));
    if (actual !== expected) {
      mismatch.push({ dest: item.dest, reason: `hash difere (esperado ${expected.slice(0, 12)}, veio ${actual.slice(0, 12)})` });
    }
  }
  return { ok: mismatch.length === 0, checked, mismatch };
}
