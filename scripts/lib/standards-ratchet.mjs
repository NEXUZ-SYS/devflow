// scripts/lib/standards-ratchet.mjs — a catraca contra o merge-base (ADR-015 D6/D8).
//
// É a camada que o agente não contorna: roda no CI sobre o que foi commitado e compara a árvore
// com o merge-base — baseline, enforcement efetivo, `machine/`, shim e `verify.standards`. Os
// guards locais (T16, T17) são atrito; este é a garantia.
//
// O que vem da base é lido dos objetos do git (nunca do disco). `machine/`, shim e
// `node_modules` são comparados árvore do HEAD × árvore da base, pelo hash de blob do git. O
// que o loader e os linters leem do disco (standards, `standards.local.yaml`, `.devflow.yaml`)
// tem de ser, sob --ci, byte a byte o blob do HEAD: um `.gitattributes` da branch não escolhe os
// bytes que o gate enxerga. Erro de git que não seja "o caminho não existe na base" nunca vira
// "ausente".
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, relative, sep } from "node:path";
import { loadStandardsMerged } from "./standards-loader.mjs";
import { trustedPluginRoot, checkFiles, resolveBaseline } from "./standards-engine.mjs";
import { contextPaths, resolveReadPaths } from "./context-paths.mjs";
import { parseBaseline, compareCounts, initBaseline, baselineLogicalRel, BASELINE_MAX_BYTES } from "./standards-baseline.mjs";
import { effectiveEnforcement, enforcementWeakenings } from "./standards-enforcement-diff.mjs";
import { readVerify, readVerifyFromPath, readFrameworkVersions, readFrameworkVersionsFromPath } from "./devflow-config.mjs";
import { inlineSafe } from "./untrusted-frame.mjs";
import { CODEOWNERS_MAX_BYTES } from "./standards-label-approval.mjs";
import { gitRun, gitFailed, gitWhy, resolveMergeBase, materializeBlobs, quote } from "./standards-git.mjs";

const REGULAR = new Set(["100644", "100755"]);
const SYMLINK = "120000";
// Tetos de leitura dos blobs da base: um std, o standards.local.yaml e o .devflow.yaml são
// pequenos; o CODEOWNERS do GitHub tem limite de 3 MB.
const TEXT_MAX_BYTES = 4 * 1024 * 1024;
// Varredura dos caminhos da catraca na árvore: limitada, e o estouro é erro (não "conferido").
const MAX_WALK = 5000;
const MAX_DEPTH = 16;
// Caminhos por chamada de `hash-object` (cada chamada tem o próprio teto de tempo).
const BATCH = 500;
// Teto de notas repetitivas no log (mudança não commitada, link ou submódulo não avaliado).
const MAX_NOTES = 20;
/** Classes de violação, na ordem em que o gate as lista: as de baseline ficam por último. */
export const VIOLATION_KINDS = Object.freeze(["std", "versões", "linter", "shim", "verify", "link", "baseline"]);
const ABSENT_RE = /does not exist in|exists on disk, but not in/;

// Texto do projeto (caminho, id, regra) vai para o log do CI: uma linha, sem controle.
const t = (s) => inlineSafe(s, 200);
const posixRel = (root, abs) => relative(root, abs).split(sep).join("/");

function must(r, what) {
  if (gitFailed(r)) throw new Error(`git ${what} falhou (${gitWhy(r)})`);
  return r.stdout;
}

// Registros "<modo> <tipo> <sha>[ <tamanho>]\t<caminho>" de um `ls-tree -z` (com ou sem `-l`).
function parseTree(out) {
  const entries = [];
  for (const rec of String(out).split("\0")) {
    const tab = rec.indexOf("\t");
    if (tab < 0) continue;
    const [mode, type, sha, size] = rec.slice(0, tab).split(/ +/);
    entries.push({ mode, type, sha, size: /^\d+$/.test(size || "") ? Number(size) : undefined, path: rec.slice(tab + 1) });
  }
  return entries;
}

// O que uma entrada de árvore é: arquivo comum, link simbólico, submódulo ou outra coisa.
const kindOf = (e) => (e.type === "commit" ? "gitlink" : e.mode === SYMLINK ? "link" : e.type === "blob" && REGULAR.has(e.mode) ? "file" : "other");

// Prefixo do projeto dentro do repositório ("" na raiz, "sub/" num subdiretório).
function showPrefix(root, run) {
  return must(run(root, ["rev-parse", "--show-prefix"]), "rev-parse --show-prefix").replace(/\n$/, "");
}

// Entrada de `fullPath` (relativo à raiz do repositório) na árvore de `rev`, ou null.
function entryAt(root, rev, fullPath, run) {
  const out = must(run(root, ["ls-tree", "-z", "--full-tree", rev, "--", fullPath]), "ls-tree");
  return parseTree(out).find(e => e.path === fullPath) || null;
}

/**
 * Primeiro componente de `rel` (relativo ao projeto) que, na árvore de `rev`, é link simbólico
 * (modo 120000) ou submódulo (160000) — `{path, what}` — ou null. Atrás de um dos dois, o git
 * não guarda o conteúdo que o disco tinha: um `git cat-file -e <rev>:<rel>` diz "não existe"
 * tanto para um caminho ausente quanto para um que passa por um link, e só o segundo é
 * suspeito. Vai componente a componente a partir da raiz do REPOSITÓRIO. Lança em erro de git.
 */
