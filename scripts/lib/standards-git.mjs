// scripts/lib/standards-git.mjs — git do gate de standards (ADR-015 D8).
//
// Toda chamada git da catraca passa por aqui: argv em array (sem shell), idioma fixo, tempo
// limitado e sem `refs/replace`. O idioma importa porque "o caminho não existe na base" só é
// distinguível de um erro qualquer pela mensagem do git (os dois saem com 128): com o git
// traduzido, uma adoção legítima virava exit 3 no CI. O tempo importa porque um git travado não
// pode segurar o hook nem o gate. Quem chama decide o que fazer com a falha — este módulo nunca
// transforma erro em "ausente".
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";

export const GIT_TIMEOUT_MS = 5000;
export const GIT_MAX_BUFFER = 64 * 1024 * 1024;
/** Base padrão do gate, na forma completa: um nome curto pode ser tomado por uma tag homônima. */
export const DEFAULT_BASE_REF = "refs/remotes/origin/main";

/** Uso incorreto do CLI (exit 2). */
export class UsageError extends Error {}

/** Nunca ecoar C0/ANSI cru de um valor que veio de fora. */
export const quote = (v) => JSON.stringify(String(v));

/**
 * Ambiente do git: mensagens em inglês (`LANGUAGE` também é esvaziado porque há gettext que o
 * consulta antes de `LC_ALL`) e sem `refs/replace` — um objeto de substituição trocaria o que o
 * gate lê da base sem mudar nenhum hash visível.
 */
export const gitEnv = (env = process.env) => ({ ...env, LC_ALL: "C", LANGUAGE: "", GIT_NO_REPLACE_OBJECTS: "1" });

/**
 * Roda `git -C <root> …args`. Nunca lança: devolve `{status, stdout, stderr, error, signal}`.
 * `error.code` é `ETIMEDOUT` no estouro do tempo, `ENOBUFS` no estouro do `maxBuffer` e `ENOENT`
 * quando não há git no PATH; nesses casos `status` é `null`. Com `encoding: "buffer"` o stdout
 * vem como Buffer (bytes crus de blob); `stdoutFd` manda o stdout direto para um descritor.
 */
export function gitRun(root, args, { input, env, timeout = GIT_TIMEOUT_MS, maxBuffer = GIT_MAX_BUFFER, encoding = "utf8", stdoutFd } = {}) {
  const r = spawnSync("git", ["-C", root, ...args], {
    encoding, env: gitEnv(env), timeout, maxBuffer, killSignal: "SIGKILL",
    stdio: [input === undefined ? "ignore" : "pipe", stdoutFd === undefined ? "pipe" : stdoutFd, "pipe"],
    // Com `encoding: "buffer"` o Node usaria a mesma codificação para o `input` em string.
    ...(input === undefined ? {} : { input: typeof input === "string" ? Buffer.from(input, "utf8") : input }),
  });
  const empty = encoding === "buffer" ? Buffer.alloc(0) : "";
  return { status: r.status, stdout: r.stdout ?? empty, stderr: String(r.stderr ?? ""), error: r.error ?? null, signal: r.signal ?? null };
}

/** `true` quando a chamada não terminou com exit 0 (inclui timeout, ENOBUFS e sinal). */
export const gitFailed = (r) => !r || Boolean(r.error) || r.status !== 0;

/** Motivo curto e de uma linha de uma falha de git, para mensagem de erro. */
export function gitWhy(r) {
  if (!r) return "sem resultado";
  if (r.error) return String(r.error.code || r.error.message || "erro");
  if (r.signal) return `morto por ${r.signal}`;
  const msg = String(r.stderr || "").trim().split("\n")[0].replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 200);
  return `exit ${r.status}${msg ? `: ${msg}` : ""}`;
}

const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** Quando a base não é ancestral do HEAD (o gate tem de rodar sobre o merge do PR). */
export const NOT_ANCESTOR = "a base não é ancestral do HEAD; rode o gate sobre o merge do PR";

