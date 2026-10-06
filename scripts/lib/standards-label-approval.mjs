// scripts/lib/standards-label-approval.mjs — override da catraca (ADR-015 D8).
//
// Um enfraquecimento só é liberado com DUAS aprovações:
//   1. o rótulo `standards-ratchet-approved`, cujo evento MAIS RECENTE é uma aplicação;
//   2. um review APPROVED preso ao commit: `commit_id` igual ao `head.sha` do PR, que por sua
//      vez tem de ser o HEAD local (ou o segundo pai, quando o HEAD é um merge de dois pais cujo
//      primeiro é a base) — um push depois da aprovação muda o head e a aprovação deixa de valer.
// Quem aprova tem de ser dono — no CODEOWNERS da BASE, pela ÚLTIMA regra que casa — de TODOS
// os arquivos da catraca que o PR alterou em relação à base; nunca o autor do PR, nunca bot,
// nunca ação feita por um GitHub App. Arquivo alterado sem regra que o cubra não tem aprovador.
// Pressupõe que o agente não tem credencial de responsável.
//
// Fecha na dúvida: erro da API, resposta malformada, histórico grande demais para ler inteiro,
// PR que não está aberto, `--pr`/`--repo` fora do formato → não aprovado. Nunca lança.
import { execFileSync } from "node:child_process";
import { inlineSafe } from "./untrusted-frame.mjs";

export const LABEL = "standards-ratchet-approved";

// Formatos aceitos. Tudo o que entra num caminho da API passa por um destes.
export const PR_RE = /^[1-9][0-9]{0,9}$/;
export const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const SLUG_RE = /^[\w.-]+$/;
const LOGIN_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const dotOnly = (s) => /^\.+$/.test(s);

/** `owner/nome` no formato aceito, sem segmento "." ou "..". */
export function isValidRepo(repo) {
  return typeof repo === "string" && REPO_RE.test(repo) && !repo.split("/").some(dotOnly);
}
/** Número de PR: só dígitos, sem zero à esquerda. */
export function isValidPr(pr) {
  return (typeof pr === "string" || Number.isSafeInteger(pr)) && PR_RE.test(String(pr));
}

// Teto de páginas (100 itens por página). Acima disso o histórico não foi lido inteiro e não dá
// para afirmar qual é o evento ou o review mais recente: recusa.
const MAX_PAGES = 100;
const GH_TIMEOUT_MS = 20000;
const GH_MAX_BUFFER = 16 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------
// CODEOWNERS
// ---------------------------------------------------------------------------------------------

/** Todos os donos citados no CODEOWNERS (`@usuario` e `@org/time`), em caixa baixa. */
export function parseCodeowners(text) {
  const out = new Set();
  for (const rule of codeownersRules(text)) for (const o of rule.owners) out.add(o);
  return out;
}

// O GitHub não carrega um CODEOWNERS de 3 MB ou mais ("must be under 3 MB"): o arquivo inteiro
// é ignorado e ninguém é dono de nada. O gate trata igual — como ausente.
export const CODEOWNERS_MAX_BYTES = 3_000_000;