export function opaqueComponent(root, rev, rel, { run = gitRun, prefix = showPrefix(root, run) } = {}) {
  let cur = "";
  for (const part of `${prefix}${rel}`.split("/").filter(Boolean)) {
    cur = cur ? `${cur}/${part}` : part;
    const e = entryAt(root, rev, cur, run);
    if (!e) return null; // ausente: o resto do caminho também não existe
    if (e.mode === SYMLINK || e.type === "commit") {
      return { path: cur.startsWith(prefix) ? cur.slice(prefix.length) : cur, what: e.mode === SYMLINK ? "link simbólico" : "submódulo" };
    }
    if (e.type !== "tree") return null; // arquivo comum: fim do caminho
  }
  return null;
}

/**
 * Baseline do commit `mb`, pelo caminho LÓGICO do baseline:
 *  - `{state: "present", text, where}`;
 *  - `{state: "absent"}` — só quando `git cat-file -e` confirma que o caminho não existe;
 *  - `{state: "symlink", component, what}` — algum componente do caminho é link simbólico (ou
 *    submódulo) na base: a base tinha o diretório como link e a branch pode tê-lo trocado por
 *    um diretório real — não é adoção;
 *  - `{state: "error", detail}` — timeout ou erro do git que não confirma a ausência.
 * Lança se o blob existe e não pôde ser lido.
 */
export function baselineAtBase(root, mb, { run = gitRun } = {}) {
  const rel = baselineLogicalRel(root);
  let link;
  try { link = opaqueComponent(root, mb, rel, { run }); } catch (e) { return { state: "error", detail: e.message }; }
  if (link) return { state: "symlink", component: link.path, what: link.what };
  const spec = `${mb}:./${rel}`; // relativo ao -C (projectRoot), não ao toplevel
  const ex = run(root, ["cat-file", "-e", spec]);
  if (gitFailed(ex)) {
    if (!ex.error && !ex.signal && ABSENT_RE.test(ex.stderr || "")) return { state: "absent" };
    return { state: "error", detail: `git cat-file falhou para ${spec} (${gitWhy(ex)})` };
  }
  const sh = run(root, ["show", spec], { maxBuffer: BASELINE_MAX_BYTES });
  if (gitFailed(sh)) throw new Error(`git show ${spec} falhou (${gitWhy(sh)})`);
  return { state: "present", text: sh.stdout, where: `${mb.slice(0, 8)}:${rel}` };
}

// Primeiro componente (abaixo da raiz) de `parts` que é link simbólico na ÁRVORE, ou null.
function firstSymlink(root, parts) {
  let cur = root;
  for (const part of parts) {
    cur = join(cur, part);
    let st;
    try { st = lstatSync(cur); } catch { return null; }
    if (st.isSymbolicLink()) return posixRel(root, cur);
  }
  return null;
}

// Acesso à árvore de um commit (`rev`), com caminhos relativos ao projeto.
function treeAt(root, rev, run, prefix) {
  const full = (rel) => `${prefix}${rel}`;
  return {
    root, rev, run, prefix,
    entry: (rel) => entryAt(root, rev, full(rel), run),
    // Entrada pelo caminho relativo à raiz do REPOSITÓRIO (CODEOWNERS).
    entryFromTop: (path) => entryAt(root, rev, path, run),
    // Filhos diretos de um diretório.
    children: (relDir) => parseTree(must(run(root, ["ls-tree", "-z", "--full-tree", rev, "--", `${full(relDir)}/`]), "ls-tree"))
      .filter(e => e.path.startsWith(`${full(relDir)}/`))
      .map(e => ({ ...e, name: e.path.slice(full(relDir).length + 1) })),
    // Arquivos, links e submódulos sob um diretório ("" = o projeto inteiro), com `rel` relativo ao projeto.
    all: (relDir) => {
      const scope = relDir ? `${full(relDir)}/` : prefix;
      const args = ["ls-tree", "-r", "-l", "-z", "--full-tree", rev, ...(scope ? ["--", scope] : [])];
      return parseTree(must(run(root, args), "ls-tree -r"))
        .filter(e => (e.type === "blob" || e.type === "commit") && e.path.startsWith(scope))
        .map(e => ({ ...e, rel: e.path.slice(prefix.length) }));
    },
    text: (e, maxBuffer = TEXT_MAX_BYTES) => must(run(root, ["cat-file", "blob", e.sha], { maxBuffer }), "cat-file blob"),
  };
}

// Texto do arquivo comum `rel` na árvore `g`, ou null (ausente, link ou outro tipo).
function treeText(g, rel) {
  const e = g.entry(rel);
  return e && kindOf(e) === "file" ? g.text(e) : null;
}