// Ref pelo nome COMPLETO e exato, sem as regras de desambiguação do `rev-parse`:
// {state: "exists", sha} | {state: "absent"} | {state: "error", why}.
function exactRef(root, full, run) {
  const ok = run(root, ["check-ref-format", full]);
  if (ok.error || ok.signal) return { state: "error", why: gitWhy(ok) };
  if (ok.status !== 0) return { state: "error", why: `${quote(full)} não é um nome de ref válido` };
  const r = run(root, ["for-each-ref", "--format=%(refname)%00%(objectname)", full]);
  if (gitFailed(r)) return { state: "error", why: gitWhy(r) };
  for (const line of r.stdout.split("\n")) {
    const [name, sha] = line.split("\0");
    if (name === full && SHA_RE.test(sha || "")) return { state: "exists", sha };
  }
  return { state: "absent" };
}

// Commit da base sob --ci. Aceita SHA completo ou `refs/…` completo; um nome curto é resolvido
// só em `refs/remotes/<nome>` e recusado se houver homônimo em `refs/tags/` ou `refs/heads/`
// (o `rev-parse origin/main` resolve a TAG antes do remoto, e quem empurra uma tag com esse
// nome passaria a escolher a base do próprio PR).
function strictBaseCommit(root, ref, run) {
  let sha;
  if (SHA_RE.test(ref)) sha = ref;
  else {
    const short = !ref.startsWith("refs/");
    const full = short ? `refs/remotes/${ref}` : ref;
    if (short) {
      for (const other of [`refs/tags/${ref}`, `refs/heads/${ref}`]) {
        const o = exactRef(root, other, run);
        if (o.state === "error") return { why: o.why };
        if (o.state === "exists") return { why: `--base-ref ${quote(ref)} é ambíguo: também existe ${other}; use o nome completo (${full})` };
      }
    }
    const f = exactRef(root, full, run);
    if (f.state === "error") return { why: f.why };
    if (f.state !== "exists") return { why: `${full} não existe (sob --ci a base é um refs/… completo, um SHA completo ou um nome em refs/remotes/)` };
    sha = f.sha;
  }
  const rp = run(root, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${sha}^{commit}`]);
  if (gitFailed(rp)) return { why: rp?.error ? gitWhy(rp) : "a base não é um commit conhecido" };
  const commit = rp.stdout.trim();
  return SHA_RE.test(commit) ? { commit } : { why: "a base não é um commit conhecido" };
}

/**
 * Commit contra o qual a catraca é comparada.
 * - `ref` vazio ou começando com "-" → `UsageError` (seria lido como opção do git).
 * - `ci`: a base é resolvida sem ambiguidade (ver `strictBaseCommit`) e TEM de ser ancestral do
 *   HEAD — o gate roda sobre o merge do PR. Com uma base velha, ou um merge-base deslocado por
 *   um pai extra ou por um clone raso, a comparação seria contra um estado que a base já deixou.
 * - Local: o merge-base de HEAD com `ref`, resolvido como o git resolve.
 * - Qualquer falha → `{ mb: "", why }`. Quem chama decide: falha fechada no CI, nota no local.
 */
export function resolveMergeBase(root, ref, { run = gitRun, ci = false } = {}) {
  ref = String(ref ?? "");
  if (!ref || ref.startsWith("-")) throw new UsageError(`--base-ref inválido ${quote(ref)}: esperado um ref git que não comece com "-"`);
  if (ci) {
    const base = strictBaseCommit(root, ref, run);
    if (!base.commit) return { mb: "", why: base.why };
    const anc = run(root, ["merge-base", "--is-ancestor", base.commit, "HEAD"]);
    if (anc.error || anc.signal || (anc.status !== 0 && anc.status !== 1)) return { mb: "", why: gitWhy(anc) };
    if (anc.status === 1) return { mb: "", why: NOT_ANCESTOR };
    return { mb: base.commit };
  }
  const rp = run(root, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`]);
  if (gitFailed(rp)) return { mb: "", why: rp?.error ? gitWhy(rp) : "o ref não é um commit conhecido" };
  const commit = rp.stdout.trim();
  const mbr = run(root, ["merge-base", "HEAD", commit]);
  const mb = gitFailed(mbr) ? "" : mbr.stdout.trim();
  if (!SHA_RE.test(mb)) return { mb: "", why: mbr?.error ? gitWhy(mbr) : "sem ancestral comum com HEAD" };
  return { mb };
}