// O gate lê o CODEOWNERS como um parser estrito leria, e o que ele não entende INTEIRO vira
// dúvida (ninguém aprova), nunca posse:
//  - só "\n" (com "\r" opcional antes) separa linhas, e só espaço e tab ASCII separam tokens. O
//    `\s` do JS aceitaria NBSP, U+FEFF (BOM) e os separadores Unicode; num parser que só conhece
//    ASCII esses caracteres ficam DENTRO do token, e a linha é outra;
//  - comentário é `#` no começo da linha ou depois de espaço/tab. Um `#` no meio de um token pode
//    ser comentário para o GitHub (e aí os donos seriam outros): o token fica fora do formato;
//  - depois do padrão só valem donos bem formados: `@usuario`, `@org/time` ou e-mail.
const OWNER_RE = /^@[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?$/;
const EMAIL_RE = /^[^\s@#]+@[^\s@#]+$/;

/**
 * Regras do CODEOWNERS, na ordem do arquivo: `[{pattern, owners, odd}]`. E-mails ficam de fora dos
 * donos (não viram login). `odd` = depois do padrão há um token que não é dono bem formado.
 */
export function codeownersRules(text) {
  const rules = [];
  for (const raw of String(text || "").split("\n")) {
    const line = raw.replace(/\r$/, "").replace(/(^|[ \t])#[\s\S]*$/, "").replace(/^[ \t]+|[ \t]+$/g, "");
    if (!line) continue;
    const [pattern, ...rest] = line.split(/[ \t]+/);
    rules.push({
      pattern,
      owners: rest.filter(tok => OWNER_RE.test(tok)).map(tok => tok.toLowerCase()),
      odd: rest.some(tok => !OWNER_RE.test(tok) && !EMAIL_RE.test(tok)),
    });
  }
  return rules;
}

// Caminho com caractere de controle (C0, DEL, NEL, U+2028, U+2029) não é atribuído a ninguém.
const CONTROL_RE = /[\x00-\x1f\x7f\x85\u2028\u2029]/;
// U+FFFD é o que sobra de bytes que não são UTF-8 válido: nomes diferentes viram o mesmo texto.
const REPLACEMENT = String.fromCodePoint(0xfffd);
const escapeRe = (s) => s.replace(/[.+^${}()|]/g, "\\$&");
// Um segmento de padrão: `*` (e `**` colado em texto) não atravessa "/"; `?` é um caractere.
const segmentRe = (seg) => seg.split(/\*+/).map(part => part.split("?").map(escapeRe).join("[^/]")).join("[^/]*");

// Padrão do CODEOWNERS no subconjunto suportado → `{re, loose}`; fora dele → null.
// Subconjunto: nomes literais, `*` e `?` dentro de um segmento, `**` como segmento inteiro, barra
// inicial (ancora na raiz) e barra final (diretório). Fora: `[…]`, `\` (escape), `!` no começo,
// `#`, espaço em branco ou caractere de controle no padrão, `***`, segmento vazio (`//`), `/`
// sozinho e as formas de `**` que a documentação não descreve (`**/**` e `**/` no fim).
// Todo regex leva as flags `s` e `u`: sem o `s` o `.` não casa quebra de linha, e um arquivo com
// "\n" no nome deixava de casar a regra específica e voltava para o dono da regra genérica
// anterior; sem o `u`, o `?` valeria meio caractere fora do plano básico.
// Um CODEOWNERS grande tem milhares de regras e o gate confere cada arquivo alterado contra
// todas: o padrão compilado fica guardado (os regex não têm estado — sem `g` nem `y`).
const COMPILED = new Map();
const COMPILED_MAX = 20000;
function compilePattern(pattern) {
  const key = String(pattern || "");
  if (COMPILED.has(key)) return COMPILED.get(key);
  const compiled = compileUncached(key);
  if (COMPILED.size >= COMPILED_MAX) COMPILED.clear();
  COMPILED.set(key, compiled);
  return compiled;
}
function compileUncached(pattern) {
  let p = pattern;
  if (!p || p.startsWith("!") || /[\[\]\\#\s\x00-\x1f\x7f\x85]/.test(p) || p.includes("***")) return null;
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);
  // Ancorado na raiz quando tem barra no começo ou no meio; senão casa em qualquer nível.
  const anchored = p.includes("/");
  if (p.startsWith("/")) p = p.slice(1);
  if (!p) return null;
  const segs = p.split("/");
  if (segs.some(seg => seg === "")) return null;
  if (segs.some((seg, i) => seg === "**" && (segs[i + 1] === "**" || (dirOnly && i === segs.length - 1)))) return null;
  let head = anchored ? "^" : "^(?:.*/)?";
  const lastSeg = segs[segs.length - 1];
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1;
    if (seg === "**") head += last ? ".*" : "(?:.*/)?";
    else head += segmentRe(seg) + (last ? "" : "/");
  });
  // O que o padrão alcança depois do último segmento:
  //  - `dir/`: tudo o que está abaixo do diretório;
  //  - nome, literal ou com curinga (`/apps/github`, `/.context/eng*`, `*.md`): o próprio nome ou,
  //    se ele for um diretório, tudo o que está abaixo;
  //  - `dir/*` e `/*` (um `*` sozinho no fim de um padrão ancorado): só os filhos diretos — o
  //    GitHub documenta que `docs/*` não desce, e `/*` são os arquivos da raiz. O `loose` é o mesmo
  //    padrão descendo: serve para acusar a dúvida sobre um arquivo aninhado. Só o `*` sem barra
  //    nenhuma casa tudo, em qualquer nível.
  let tail = "(?:/.*)?$", looseTail = null;
  if (lastSeg === "**") tail = "$";
  else if (dirOnly) tail = "/.+$";
  else if (lastSeg === "*" && anchored) { tail = "$"; looseTail = "(?:/.*)?$"; }
  try {
    return { re: new RegExp(head + tail, "su"), loose: looseTail ? new RegExp(head + looseTail, "su") : null };
  } catch { return null; }
}

/** Regex de um padrão do CODEOWNERS no subconjunto suportado, ou `null` fora dele (ver `codeownersMatch`). */
export function codeownersPatternRegex(pattern) {
  return compilePattern(pattern)?.re ?? null;
}

// Última regra que casa, com o motivo da dúvida: "subset" (padrão fora do subconjunto), "children"
// (`dir/*` ou `/*` sobre arquivo aninhado) ou "line" (o padrão casa, mas a linha tem dono fora do formato).
// As regras com o padrão já compilado: uma leitura do arquivo serve para todos os caminhos.
const compiledRules = (text) => codeownersRules(text).map(rule => ({ ...rule, compiled: compilePattern(rule.pattern) }));
function matchRules(rules, path) {
  let owners = null, doubt = null, reason = null;
  for (const rule of rules) {
    const c = rule.compiled;
    if (!c) { doubt = rule.pattern; reason = "subset"; continue; }
    const hit = c.re.test(path);
    if (hit && !rule.odd) { owners = rule.owners; doubt = null; reason = null; }
    else if (hit) { doubt = rule.pattern; reason = "line"; }
    else if (c.loose && c.loose.test(path)) { doubt = rule.pattern; reason = "children"; }
  }
  return { owners, doubt, reason };
}

/**
 * Última regra que casa com `path` (relativo à raiz do repositório), sem nunca abrir:
 *  - `owners`: os donos da última regra que casa (`null` = nenhuma casa; `[]` = regra sem dono);
 *  - `doubt`: o padrão de uma regra POSTERIOR à última que casa sobre a qual o gate não sabe dizer
 *    quem é o dono — padrão fora do subconjunto suportado, `dir/*` ou `/*` sobre um arquivo
 *    aninhado, ou padrão que casa numa linha com dono fora do formato. Vale a última regra que
 *    casa: se essa regra vale no GitHub, o dono é outro; então, na dúvida, ninguém aprova.
 */
export function codeownersMatch(text, path) {
  const { owners, doubt } = matchRules(compiledRules(text), path);
  return { owners, doubt };
}

/** Donos de `path`: os da última regra que casa; `null` se nenhuma casa; `[]` se a regra não tem dono ou há dúvida. */
export function codeownersFor(text, path) {
  const m = codeownersMatch(text, path);
  return m.doubt !== null ? [] : m.owners;
}

const DOUBT_WHY = {
  subset: "está fora do subconjunto suportado",
  children: "só vale para os filhos diretos e o arquivo está abaixo deles",
  line: "casa, mas a linha tem dono fora do formato (esperado @usuario, @org/time ou e-mail)",
};

/**
 * Quem pode aprovar: quem é dono (pela última regra que casa) de TODOS os `paths` — os
 * arquivos da catraca que o PR alterou, relativos à raiz do repositório. Fecha sempre: caminho
 * com caractere de controle ou com U+FFFD, sem regra, com regra sem dono ou com regra duvidosa
 * depois da última que casa → ninguém.
 * @returns {{owners: Set<string>, uncovered: string|null, why: string|null}} `uncovered` = primeiro
 *   caminho sem dono e `why`, o motivo.
 */
export function ratchetOwners(text, paths) {
  let common = null, uncovered = null, why = null;
  const miss = (p, reason) => { if (uncovered === null) { uncovered = p; why = reason; } common = new Set(); };
  const rules = compiledRules(text);
  for (const p of paths) {
    if (CONTROL_RE.test(p)) { miss(p, "caractere de controle no nome do arquivo"); continue; }
    if (p.includes(REPLACEMENT)) { miss(p, "nome de arquivo com bytes que não são UTF-8 válido (U+FFFD)"); continue; }
    const { owners, doubt, reason } = matchRules(rules, p);
    if (doubt !== null) { miss(p, `a regra ${inlineSafe(doubt, 80)}, posterior à última que casa, ${DOUBT_WHY[reason]}`); continue; }
    if (!owners) { miss(p, "nenhuma regra casa"); continue; }
    if (!owners.length) { miss(p, "a última regra que casa não tem dono"); continue; }
    common = common === null ? new Set(owners) : new Set(owners.filter(o => common.has(o)));
  }
  return { owners: common ?? new Set(), uncovered, why };
}

// ---------------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------------

/** `gh api` por execFile com argv em array (sem shell). Lança em qualquer falha. */
export const ghApi = (path) => JSON.parse(execFileSync("gh", ["api", "--method", "GET", path], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: GH_TIMEOUT_MS, maxBuffer: GH_MAX_BUFFER,
}));

class Refused extends Error {}
const refuse = (reason) => { throw new Refused(reason); };
const no = (reason) => ({ ok: false, reason });
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const show = (s) => inlineSafe(s, 60);

// Lista paginada inteira. Página que não é lista de objetos ou histórico acima do teto → recusa.
function allPages(api, path, what) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = api(`${path}?per_page=100&page=${page}`);
    if (!Array.isArray(batch)) refuse(`resposta malformada da API: ${what} não são uma lista`);
    if (batch.length === 0) return items;
    if (!batch.every(isObj)) refuse(`resposta malformada da API: item de ${what} que não é objeto`);
    items.push(...batch);
  }
  return refuse(`histórico de ${what} do PR passa de ${MAX_PAGES} páginas: não dá para afirmar qual é o mais recente`);
}