/**
 * Achados da árvore do merge-base, contados por impressão digital (que não depende do
 * diretório: caminho relativo + mensagem sem raiz, T5/T6).
 *
 * A árvore é materializada num tmpdir pelos BYTES dos blobs (`git cat-file`, sem atributos nem
 * filtros): só arquivos comuns — um link simbólico da base nunca é criado, então nada fora do
 * tmp é lido —, e um `.gitattributes` da branch não muda o que a base tinha. Os linters
 * executados são os de `machine/` da base e os do plugin; os da branch não rodam nesta passada.
 *
 * É o único jeito de analisar a base: serve à conferência da adoção e ao crédito do baseline
 * limitado pela base. A árvore é sempre materializada inteira (um linter pode ler arquivos
 * vizinhos); `only` (um Set de caminhos relativos ao projeto) restringe só QUAIS arquivos são
 * analisados — o crédito passa os caminhos das entradas do baseline da base, porque a impressão
 * digital inclui o caminho e só o arquivo da entrada pode dar lastro a ela; a adoção analisa
 * tudo. `what` completa a mensagem do erro (o que deixou de ser conferido).
 *
 * A árvore só tem o que está no git: um linter do projeto que dependa de pacote instalado e não
 * versionado não carrega aqui, e isso é erro. O linter tem de ser autocontido — só `node:*` e
 * imports relativos para dentro de `machine/`. O que ele carrega de fora de `machine/` e de
 * `node_modules` sob `.context/` (pacote da raiz, import relativo para fora) não é comparado com
 * a base: um PR pode alterá-lo sem tocar na catraca (resíduo declarado no guia e na ADR-015).
 */
async function baseFindings(g, baseAll, { what = "a adoção do baseline", only = null } = {}) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "devflow-base-")));
  try {
    const tree = join(tmp, "tree");
    mkdirSync(tree);
    const regular = baseAll.filter(e => kindOf(e) === "file");
    materializeBlobs(g.root, regular, tree, { run: g.run });
    const files = regular.map(e => e.rel).filter(rel => !only || only.has(rel));
    const r = await checkFiles({ projectRoot: tree, files, baseline: null });
    if (r.errors.length) {
      const ids = [...new Set(r.errors.map(e => t(e.stdId)))].join(", ");
      throw new Error(`linters falharam na árvore da base (${ids}): não dá para conferir ${what}. `
        + "O linter do projeto tem de ser autocontido: só node:* e imports relativos para dentro de machine/ "
        + "(dependência versionada, só em node_modules dentro de um dos diretórios de standards, onde o gate a compara com a base e o CODEOWNERS gerado lhe dá dono; o PR que a acrescenta pede override). "
        + "Se o linter da base está quebrado, o conserto entra na branch base com bypass de administrador");
    }
    return [...r.blocking, ...r.warnings, ...r.review];
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Arquivos sob `dirAbs` na árvore: Map<rel POSIX, {kind: "file"|"link"|"other", target?}>.
// Não desce por link simbólico.
function walkTree(dirAbs) {
  const out = new Map();
  let budget = MAX_WALK;
  const walk = (dir, depth, relBase) => {
    let names = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const n of names.sort()) {
      if (budget-- <= 0 || depth > MAX_DEPTH) throw new Error(`${dirAbs} tem arquivos demais para conferir (teto de ${MAX_WALK} entradas, ${MAX_DEPTH} níveis)`);
      const p = join(dir, n);
      const rel = relBase ? `${relBase}/${n}` : n;
      let st;
      try { st = lstatSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, depth + 1, rel);
      else if (st.isSymbolicLink()) out.set(rel, { kind: "link", target: readlinkSync(p) });
      else out.set(rel, { kind: st.isFile() ? "file" : "other" });
    }
  };
  walk(dirAbs, 0, "");
  return out;
}

// O que há em `rel` no disco, sem seguir link no último componente: {kind, target?} ou null.
function onDisk(root, rel) {
  try {
    const st = lstatSync(join(root, rel));
    if (st.isSymbolicLink()) return { kind: "link", target: readlinkSync(join(root, rel)) };
    return { kind: st.isFile() ? "file" : st.isDirectory() ? "dir" : "other" };
  } catch { return null; }
}

// Hash de blob do git dos BYTES do arquivo na árvore (sem os filtros do `.gitattributes`), na ordem pedida.
function hashRaw(root, rels, run) {
  const shas = [];
  for (let i = 0; i < rels.length; i += BATCH) {
    const chunk = rels.slice(i, i + BATCH);
    const out = must(run(root, ["hash-object", "--no-filters", "--", ...chunk.map(r => `./${r}`)]), "hash-object").split("\n").filter(Boolean);
    if (out.length !== chunk.length) throw new Error("git hash-object falhou (saída incompleta)");
    shas.push(...out);
  }
  return shas;
}
const hashText = (root, text, run) => must(run(root, ["hash-object", "--stdin"], { input: text }), "hash-object --stdin").trim();

/**
 * Onde a ÁRVORE difere do HEAD nos caminhos que o gate lê do disco (`dirs` inteiros e `files`):
 * bytes diferentes do blob, arquivo que não está no HEAD, arquivo do HEAD ausente, link trocado.
 * @returns {{rel: string, why: string}[]}
 */