// Lotes do `cat-file --batch`: por quantidade e por bytes (o lote inteiro passa pela memória).
const BATCH_FILES = 500;
const BATCH_BYTES = 32 * 1024 * 1024;

// Caminho de árvore seguro para gravar: sem componente vazio, ".", ".." ou ".git", sem NUL e sem
// barra invertida. O git recusa esses nomes no checkout; aqui quem grava é este módulo.
function safeRel(rel) {
  const s = String(rel);
  if (!s || s.includes("\0") || s.includes("\\")) return false;
  return s.split("/").every(seg => seg && seg !== "." && seg !== ".." && seg.toLowerCase() !== ".git");
}

/**
 * Grava blobs em `destDir` pelos BYTES do objeto: `git cat-file`, sem filtro, sem atributo e sem
 * conversão de fim de linha ou de codificação. `checkout-index` e `archive` aplicam o
 * `.gitattributes`, e por ele a branch escolheria os bytes que o linter enxerga.
 *
 * `entries`: `[{sha, rel, size?}]`, só arquivos comuns (quem chama filtra link e submódulo).
 * Lança em qualquer falha, em caminho inseguro e em objeto ausente.
 */
export function materializeBlobs(root, entries, destDir, { run = gitRun } = {}) {
  const dest = destDir.endsWith(sep) ? destDir : destDir + sep;
  const target = (rel) => {
    if (!safeRel(rel)) throw new Error(`caminho de árvore inseguro ${quote(rel)}: recusado`);
    const abs = join(destDir, ...rel.split("/"));
    if (!abs.startsWith(dest)) throw new Error(`caminho de árvore fora do destino ${quote(rel)}: recusado`);
    mkdirSync(dirname(abs), { recursive: true });
    return abs;
  };
  const flush = (batch) => {
    if (!batch.length) return;
    const r = run(root, ["cat-file", "--batch"], { input: batch.map(e => `${e.sha}\n`).join(""), encoding: "buffer" });
    if (gitFailed(r)) throw new Error(`git cat-file --batch falhou (${gitWhy(r)})`);
    const buf = r.stdout;
    let off = 0;
    for (const e of batch) {
      const nl = buf.indexOf(0x0a, off);
      const header = nl < 0 ? "" : buf.toString("latin1", off, nl);
      const m = /^([0-9a-f]+) blob (\d+)$/.exec(header);
      if (!m || m[1] !== e.sha) throw new Error(`git cat-file --batch falhou (objeto ${e.sha.slice(0, 12)} de ${quote(e.rel)} ausente ou não é blob)`);
      const size = Number(m[2]);
      const start = nl + 1;
      if (start + size + 1 > buf.length || buf[start + size] !== 0x0a) throw new Error("git cat-file --batch falhou (saída truncada)");
      writeFileSync(target(e.rel), buf.subarray(start, start + size), { flag: "wx" });
      off = start + size + 1;
    }
  };
  let batch = [], bytes = 0;
  for (const e of entries) {
    const size = Number.isFinite(e.size) ? e.size : 0;
    if (size > BATCH_BYTES) {
      // Blob grande: direto do git para o arquivo, sem passar pela memória.
      const fd = openSync(target(e.rel), "wx");
      let r;
      try { r = run(root, ["cat-file", "blob", e.sha], { stdoutFd: fd }); } finally { closeSync(fd); }
      if (gitFailed(r)) throw new Error(`git cat-file blob falhou para ${quote(e.rel)} (${gitWhy(r)})`);
      continue;
    }
    if (batch.length >= BATCH_FILES || bytes + size > BATCH_BYTES) { flush(batch); batch = []; bytes = 0; }
    batch.push(e); bytes += size;
  }
  flush(batch);
}