// Itens em ordem cronológica. Com a data (`field`) em todos, ordena por ela (o `id` desempata o
// mesmo segundo); sem data em nenhum, vale a ordem da API (a mais antiga primeiro). Só parte com
// data, data ilegível, ou dois itens no mesmo instante sem `id` que os ordene → null (resposta
// malformada: não dá para afirmar qual é o mais recente).
function chronological(items, field) {
  const dated = items.filter(e => e[field] !== undefined && e[field] !== null);
  if (dated.length === 0) return items;
  if (dated.length !== items.length) return null;
  const keyed = items.map((e, i) => ({ e, i, t: typeof e[field] === "string" ? Date.parse(e[field]) : NaN }));
  if (keyed.some(k => !Number.isFinite(k.t))) return null;
  const num = (v) => (Number.isSafeInteger(v) ? v : null);
  keyed.sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    const ia = num(a.e.id), ib = num(b.e.id);
    if (ia !== null && ib !== null && ia !== ib) return ia - ib;
    return a.i - b.i;
  });
  for (let k = 1; k < keyed.length; k++) {
    const a = keyed[k - 1], b = keyed[k];
    if (a.t === b.t && (num(a.e.id) === null || num(b.e.id) === null || a.e.id === b.e.id)) return null;
  }
  return keyed.map(k => k.e);
}

