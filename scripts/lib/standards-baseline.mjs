// scripts/lib/standards-baseline.mjs — baseline com catraca (ADR-015 D2).
// Multiconjunto: cada impressão digital tem uma contagem de ocorrências aceitas. O que
// excede a contagem é violação nova — uma ocorrência antiga não isenta as seguintes.
import { createHash, randomBytes } from "node:crypto";
import {
  writeFileSync, mkdirSync, renameSync, realpathSync, lstatSync, readlinkSync, unlinkSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import { contextPaths } from "./context-paths.mjs";
import { readRegularFileDetailed } from "./safe-read.mjs";

export const BASELINE_VERSION = 1;
// Teto do baseline, o MESMO no load e no save (ruling da rodada 1 da T14): uma entrada tem
// ~200–300 bytes, então 16 MiB comporta dezenas de milhares de achados legados sem deixar um
// arquivo gigante (ou /dev/zero) travar o hook. O .devflow.yaml segue com o teto de 1 MiB.
export const BASELINE_MAX_BYTES = 16 * 1024 * 1024;
export class BaselineError extends Error {}

export function baselinePath(projectRoot) {
  return join(contextPaths(projectRoot).standards, "baseline.json");
}

/**
 * Caminho LÓGICO do baseline relativo ao projeto, em POSIX, sem realpath
 * (`.context/engineering/standards/baseline.json`). É o endereço do blob no git
 * (`<rev>:./<lógico>`): o caminho físico da árvore pode passar por um symlink de diretório
 * que não existe na base, e usá-lo transformaria "baseline aumentado" em "adoção".
 */
export function baselineLogicalRel(projectRoot) {
  return relative(projectRoot, baselinePath(projectRoot)).split(sep).join("/");
}

/**
 * Primeiro componente do caminho do baseline (abaixo da raiz do projeto) que é link
 * simbólico na árvore, ou `null`. Componentes inexistentes encerram a varredura.
 */
export function baselineSymlinkComponent(projectRoot) {
  let cur = projectRoot;
  for (const part of baselineLogicalRel(projectRoot).split("/")) {
    cur = join(cur, part);
    let st;
    try { st = lstatSync(cur); } catch { return null; }
    if (st.isSymbolicLink()) return relative(projectRoot, cur).split(sep).join("/");
  }
  return null;
}

export function normalizeMessage(msg) {
  return String(msg || "")
    .replace(/\[[^\]]*\]\s*$/, "")          // sufixo "[caminho]" dos linters legados
    .replace(/\d+/g, "#")                   // contagens, linhas, colunas
    .replace(/\s+/g, " ")
    .trim();
}