function driftFromHead(root, h, { dirs, files }, run) {
  const drift = [], pending = [];
  const add = (rel, why) => drift.push({ rel, why });
  const one = (rel, e, c) => {
    if (e && e.type === "commit") return; // submódulo: o ponteiro é do HEAD; o conteúdo no disco cai como "não está no HEAD"
    if (!e) return add(rel, "não está no HEAD");
    if (!c) return add(rel, "difere do blob do HEAD: ausente na árvore");
    if (e.mode === SYMLINK) {
      if (c.kind !== "link" || hashText(root, c.target, run) !== e.sha) add(rel, "difere do blob do HEAD: link simbólico trocado");
      return undefined;
    }
    if (c.kind !== "file") return add(rel, "difere do blob do HEAD: não é arquivo comum");
    return pending.push([rel, e.sha]);
  };
  for (const dirRel of dirs) {
    // Um componente do caminho que é link (no disco ou no HEAD): confere o próprio componente e não desce.
    const diskLink = firstSymlink(root, dirRel.split("/"));
    const headOpaque = opaqueComponent(root, h.rev, dirRel, { run, prefix: h.prefix });
    if (diskLink || headOpaque) {
      const rel = diskLink || headOpaque.path;
      const e = h.entry(rel);
      if (!e || e.type !== "commit") one(rel, e || undefined, onDisk(root, rel) || undefined);
      continue;
    }
    const head = new Map(h.all(dirRel).map(e => [e.rel, e]));
    const disk = new Map([...walkTree(join(root, dirRel))].map(([rel, c]) => [`${dirRel}/${rel}`, c]));
    for (const [rel, e] of head) one(rel, e, disk.get(rel));
    for (const [rel, c] of disk) if (!head.has(rel)) one(rel, undefined, c);
  }
  for (const rel of files) {
    const e = h.entry(rel), c = onDisk(root, rel);
    if (e || c) one(rel, e || undefined, c || undefined);
  }
  hashRaw(root, pending.map(([rel]) => rel), run).forEach((sha, k) => {
    if (sha !== pending[k][1]) add(pending[k][0], "difere do blob do HEAD");
  });
  return drift;
}

const stemOf = (name) => { const i = name.lastIndexOf("."); return i > 0 ? name.slice(0, i) : name; };

// Por que um arquivo NOVO de machine/ pode sombrear um módulo que a base já tinha, ou null.
// `baseKids`: Map<dir, Map<nome, "file"|"dir">> com o que cada diretório tinha na base.
function shadowReason(rel, baseKids) {
  const kids = baseKids.get(posix.dirname(rel));
  if (!kids) return null; // diretório novo: nada da base para sombrear
  const name = posix.basename(rel);
  if (name === "package.json") return "package.json num diretório que já existia na base muda como os módulos dele são carregados";
  if (/^index\.[^/]+$/.test(name)) return "index.* num diretório que já existia na base passa a ser o módulo do diretório";
  const stem = stemOf(name);
  for (const [k, kind] of kids) {
    if (k === name) continue;
    if ((kind === "dir" && k === stem) || (kind === "file" && stemOf(k) === stem)) return `mesmo nome de módulo que ${t(k)}${kind === "dir" ? "/" : ""} da base`;
  }
  return null;
}

/**
 * `machine/` do HEAD × `machine/` da base, pelo hash de blob das árvores (nunca por mtime nem
 * pelo disco). Alterado, removido, submódulo ou arquivo NOVO → violação. O check não analisa
 * `machine/`: se arquivo novo fosse só nota, um PR estacionava ali código de aplicação que viola
 * um standard `block` e o gate saía verde. Só sob `adoption` (a base não tem nada em nenhum dos
 * diretórios de standards; quem decide é `compareRatchet`, pela árvore da base) o arquivo novo que
 * não colide com nada é nota. `touched` recebe o que não é o arquivo da base.
 */
function compareMachine(base, head, mrel, { violation, notice }, touched, { adoption = false } = {}) {
  const baseKids = new Map();
  for (const rel of base.keys()) {
    const segs = rel.slice(mrel.length + 1).split("/");
    for (let i = 0, dir = mrel; i < segs.length; dir = `${dir}/${segs[i]}`, i++) {
      if (!baseKids.has(dir)) baseKids.set(dir, new Map());
      baseKids.get(dir).set(segs[i], i === segs.length - 1 ? "file" : "dir");
    }
  }
  for (const [rel, e] of base) {
    const c = head.get(rel);
    if (!c) { violation("linter", `linter removido: ${t(rel)}`); continue; }
    if (c.sha !== e.sha || kindOf(c) !== kindOf(e)) { violation("linter", `linter alterado: ${t(rel)} (exige revisão humana)`); touched.add(rel); }
  }
  for (const [rel, c] of head) {
    const kind = kindOf(c);
    if (kind === "gitlink") { violation("linter", `submódulo em machine/: ${t(rel)} (o conteúdo fica fora do alcance da catraca)`); touched.add(rel); continue; }
    if (base.has(rel)) continue;
    touched.add(rel);
    if (rel.split("/").includes("node_modules")) continue; // tratado como node_modules, abaixo
    if (kind !== "file") { violation("linter", `linter novo, mas não é arquivo comum (link simbólico): ${t(rel)}`); continue; }
    const why = shadowReason(rel, baseKids);
    if (why) violation("linter", `linter novo: ${t(rel)} — pode sombrear um módulo da base (${why})`);
    else if (adoption) notice(`linter novo: ${t(rel)} (não existia na base)`);
    else violation("linter", `linter novo: ${t(rel)} (não existia na base; arquivo novo em machine/ exige revisão humana)`);
  }
}