// Conta humana que pode aprovar: `{login}` ou `{why}`.
function humanActor(actor, what) {
  if (!isObj(actor) || typeof actor.login !== "string" || !actor.login) return { why: `resposta malformada da API: ${what} sem autor` };
  const login = actor.login.toLowerCase();
  if (/\[bot\]$/.test(login) || String(actor.type).toLowerCase() === "bot") return { why: `${what} de bot (${show(login)})` };
  if (actor.type !== "User") return { why: `${what} de conta que não é de usuário (${show(login)})` };
  return { login };
}

/**
 * @param {{repo: string, pr: string|number, codeownersText: string|null, ratchetPaths: string[],
 *   headShas: string[], api?: (path: string) => any}} o
 *   `codeownersText` é o CODEOWNERS do merge-base (nunca o da branch); `ratchetPaths`, os arquivos
 *   da catraca que o PR alterou em relação à base, relativos à raiz do REPOSITÓRIO (removidos e
 *   renomeados inclusive); `headShas`, os commits que valem como head do PR: o HEAD local e,
 *   só quando ele é um merge de exatamente dois pais cujo primeiro é a base, o segundo pai.
 *   `api(path)` devolve o JSON de um GET da API do GitHub e lança em erro.
 * @returns {{ok: boolean, reason: string}}
 */