const slash = (s) => String(s || "").replace(/\\/g, "/");
// "C:/x", "c:/x" e "/c/x" (MSYS) viram "c:/x". A primeira regex precisa casar tanto "/c/x"
// quanto a raiz nua "/c" (fim de string) — senão a raiz e um caminho abaixo dela recebem
// tratamentos diferentes (a raiz "/p" ficaria intacta enquanto "/p/src/x.ts" virava
// "p:/src/x.ts") e a comparação de prefixo nunca bate.
const drive = (s) => s.replace(/^\/([a-zA-Z])(\/|$)/, (_, d, tail) => `${d.toLowerCase()}:${tail}`).replace(/^([a-zA-Z]):\//, (_, d) => `${d.toLowerCase()}:/`);
const isAbs = (s) => s.startsWith("/") || /^[a-zA-Z]:\//.test(s);

export const REALPATH_MAX_HOPS = 40;
// Erro identificável do estouro de saltos e de ciclo de symlink (achado Important da rodada
// 2, mesma classe do I-3): `realPathOr` NUNCA devolve `p` nesses casos, sempre lança.
export class RealPathLoopError extends Error {}

// Helper único de realpath do plano (decisão R3 do controller — substitui os três helpers
// que estavam espalhados pelo plano: `real` na T5, `realOr` na T6, `realOrParent` na T16).
//
// Algoritmo (ruling da rodada 2 — corrige o achado Important do I-3: a versão anterior
// fazia `join(dirname(cur), target)`, que colapsa ".." LEXICAMENTE, enquanto o kernel
// resolve ".." FISICAMENTE — depois de já ter atravessado qualquer symlink anterior no
// caminho. Com `proj/ext -> outside/deep` e `proj/evil -> "ext/../secret"`, o SO lê
// outside/secret (o ".." sobe a partir de outside/deep, já dentro do alvo do link), mas o
// join lexical cancelava "ext" e o ".." textualmente, devolvendo proj/secret — que parecia
// interno ao projeto. Isso é um bypass de contenção para a T16 (guard da catraca)):
//   1. Tenta `realpathSync.native(p)` — se resolver, é a resposta (o kernel já fez a
//      resolução física correta, "de graça").
//   2. Se `p` não existir por inteiro, resolve o PAI recursivamente — `dirname` não
//      normaliza ".." (é só split textual), então a recursão empurra a resolução física
//      pro `realpathSync.native` do prefixo mais próximo que já existe.
//   3. Monta `cand = rp + sep + basename(p)` por CONCATENAÇÃO, nunca `join`/`normalize` —
//      isso evitaria repetir o mesmo erro lexical de antes.
//   4. Se `cand` for symlink (pendurado ou não), lê o alvo com `readlinkSync` e resolve
//      esse alvo (absoluto usa-se direto; relativo concatena com `rp`) recursivamente —
//      de novo, sem `join`/`normalize`.
//   5. Estoura o limite de saltos (contador passado adiante na recursão) → lança
//      `RealPathLoopError`. Nunca devolve `p` (a versão da rodada 1 devolvia, e esse valor
//      lexical também parecia interno).
export function realPathOr(p, hops = 0) {
  if (hops > REALPATH_MAX_HOPS) {
    throw new RealPathLoopError(`realPathOr: mais de ${REALPATH_MAX_HOPS} saltos de symlink resolvendo ${p}`);
  }
  try {
    return realpathSync.native(p);
  } catch { /* p não existe por inteiro — cai pro fallback físico abaixo */ }
  const parent = dirname(p);
  if (parent === p) return p; // raiz do FS não resolve (não deveria acontecer) — desiste
  const rp = realPathOr(parent, hops);
  const cand = rp === sep ? rp + basename(p) : rp + sep + basename(p);
  let lst;
  try { lst = lstatSync(cand); } catch { return cand; } // não existe nem como symlink
  if (!lst.isSymbolicLink()) return cand; // existe de verdade (não deveria, já que o native
                                            // acima falhou, mas trata como real por segurança)
  const target = readlinkSync(cand);
  const nextPath = isAbsolute(target) ? target : (rp === sep ? rp + target : rp + sep + target);
  return realPathOr(nextPath, hops + 1);
}

// Percorre `p` (já convertido pra "/") componente a componente com `lstatSync`, parando no
// primeiro que não existir (devolve false: sem symlink visto, só inexistência — seguro pra
// confiar no candidato lexical) ou no primeiro que FOR symlink (devolve true: pode haver
// redirecionamento físico escondido, como no PoC7/PoC6 — não confiar no candidato lexical).
// Não reaproveita `realPathOr` porque compara STRINGS resolvidas contra a entrada crua, e
// isso é ambíguo para entrada relativa (ex.: "." vira o cwd absoluto sem symlink nenhum).
function anySymlinkInChain(p) {
  const abs = p.startsWith("/");
  const segs = p.split("/").filter(Boolean);
  let cur = abs ? "/" : "";
  for (const seg of segs) {
    cur = cur === "" ? seg : cur === "/" ? "/" + seg : `${cur}/${seg}`;
    let lst;
    try { lst = lstatSync(cur); } catch { return false; }
    if (lst.isSymbolicLink()) return true;
  }
  return false;
}

const clean = (s) => drive(posix.normalize(slash(s))).replace(/\/+$/, "");

const matchPrefix = (root, cand) => (cand === root ? "" : cand.startsWith(root + "/") ? cand.slice(root.length + 1) : null);

/**
 * Normaliza `p` para um caminho relativo POSIX estável a partir de `projectRoot`, para uso
 * na impressão digital (fingerprint) — NÃO é uma verificação de contenção/segurança em
 * geral: quem precisa dessa garantia deve tratar um `throw` (ver abaixo) e ainda assim
 * considerar o resultado como "melhor esforço", não uma prova formal de contenção.
 *
 * Regra de decisão (a mais conservadora das duas, rodada 2 — achado Important da mesma
 * classe do I-3, PoC7/PoC6): o caminho REAL (via `realPathOr`, sobre `p` NÃO normalizado —
 * normalizar antes colapsaria ".." lexicamente e esconderia um `..` físico depois de um
 * symlink) é a fonte de verdade. Se `realPathOr` lançar (ciclo ou estouro de saltos), trata
 * como FORA do projeto (`null`). Se o par real (raiz real × candidato real) mostrar
 * contenção, usa ele. Só cai pro par lexical (raiz × `p`, ambos crus) quando a cadeia de
 * `p` não passa por symlink NENHUM — nesse caso "real ≠ lexical" só pode ser efeito de
 * `p` ainda não existir (sem link nenhum no meio), o que é seguro: não há
 * redirecionamento físico possível sem um symlink real no disco.
 */
export function toRelPosix(projectRoot, p) {
  const s = slash(p);
  if (!isAbs(s)) {
    const n = posix.normalize(s).replace(/^\.\//, "");
    return n === ".." || n.startsWith("../") ? null : n;
  }
  let realCand, realRoot;
  try {
    realCand = realPathOr(s); // NÃO normalizado — ver JSDoc acima.
    realRoot = realPathOr(projectRoot);
  } catch {
    return null;
  }
  const realHit = matchPrefix(clean(realRoot), clean(realCand));
  if (realHit !== null) return realHit;
  if (anySymlinkInChain(s)) return null;
  return matchPrefix(clean(projectRoot), clean(s));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Linter legado que ecoa o caminho absoluto na mensagem ("… em ${fp}.") faria a impressão
// digital variar por clone, CI e --staged. O engine tira as raízes antes de calcular.
//
// Raízes vazias (e a raiz "/", que vira "" depois de tirar a barra final) são descartadas
// — cortar "/" da mensagem apagaria toda barra de todo caminho nela. Raiz de drive nua
// ("C:\" ou "C:", sem mais nada) é descartada pelo MESMO motivo (achado da rodada 2): sem
// isso, "C:\" cortava qualquer "C:\..." ou "C:/..." da mensagem inteira, não só o prefixo
// do projeto. E a raiz só é cortada quando o caractere seguinte é separador (/, \) ou fim de
// string: sem essa checagem, "/tmp/c1" cortava dentro de "/tmp/c10/x" por ser prefixo
// textual de "c10" (achado menor da rodada 1).
export function stripRoots(message, roots) {
  let m = String(message || "");
  const rs = [...new Set(roots.filter(Boolean).flatMap(r => [String(r), slash(r)]).map(r => r.replace(/[\\/]+$/, "")))]
    .filter(r => r && !/^[a-zA-Z]:$/.test(r))
    .sort((a, b) => b.length - a.length);
  for (const r of rs) m = m.replace(new RegExp(`${escapeRe(r)}(?:[\\\\/]|$)`, "g"), "");
  return m;
}

export function fingerprint({ stdId, ruleId, path, message }) {
  return createHash("sha1")
    .update([stdId, ruleId, path, normalizeMessage(message)].join("\0"))
    .digest("hex");
}

// Duas passadas são propositais: a primeira só confere fp/count e duplicata; a segunda (só
// alcançada se a primeira passar para TODAS as entradas) confere os campos textuais e a
// conferência do fp. Numa passada só, uma entrada minimamente malformada ({fp, count}) já
// lançaria no primeiro elemento do array por causa do stdId ausente, antes de o loop chegar
// no segundo elemento e conseguir detectar que os dois têm a MESMA impressão digital — o
// teste (pré-existente) de duplicata com entradas malformadas exige a mensagem "repetida",
// não a de campo ausente. As checagens novas da rodada 1 (I-2) — stdId/ruleId/path/message
// como string, e fp === fingerprint(entrada) — ficam na segunda passada: sem elas, uma
// entrada com o fp de uma regra e os rótulos (stdId/path) de outra passava batido.
function validate(data, where) {
  if (!data || data.version !== BASELINE_VERSION || !Array.isArray(data.entries)) {
    throw new BaselineError(`baseline inválido (${where}): esperado {"version": 1, "entries": [...]}`);
  }
  const seen = new Set();
  for (const e of data.entries) {
    if (!e || typeof e.fp !== "string" || !Number.isSafeInteger(e.count) || e.count < 1) {
      throw new BaselineError(`baseline inválido (${where}): entrada sem fp ou count ≥ 1`);
    }
    if (seen.has(e.fp)) throw new BaselineError(`baseline inválido (${where}): impressão digital repetida ${e.fp}`);
    seen.add(e.fp);
  }
  for (const e of data.entries) {
    if (typeof e.stdId !== "string" || typeof e.ruleId !== "string" || typeof e.path !== "string" || typeof e.message !== "string") {
      throw new BaselineError(`baseline inválido (${where}): entrada com stdId/ruleId/path/message ausente ou não textual`);
    }
    if (e.fp !== fingerprint(e)) {
      throw new BaselineError(`baseline inválido (${where}): impressão digital não confere com stdId/ruleId/path/message da entrada`);
    }
  }
  return data;
}

export function parseBaseline(text, where = "baseline.json") {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new BaselineError(`baseline inválido (${where}): ${e.message}`); }
  return validate(data, where);
}

// R7 (como em standards-loader.mjs): baseline.json em si nunca pode ser um link simbólico —
// só o achado I-1 já bastaria (um link redireciona load/save para um arquivo qualquer do
// disco), então recusamos com BaselineError em vez de seguir o link silenciosamente.
function refuseIfSymlink(p) {
  let lst;
  try { lst = lstatSync(p); } catch { return null; } // não existe — nada a checar aqui
  if (lst.isSymbolicLink()) {
    throw new BaselineError(`baseline inválido (${p}): link simbólico não é permitido`);
  }
  return lst;
}

// Leitura segura da T9 (ruling da rodada 1 da T14): O_NOFOLLOW (symlink → ELOOP no MESMO
// syscall do open, sem janela TOCTOU), O_NONBLOCK (FIFO não trava o open — antes travava o
// hook síncrono) e fstat exigindo arquivo regular de até BASELINE_MAX_BYTES (dispositivo,
// FIFO, socket, diretório ou arquivo acima do teto → recusados). ENOENT vira null (não
// existe); qualquer outra falha vira BaselineError (exit 3 no CLI, aviso no hook), nunca
// uma exceção crua do fs.
export function loadBaseline(projectRoot, { maxBytes = BASELINE_MAX_BYTES } = {}) {
  const p = baselinePath(projectRoot);
  const r = readRegularFileDetailed(p, maxBytes);
  if (!r.ok) {
    if (r.code === "ENOENT") return null;
    throw new BaselineError(`baseline inválido (${p}): ${r.code}: ${r.message}`);
  }
  return parseBaseline(r.text, p);
}

export function saveBaseline(projectRoot, baseline, { maxBytes = BASELINE_MAX_BYTES } = {}) {
  validate(baseline, "saveBaseline");
  const p = baselinePath(projectRoot);
  const sorted = { version: BASELINE_VERSION, entries: [...baseline.entries].sort((a, b) => a.fp.localeCompare(b.fp)) };
  const text = JSON.stringify(sorted, null, 2) + "\n";
  // Antes de tocar o disco: o que o save grava o load tem de conseguir ler (mesmo teto).
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > maxBytes) {
    throw new BaselineError(`baseline inválido (${p}): ${bytes} bytes acima do teto de ${maxBytes} bytes; nada foi gravado`);
  }
  mkdirSync(dirname(p), { recursive: true });
  refuseIfSymlink(p);
  // Ruling da rodada 2: o DIRETÓRIO de standards (dirname(p)) também precisa estar contido
  // no projeto de verdade — um symlink de diretório (ex.: .context/engineering/standards
  // apontando pra fora) não é pego pelo refuseIfSymlink acima (que só olha o arquivo
  // baseline.json) e faria a escrita cair fora do projeto (PoC6: "save via dir-symlink
  // escreveu em elsewhere").
  let realDir, realRoot;
  try {
    realDir = realPathOr(dirname(p));
    realRoot = realPathOr(projectRoot);
  } catch (e) {
    throw new BaselineError(`baseline inválido (${p}): não foi possível resolver o caminho real (${e.message})`);
  }
  const cleanDir = clean(realDir), cleanRoot = clean(realRoot);
  if (cleanDir !== cleanRoot && !cleanDir.startsWith(cleanRoot + "/")) {
    throw new BaselineError(`baseline inválido (${p}): diretório de standards escapa do projeto (${realDir} fora de ${realRoot})`);
  }
  // I-1: nome de tmp único (pid + bytes aleatórios), nunca previsível, e `wx` (O_CREAT|
  // O_EXCL) — recusa abrir se já existir qualquer coisa no caminho, symlink pendurado
  // incluído, em vez de seguir e sobrescrever o alvo (era possível pré-criar um symlink em
  // "baseline.json.tmp" apontando para um arquivo arbitrário, ex.: ~/.bashrc).
  const tmp = `${p}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(tmp, text, { flag: "wx" });
  try {
    renameSync(tmp, p);
  } catch (e) {
    // Ruling da rodada 2: se o rename falhar (ex.: baseline.json virou diretório — EISDIR),
    // o tmp não pode ficar órfão no disco. Limpa e relança o erro original.
    try { unlinkSync(tmp); } catch { /* já sumiu — ok */ }
    throw e;
  }
}

const countBy = (findings) => {
  const m = new Map();
  for (const x of findings) m.set(x.fp, (m.get(x.fp) || 0) + 1);
  return m;
};

const toEntry = (x, extra) => ({
  fp: x.fp, stdId: x.stdId, ruleId: x.ruleId, path: x.path, message: x.message,
  acceptedAt: new Date().toISOString(), ...extra,
});

export function initBaseline(findings, { by } = {}) {
  const first = new Map();
  for (const x of findings) if (!first.has(x.fp)) first.set(x.fp, x);
  const counts = countBy(findings);
  return {
    version: BASELINE_VERSION,
    entries: [...first.values()].map(x => toEntry(x, { count: counts.get(x.fp), ...(by ? { acceptedBy: by } : {}) })),
  };
}

// M-4: achado com `path` null nunca é aceito (path é identidade da entrada — uma entrada de
// baseline sempre tem path string, per `validate`) e a ordenação não pode lançar com null
// (`null.localeCompare` explodiria antes mesmo de chegar na checagem de aceite).
export function splitByBaseline(findings, baseline) {
  const left = new Map((baseline?.entries || []).map(e => [e.fp, e.count]));
  const accepted = [], fresh = [];
  const ordered = [...findings].sort((a, b) => (a.path || "").localeCompare(b.path || "") || (a.line ?? 0) - (b.line ?? 0));
  for (const x of ordered) {
    if (x.path == null) { fresh.push(x); continue; }
    const n = left.get(x.fp) || 0;
    if (n > 0) { left.set(x.fp, n - 1); accepted.push(x); } else fresh.push(x);
  }
  return { accepted, fresh };
}

export function pruneBaseline(baseline, findings) {
  const now = countBy(findings);
  const keep = [], removed = [];
  for (const e of baseline.entries) {
    const c = Math.min(e.count, now.get(e.fp) || 0);
    if (c === 0) removed.push(e); else keep.push({ ...e, count: c });
  }
  return { baseline: { version: BASELINE_VERSION, entries: keep }, removed };
}

/**
 * Baseline com o crédito limitado pelos achados de `backing`: cada entrada vale no máximo as
 * ocorrências da própria impressão digital ali, e a que fica sem nenhuma sai. É a conta do
 * `pruneBaseline`, só para decidir — nada é gravado. As impressões digitais em `exempt` ficam
 * como estão. `baseline` nulo → nulo.
 *
 * O `gate --ci` usa com os achados da árvore da base: crédito que a base já não sustenta (a
 * violação foi corrigida e ninguém rodou `prune`) não cobre ocorrência do HEAD.
 */
export function capCredit(baseline, backing, exempt = new Set()) {
  if (!baseline) return baseline;
  const isExempt = (e) => exempt.has(e.fp);
  const capped = pruneBaseline({ version: BASELINE_VERSION, entries: baseline.entries.filter(e => !isExempt(e)) }, backing).baseline;
  return { version: BASELINE_VERSION, entries: [...baseline.entries.filter(isExempt), ...capped.entries] };
}

export function acceptFinding(baseline, finding, { reason, by } = {}) {
  if (!reason || !String(reason).trim()) throw new Error("baseline accept exige justificativa (--reason)");
  // Impressão digital já aceita: sobe a contagem e a entrada passa a carregar a aceitação mais
  // recente (com os linters v2 a mensagem é por regra, então "mais uma no mesmo arquivo" cai
  // sempre aqui). Para a catraca só `fp` e `count` contam (compareCounts); o resto é registro.
  const latest = { reason, acceptedBy: by, acceptedAt: new Date().toISOString() };
  const entries = baseline.entries.map(e => (e.fp === finding.fp ? { ...e, count: e.count + 1, ...latest } : e));
  if (!entries.some(e => e.fp === finding.fp)) entries.push(toEntry(finding, { count: 1, reason, acceptedBy: by }));
  return { version: BASELINE_VERSION, entries };
}

const byFirst = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

// Refaz as entradas de UM standard com os achados atuais (operador, D6). Entrada cuja impressão
// digital e contagem não mudaram fica como está — mesmo objeto, mesma justificativa; as dos
// outros standards nem são olhadas. Os caminhos novos e os que cresceram saem do CAMINHO, que
// uma migração de mensagem ou de regra não muda, e não da impressão digital, que ela muda toda.
// Sem diferença, devolve o próprio baseline recebido: o chamador não grava.
export function reinitStandard(baseline, findings, stdId, { reason, by } = {}) {
  if (!reason || !String(reason).trim()) throw new Error("baseline reinit exige justificativa (--reason)");
  const mine = findings.filter(x => x.stdId === stdId);
  const old = baseline.entries.filter(e => e.stdId === stdId);
  const before = new Map(old.map(e => [e.fp, e]));
  const now = countBy(mine);
  const first = new Map();
  for (const x of mine) if (!first.has(x.fp)) first.set(x.fp, x);

  const tally = () => ({ entries: 0, count: 0 });
  const kept = tally(), added = tally(), altered = tally(), removed = tally();
  const byRule = new Map(); // Map, não objeto: "constructor" e "__proto__" são nomes de regra válidos
  const keepFp = new Set();
  const fresh = [];
  for (const [fp, count] of now) {
    const prev = before.get(fp);
    if (prev && prev.count === count) { keepFp.add(fp); kept.entries++; kept.count += count; continue; }
    const x = first.get(fp);
    const t = prev ? altered : added;
    t.entries++; t.count += count;
    byRule.set(x.ruleId, (byRule.get(x.ruleId) || 0) + count);
    fresh.push(toEntry(x, { count, reason, ...(by ? { acceptedBy: by } : {}) }));
  }
  for (const e of old) if (!now.has(e.fp)) { removed.entries++; removed.count += e.count; }

  const perPath = (pairs) => { const m = new Map(); for (const [p, c] of pairs) m.set(p, (m.get(p) || 0) + c); return m; };
  const pathBefore = perPath(old.map(e => [e.path, e.count]));
  const pathNow = perPath(mine.map(x => [x.path, 1]));
  const newPaths = [...pathNow.keys()].filter(p => !pathBefore.has(p)).sort();
  const grownPaths = [...pathNow].filter(([p, c]) => pathBefore.has(p) && c > pathBefore.get(p))
    .map(([p, c]) => [p, pathBefore.get(p), c]).sort(byFirst);

  const changed = added.entries + altered.entries + removed.entries > 0;
  const summary = { changed, kept, added, altered, removed, byRule: [...byRule].sort(byFirst), newPaths, grownPaths };
  if (!changed) return { baseline, ...summary };
  return {
    baseline: {
      version: BASELINE_VERSION,
      entries: [...baseline.entries.filter(e => e.stdId !== stdId || keepFp.has(e.fp)), ...fresh],
    },
    ...summary,
  };
}

export function compareCounts(head, base) {
  const allowed = new Map((base?.entries || []).map(e => [e.fp, e.count]));
  return (head?.entries || [])
    .filter(e => e.count > (allowed.get(e.fp) || 0))
    .map(e => ({ fp: e.fp, stdId: e.stdId, ruleId: e.ruleId, path: e.path, head: e.count, base: allowed.get(e.fp) || 0 }));
}