/**
 * Compara a catraca do HEAD (e da árvore) com a do commit da base.
 *
 * - baseline: removido → violação; aceita mais que a base por impressão digital → violação;
 *   adoção (a base não tem baseline): cada entrada precisa caber nos achados da árvore da base;
 *   sob `ci`, com entradas no baseline da base, os arquivos da base que têm entrada são
 *   analisados (`baseFindings`): o crédito de uma entrada só vale até o que a base produz (quem
 *   aplica é o `gate`);
 * - link simbólico no caminho do baseline, de standards/, de machine/ ou do shim na árvore →
 *   violação; o mesmo na BASE (fora do caminho do baseline) → violação: não dá para comparar;
 * - enforcement efetivo: base simulada com os `.md` e o `standards.local.yaml` do merge-base, e
 *   a faixa de versão com o `.devflow.yaml` de cada lado;
 * - `machine/**`, nos dois layouts (árvore do HEAD × árvore da base): alterado, removido,
 *   submódulo ou arquivo novo → violação. Exceção única, a adoção dos standards — a base não tem
 *   nada em nenhum dos dois diretórios de standards —, em que o arquivo novo que não colide é
 *   nota. O shim: alterado ou removido → violação; novo → nota;
 * - `node_modules` versionado sob `.context/` que difere da base → violação;
 * - `verify.standards` removido → violação.
 *
 * Sob `ci`: a base é resolvida sem ambiguidade e tem de ser ancestral do HEAD; os caminhos da
 * catraca na árvore têm de ser byte a byte os blobs do HEAD; e o que não dá para conferir lança
 * (exit 3 no CLI) — sem base, link simbólico no caminho do baseline da base, erro ou timeout do
 * git. Sem `ci` (fase V local), a falta de merge-base, o baseline da base ilegível e a mudança
 * não commitada viram nota; qualquer outro erro de git lança nos dois modos. `baseRef` vazio ou
 * começando com "-" → `UsageError`.
 *
 * `items` são as violações com a classe (`VIOLATION_KINDS`); `violations`, só os textos, com as
 * de baseline por último. `untrustedLinters`/`untrustedLinterDirs` dizem quais linters do
 * projeto não são os da base (o gate os roda DEPOIS dos que já existiam). `baselineIncreases`
 * são as entradas do baseline que aceitam mais que a base. `baseFindings` são os achados dos
 * linters da base sobre os arquivos da árvore da base que têm entrada no baseline — o lastro do
 * crédito —, ou null quando a base não foi analisada para isso (sem `ci`, base sem baseline ou
 * com o baseline sem entradas).
 * `headBlobs` são os arquivos comuns do
 * HEAD (o que o check do CI linta); `headShas`, os commits que valem como head do PR — o HEAD e,
 * só quando ele é um merge de exatamente dois pais cujo primeiro é a base, o segundo pai;
 * `changedRatchetFiles`, os arquivos da catraca que o PR alterou em relação à base (removidos e
 * renomeados inclusive), relativos à raiz do repositório: é deles que o aprovador do override
 * tem de ser dono.
 *
 * @returns {Promise<{violations: string[], items: {kind: string, text: string}[], notices: string[],
 *   codeownersText: string|null, mergeBase: string, untrustedLinters: string[], untrustedLinterDirs: string[],
 *   baselineIncreases: object[], baseFindings: object[]|null, headBlobs: object[], headShas: string[],
 *   changedRatchetFiles: string[]}>}
 */