export function verifyOverrideApproval({ repo, pr, codeownersText, ratchetPaths = [], headShas = [], api = ghApi } = {}) {
  if (repo === undefined || repo === null || repo === "" || pr === undefined || pr === null || pr === "") {
    return no("override exige --pr e --repo");
  }
  if (!isValidPr(pr)) return no("--pr inválido: esperado só dígitos");
  if (!isValidRepo(repo)) return no("--repo inválido: esperado <owner>/<nome>");
  if (!String(codeownersText || "").trim()) return no("a base não tem CODEOWNERS");
  if (Buffer.byteLength(String(codeownersText), "utf8") >= CODEOWNERS_MAX_BYTES) {
    return no("o CODEOWNERS da base tem 3 MB ou mais: o GitHub ignora o arquivo inteiro, então não há responsável");
  }
  const changed = (Array.isArray(ratchetPaths) ? ratchetPaths : []).filter(p => typeof p === "string" && p);
  // Violação sem arquivo da catraca alterado (a base já estava assim): não há o que aprovar aqui.
  if (!changed.length) return no("nenhum arquivo da catraca foi alterado neste PR em relação à base: não há o que o override aprovar");
  const { owners, uncovered, why } = ratchetOwners(codeownersText, changed);
  if (!owners.size) {
    return no(`nenhuma regra do CODEOWNERS da base cobre todos os arquivos da catraca alterados neste PR com um responsável em comum${uncovered ? ` (sem responsável: ${inlineSafe(uncovered, 200)} — ${why})` : ""}`);
  }
  const heads = (Array.isArray(headShas) ? headShas : []).filter(s => typeof s === "string" && SHA_RE.test(s));
  if (!heads.length) return no("o gate não informou o commit local (HEAD)");
  try {
    return decide({ repo, pr: String(pr), owners, heads, api });
  } catch (e) {
    if (e instanceof Refused) return no(e.message);
    return no(`falha ao consultar a API do GitHub (${inlineSafe(e?.message || e, 300)})`);
  }
}
/** Nome do contrato original (T18): o override deixou de ser só o rótulo. */
export const verifyLabelApproval = verifyOverrideApproval;