export async function compareRatchet(root, baseRef, { ci = false, run = gitRun } = {}) {
  const items = [], notices = [];
  const violation = (kind, text) => items.push({ kind, text });
  const notice = (text) => notices.push(text);
  const out = { violation, notice };
  const result = (extra) => {
    const ordered = [...items].sort((a, b) => VIOLATION_KINDS.indexOf(a.kind) - VIOLATION_KINDS.indexOf(b.kind));
    return {
      violations: ordered.map(v => v.text), items: ordered, notices, codeownersText: null, mergeBase: "",
      untrustedLinters: [], untrustedLinterDirs: [], baselineIncreases: [], baseFindings: null, headBlobs: [], headShas: [],
      changedRatchetFiles: [], ...extra,
    };
  };
  const { mb, why } = resolveMergeBase(root, baseRef, { run, ci });
  if (!mb) {
    if (ci) throw new Error(`merge-base com ${quote(baseRef)} não resolve (fail-closed em CI): ${why}`);
    notice(`sem merge-base com ${quote(baseRef)}: catraca não comparada (local)`);
    return result({});
  }
  const short = mb.slice(0, 8);
  const prefix = showPrefix(root, run);
  const g = treeAt(root, mb, run, prefix);     // a base
  const h = treeAt(root, "HEAD", run, prefix); // o que foi commitado
  const cp = contextPaths(root);
  const cfgRel = ".context/.devflow.yaml";
  const localRel = posixRel(root, cp.standardsLocalYaml);
  const shimRel = ".context/bin/devflow-standards.mjs";
  const stdDirs = resolveReadPaths(root, "standards", { includeMissing: true }); // canônico e legado
  const stdRels = stdDirs.map(d => posixRel(root, d));
  const touched = new Set(), unchecked = [];

  // 0) a árvore tem de ser o HEAD nos caminhos que o loader e os linters leem do disco
  const drift = driftFromHead(root, h, {
    dirs: [...stdRels, ".context/node_modules", ".context/engineering/node_modules"], files: [localRel, cfgRel],
  }, run);
  if (drift.length) {
    const list = drift.slice(0, 5).map(d => `${t(d.rel)} (${d.why})`).join("; ") + (drift.length > 5 ? `; … e mais ${drift.length - 5}` : "");
    if (ci) throw new Error(`a árvore não confere com o HEAD em caminho da catraca: ${list}; recusado em CI (fail-closed)`);
    for (const d of drift.slice(0, MAX_NOTES)) notice(`mudança não commitada em caminho da catraca: ${t(d.rel)} (${d.why}) — o gate do CI compara o que foi commitado`);
    if (drift.length > MAX_NOTES) notice(`… e mais ${drift.length - MAX_NOTES} mudança(s) não commitada(s) em caminho da catraca`);
    for (const d of drift) touched.add(d.rel);
  }

  // 1) links simbólicos na árvore: caminho do baseline, standards/, machine/ e o diretório do shim
  const links = new Set();
  const noteLink = (parts) => { const l = firstSymlink(root, parts); if (l) links.add(l); return l; };
  noteLink(baselineLogicalRel(root).split("/"));
  for (const rd of stdRels) if (noteLink([...rd.split("/"), "machine"])) unchecked.push(`${rd}/machine/`);
  noteLink(shimRel.split("/").slice(0, -1));
  for (const l of links) violation("link", `link simbólico no caminho da catraca: ${t(l)} (a catraca não segue links)`);

  // 1b) links simbólicos (e submódulos) na BASE, fora do caminho do baseline (esse é do passo
  // 2). Pelo caminho lógico, o que ficava atrás do link "não existia" na base: trocar o link
  // por um diretório ou arquivo real com um std rebaixado, um linter trocado ou sem
  // `verify.standards` passaria sem diferença nenhuma. Não dá para comparar → violação, que só
  // o dono do caminho libera.
  const baselineRel = baselineLogicalRel(root);
  const baseLinks = new Map();
  for (const rel of [...stdRels.map(rd => `${rd}/machine`), localRel, cfgRel, shimRel]) {
    const l = opaqueComponent(root, mb, rel, { run, prefix });
    if (l && !`${baselineRel}/`.startsWith(`${l.path}/`)) baseLinks.set(l.path, l.what);
  }
  for (const [l, what] of baseLinks) violation("link", `a base ${short} tinha ${what} no caminho da catraca (${t(l)}): o que ficava atrás dele não dá para comparar (exige revisão humana)`);

  // 2) baseline
  const baseAll = g.all("");
  const baselineIncreases = [];
  let backing = null; // achados da árvore da base: o lastro do crédito do baseline da base
  const b = baselineAtBase(root, mb, { run });
  if (b.state === "symlink" || b.state === "error") {
    const msg = b.state === "symlink"
      ? `${b.what} no caminho do baseline na base ${short} (${quote(b.component)})`
      : `não consegui ler o baseline da base ${short}: ${b.detail}`;
    if (ci) throw new Error(`${msg}; recusado em CI (fail-closed)`);
    notice(`${msg}: baseline não comparado (local)`);
  } else {
    const head = resolveBaseline(root, { run }).baseline; // o da árvore; se sumiu, o do HEAD
    const row = (e, extra = "") => `${t(e.stdId)}/${t(e.ruleId)} em ${t(e.path)} (${e.base} → ${e.head}${extra})`;
    if (b.state === "present") {
      const base = parseBaseline(b.text, b.where);
      // Crédito limitado pela base (sob --ci): uma entrada só vale até o que os linters DA BASE
      // produzem na árvore DA BASE. Sem isto, a entrada que ficou depois de a violação ser
      // corrigida (ninguém rodou `prune`) cobria a mesma violação reintroduzida no mesmo arquivo,
      // com o baseline intacto e sem aprovação de dono. Sobrar crédito não é violação: vira nota.
      // Linter da base que falha lança (exit 3): sem os achados não há como saber o lastro.
      // Só os arquivos com entrada no baseline da base são analisados: nenhum outro pode produzir
      // a impressão digital de uma entrada, então o lastro é o mesmo da árvore inteira. O que
      // muda é o alcance do erro: linter que falha num arquivo sem entrada não é visto aqui.
      if (ci && base.entries.length) {
        backing = await baseFindings(g, baseAll, { what: "o crédito do baseline", only: new Set(base.entries.map(e => e.path)) });
        const unbacked = compareCounts(base, initBaseline(backing, {})).length;
        if (unbacked) notice(`baseline da base ${short}: ${unbacked} entrada(s) aceitam mais ocorrências do que a árvore da base produz (crédito sem lastro); o excedente não cobre ocorrência do HEAD — o baseline prune o remove`);
      }
      // Na linha do aumento, o lastro quando ele é menor que a contagem da base: sob override
      // aprovado a entrada aumentada vale pela contagem aprovada, e o dono precisa ver que está
      // revalidando crédito que a base já não sustenta. Com lastro inteiro, entrada nova ou sem
      // a análise da base (local), a linha fica "(base → head)".
      const produced = new Map();
      for (const f of backing || []) produced.set(f.fp, (produced.get(f.fp) || 0) + 1);
      const lastro = (e) => (backing && e.base > (produced.get(e.fp) || 0) ? `; a árvore da base produz ${produced.get(e.fp) || 0}` : "");
      if (!head) violation("baseline", "baseline.json removido (a base tinha baseline)");
      else for (const e of compareCounts(head, base)) { baselineIncreases.push(e); violation("baseline", `baseline aceita a mais: ${row(e, lastro(e))}`); }
    } else if (head) {
      // Adoção: o baseline novo só pode aceitar o que o engine acha na árvore da base.
      const allowed = initBaseline(await baseFindings(g, baseAll), {});
      for (const e of compareCounts(head, allowed)) { baselineIncreases.push(e); violation("baseline", `baseline de adoção aceita o que a base não tinha: ${row(e)}`); }
      notice("baseline introduzido nesta branch (adoção): exige revisão do dono (CODEOWNERS)");
    }
  }

  // 3) enforcement efetivo, com a aplicabilidade por faixa de versão de cada lado
  const files = new Map();
  for (const d of stdDirs) {
    const inBase = new Map(g.children(posixRel(root, d)).filter(e => e.name.endsWith(".md")).map(e => [e.name, e]));
    // Link ou outro tipo na base: o loader o pulava (não segue link) → ausente.
    for (const [n, e] of inBase) files.set(join(d, n), kindOf(e) === "file" ? g.text(e) : null);
    let onDiskNames = [];
    try { onDiskNames = readdirSync(d); } catch { /* diretório não existe na árvore */ }
    for (const n of onDiskNames) if (n.endsWith(".md") && !inBase.has(n)) files.set(join(d, n), null); // não existia na base
  }
  const localBase = treeText(g, localRel);
  const cfgBase = treeText(g, cfgRel);
  const trusted = trustedPluginRoot() ?? null; // null, nunca undefined: undefined reativa CLAUDE_PLUGIN_ROOT
  const before = effectiveEnforcement(loadStandardsMerged(root, trusted, { files, localYaml: localBase }), { versions: readFrameworkVersions(cfgBase ?? "") });
  const after = effectiveEnforcement(loadStandardsMerged(root, trusted), { versions: readFrameworkVersionsFromPath(join(root, cfgRel)) });
  for (const w of enforcementWeakenings(before, after)) violation(/faixa de versão/.test(w) ? "versões" : "std", w);

  // 4) linters do projeto (tudo sob machine/), node_modules sob .context/ e o shim — HEAD × base
  // Arquivo novo em machine/ é violação nos dois layouts, inclusive no que a base não usa. A
  // exceção é a adoção dos standards, decidida SÓ pela árvore da base: nenhum dos dois
  // diretórios de standards existe nela, e o caminho deles não passa por link nem submódulo (que
  // esconderia conteúdo). É mais estrita que a "adoção" do passo 2 (a base não tem baseline, mas
  // pode ter standards e linters): ali um arquivo novo em machine/ continua sendo violação.
  const adoption = stdRels.every(rd => !g.entry(rd) && !opaqueComponent(root, mb, rd, { run, prefix }));
  for (const rd of stdRels) {
    const mrel = `${rd}/machine`;
    compareMachine(new Map(g.all(mrel).map(e => [e.rel, e])), new Map(h.all(mrel).map(e => [e.rel, e])), mrel, out, touched, { adoption });
  }
  // Um `node_modules` entre `.context/` e `machine/` responde ao `require("pacote")` do linter
  // antes do `node_modules` do projeto: se algo ali não é o que a base tinha, é violação.
  const inNodeModules = (list) => new Map(list.filter(e => e.rel.split("/").includes("node_modules")).map(e => [e.rel, e]));
  const nmBase = inNodeModules(g.all(".context")), nmHead = inNodeModules(h.all(".context"));
  const nmRoots = new Map();
  for (const rel of new Set([...nmBase.keys(), ...nmHead.keys()])) {
    const a = nmBase.get(rel), c = nmHead.get(rel);
    if (a && c && a.sha === c.sha && kindOf(a) === kindOf(c)) continue;
    const segs = rel.split("/");
    const nmRoot = segs.slice(0, segs.indexOf("node_modules") + 1).join("/");
    nmRoots.set(nmRoot, (nmRoots.get(nmRoot) || 0) + 1);
  }
  for (const [nmRoot, n] of nmRoots) {
    violation("linter", `node_modules versionado sob .context/ difere da base: ${t(nmRoot)} (${n} arquivo(s) novo(s), alterado(s) ou removido(s)) — pode sombrear a dependência de um linter`);
  }
  if (nmRoots.size) unchecked.push(".context/"); // qualquer linter do projeto pode depender dele
  const shimBase = g.entry(shimRel), shimHead = h.entry(shimRel);
  if (shimBase && !shimHead) violation("shim", `shim removido: ${shimRel}`);
  else if (shimBase && (shimBase.sha !== shimHead.sha || kindOf(shimBase) !== kindOf(shimHead))) violation("shim", `shim alterado: ${shimRel} (exige revisão humana)`);
  else if (!shimBase && shimHead && kindOf(shimHead) !== "file") violation("shim", `shim novo, mas não é arquivo comum (link simbólico ou submódulo): ${shimRel}`);
  else if (!shimBase && shimHead) notice(`shim novo: ${shimRel} (não existia na base)`);

  // 5) contrato verify.standards
  let had = false, has = false;
  try { had = cfgBase !== null && Boolean(readVerify(cfgBase).signals.standards); } catch { /* verify: inválido na base */ }
  try { has = Boolean(readVerifyFromPath(join(root, cfgRel)).signals.standards); } catch { /* inválido na árvore = sem o sinal */ }
  if (had && !has) violation("verify", "verify.standards removido do .devflow.yaml");

  // 6) o que o check NÃO avalia: link simbólico ou submódulo novo fora dos diretórios de standards
  const headAll = h.all("");
  const baseKinds = new Map(baseAll.map(e => [e.rel, kindOf(e)]));
  const inStandards = (rel) => stdRels.some(rd => rel === rd || rel.startsWith(`${rd}/`));
  const opaque = headAll.filter(e => (kindOf(e) === "link" || kindOf(e) === "gitlink") && !inStandards(e.rel) && baseKinds.get(e.rel) !== kindOf(e));
  for (const e of opaque.slice(0, MAX_NOTES)) {
    notice(`não avaliado: ${t(e.rel)} (${kindOf(e) === "gitlink" ? "submódulo novo: o conteúdo não é lintado" : "link simbólico novo: o alvo não é lintado pelo link"})`);
  }
  if (opaque.length > MAX_NOTES) notice(`não avaliado: … e mais ${opaque.length - MAX_NOTES} link(s) ou submódulo(s) novo(s)`);

  // CODEOWNERS da BASE (ordem do GitHub). O primeiro que existe decide; se não for arquivo
  // comum, não há dono confiável. Com 3 MB ou mais o GitHub ignora o arquivo inteiro: aqui ele
  // também vale como ausente (o tamanho vem do git, antes de ler o conteúdo).
  let codeownersText = null;
  for (const p of [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"]) {
    const e = g.entryFromTop(p);
    if (!e) continue;
    if (kindOf(e) === "file") {
      const size = Number(must(run(root, ["cat-file", "-s", e.sha]), "cat-file -s").trim());
      if (!Number.isSafeInteger(size)) throw new Error(`git cat-file -s devolveu um tamanho ilegível para ${t(p)}`);
      if (size >= CODEOWNERS_MAX_BYTES) notices.push(`CODEOWNERS da base (${t(p)}) tem ${size} bytes — 3 MB ou mais: o GitHub ignora o arquivo inteiro; tratado como ausente, sem responsável para o override`);
      else codeownersText = g.text(e);
    }
    break;
  }
  // Commits que valem como head do PR para o override. O próprio HEAD, sempre. O segundo pai,
  // só quando o HEAD é um merge de EXATAMENTE dois pais cujo primeiro é a base resolvida — a
  // merge ref que o CI testa. Um commit de três pais, ou cujo primeiro pai não é a base, não leva
  // a aprovação dada ao HEAD^2 para um conteúdo que ninguém aprovou.
  // Resíduo declarado (fora do modelo): um merge com esses dois pais e uma árvore que não é a do
  // merge deles passa; para montá-lo é preciso controlar o HEAD em que o CI roda. A conferência
  // por `git merge-tree --write-tree` saiu: dava falsa recusa (git < 2.38, timeout, `-merge`).
  const [headSha, ...parents] = must(run(root, ["rev-list", "--parents", "-n", "1", "HEAD"]), "rev-list --parents").trim().split(/\s+/);
  const headShas = [headSha];
  if (parents.length === 2 && parents[0] === mb) headShas.push(parents[1]);

  // Arquivos da catraca que o PR alterou em relação à base: standards/ (canônico e legado, com
  // machine/ e o baseline), standards.local.yaml, .devflow.yaml — e também o shim e qualquer
  // node_modules sob .context/, que o gate acusa. Sem detecção de renomeação: um arquivo
  // renomeado conta pelos DOIS nomes, e um removido conta pelo nome que tinha.
  const isRatchetFile = (rel) => stdRels.some(rd => rel.startsWith(`${rd}/`)) || rel === localRel || rel === cfgRel || rel === shimRel
    || (rel.startsWith(".context/") && rel.split("/").includes("node_modules"));
  const changedRatchetFiles = must(run(root, ["diff", "--name-only", "-z", "--no-renames", "--no-ext-diff", mb, "HEAD", "--", ".context"]), "diff --name-only")
    .split("\0").filter(p => p && p.startsWith(prefix) && isRatchetFile(p.slice(prefix.length)));

  return result({
    codeownersText, mergeBase: mb, untrustedLinters: [...touched], untrustedLinterDirs: unchecked, baselineIncreases,
    baseFindings: backing, headBlobs: headAll.filter(e => kindOf(e) === "file"), headShas, changedRatchetFiles,
  });
}