function decide({ repo, pr, owners, heads, api }) {
  const prData = api(`repos/${repo}/pulls/${pr}`);
  const authorRaw = isObj(prData) && isObj(prData.user) ? prData.user.login : null;
  if (typeof authorRaw !== "string" || !authorRaw) return no("resposta malformada da API: PR sem autor");
  const author = authorRaw.toLowerCase();
  if (prData.state !== "open") return no(`o PR não está aberto (estado: ${show(prData.state)})`);
  if (isObj(prData.base) && isObj(prData.base.repo) && typeof prData.base.repo.full_name === "string"
      && prData.base.repo.full_name.toLowerCase() !== repo.toLowerCase()) {
    return no("o PR devolvido pela API é de outro repositório");
  }
  const headSha = isObj(prData.head) ? prData.head.sha : null;
  if (typeof headSha !== "string" || !SHA_RE.test(headSha)) return no("resposta malformada da API: PR sem head.sha");
  if (!heads.includes(headSha)) {
    return no(`o head do PR na API (${headSha.slice(0, 8)}) não é o HEAD local nem o segundo pai de um merge da base com o PR (HEAD de dois pais, o primeiro é a base): o gate não está rodando sobre o commit que foi aprovado`);
  }
  // Quando o PR lista os rótulos, o rótulo tem de estar lá (rótulo apagado do repositório some
  // do PR sem deixar evento de remoção).
  if (Array.isArray(prData.labels) && !prData.labels.some(l => isObj(l) && String(l.name).toLowerCase() === LABEL)) {
    return no(`o PR não tem o rótulo ${LABEL}`);
  }

  // Responsável pela catraca: citado direto, ou membro ativo de um time citado.
  const membership = new Map();
  const isOwner = (login) => {
    if (!LOGIN_RE.test(login)) return null;
    if (owners.has(`@${login}`)) return "code owner";
    if (membership.has(login)) return membership.get(login);
    let via = null;
    for (const o of owners) {
      const m = o.match(/^@([^/]+)\/([^/]+)$/);
      if (!m || !SLUG_RE.test(m[1]) || !SLUG_RE.test(m[2]) || dotOnly(m[1]) || dotOnly(m[2])) continue;
      let res = null;
      try { res = api(`orgs/${m[1]}/teams/${m[2]}/memberships/${login}`); } catch { /* 404: não é do time */ }
      if (isObj(res) && res.state === "active") { via = `time ${show(o)}`; break; }
    }
    membership.set(login, via);
    return via;
  };
  const notOwner = (login) => `${show(login)} não consta como responsável pelos arquivos da catraca alterados neste PR (CODEOWNERS da base)`;

  // 1) Rótulo: o evento mais recente do rótulo é uma aplicação feita por um responsável.
  const events = allPages(api, `repos/${repo}/issues/${pr}/events`, "eventos");
  // O GitHub não distingue caixa em nome de rótulo: "Standards-Ratchet-Approved" é o mesmo.
  const ours = events.filter(e => (e.event === "labeled" || e.event === "unlabeled")
    && isObj(e.label) && String(e.label.name).toLowerCase() === LABEL);
  const ordered = chronological(ours, "created_at");
  if (!ordered) return no("resposta malformada da API: eventos do rótulo sem created_at legível ou em ordem ambígua");
  const last = ordered[ordered.length - 1];
  if (!last) return no(`nenhum evento aplicando ${LABEL}`);
  if (last.event !== "labeled") return no(`o rótulo ${LABEL} foi removido depois de aplicado`);
  const labeler = humanActor(last.actor, "rótulo");
  if (labeler.why) return no(labeler.why.replace(/^rótulo de /, "rótulo aplicado por "));
  if (last.performed_via_github_app) return no(`rótulo aplicado por meio de um GitHub App (${show(labeler.login)})`);
  if (labeler.login === author) return no(`rótulo aplicado pelo autor do PR (${show(labeler.login)})`);
  const labelVia = isOwner(labeler.login);
  if (!labelVia) return no(notOwner(labeler.login));

  // 2) Review: para cada pessoa vale o review decisivo mais recente; ele tem de ser um APPROVED
  // no head do PR. CHANGES_REQUESTED ou DISMISSED posterior anula; COMMENTED não muda nada.
  const reviews = allPages(api, `repos/${repo}/pulls/${pr}/reviews`, "reviews")
    .filter(v => v.state === "APPROVED" || v.state === "CHANGES_REQUESTED" || v.state === "DISMISSED");
  const sorted = chronological(reviews, "submitted_at");
  if (!sorted) return no("resposta malformada da API: reviews sem submitted_at legível ou em ordem ambígua");
  const latest = new Map();
  for (const v of sorted) {
    const login = isObj(v.user) && typeof v.user.login === "string" ? v.user.login.toLowerCase() : null;
    if (login) latest.set(login, v);
  }
  let why = `nenhum review APPROVED no head do PR (${headSha.slice(0, 8)})`;
  for (const [login, v] of latest) {
    if (v.state !== "APPROVED") continue;
    const reviewer = humanActor(v.user, "review");
    if (reviewer.why) { why = reviewer.why; continue; }
    if (v.performed_via_github_app) { why = `review feito por meio de um GitHub App (${show(login)})`; continue; }
    if (login === author) { why = `review do autor do PR (${show(login)})`; continue; }
    if (v.commit_id !== headSha) {
      why = `o review APPROVED de ${show(login)} é de outro commit (${show(String(v.commit_id).slice(0, 8))}), não do head do PR (${headSha.slice(0, 8)})`;
      continue;
    }
    const via = isOwner(login);
    if (!via) { why = notOwner(login); continue; }
    return { ok: true, reason: `rótulo de ${labeler.login} (${labelVia}) e review APPROVED de ${login} (${via}) no commit ${headSha.slice(0, 8)}` };
  }
  return no(why);
}
