// tests/lib/test-standards-label-approval.mjs — override da catraca (ADR-015 D8).
// O override exige DUAS aprovações — o rótulo e um review APPROVED preso ao head do PR —, as
// duas de quem é dono, no CODEOWNERS da base, de todos os arquivos da catraca que o PR alterou
// (rodada de correção 1 da T18, I4/I6). Nenhum teste chama a API real: `api` é sempre injetada.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifyLabelApproval, verifyOverrideApproval, parseCodeowners, codeownersFor, codeownersMatch, codeownersPatternRegex, ratchetOwners, LABEL,
} from "../../scripts/lib/standards-label-approval.mjs";

const CO = "# donos\n/.context/ @dona @org/arquitetura\n";
const HEAD = "a".repeat(40);
// Arquivos da catraca que o PR alterou (o gate tira do `git diff --name-only` contra a base).
const STD = ".context/engineering/standards/std-demo.md";
const BASELINE = ".context/engineering/standards/baseline.json";
const LINTER = ".context/engineering/standards/machine/std-demo.js";
const LOCAL = ".context/standards.local.yaml";
const CFG = ".context/.devflow.yaml";
const CHANGED = [STD, BASELINE];
const labeled = (login, type = "User") => ({ event: "labeled", label: { name: LABEL }, actor: { login, type } });
const unlabeled = (login, type = "User") => ({ event: "unlabeled", label: { name: LABEL }, actor: { login, type } });
const review = (login, state = "APPROVED", extra = {}) => ({ id: 1, user: { login, type: "User" }, state, commit_id: HEAD, ...extra });

// API de mentira. Por padrão o PR está aberto no HEAD e traz um review APPROVED válido da dona,
// para que cada teste varie uma coisa só. `pages`/`reviewPages` dão a resposta por página.
function api({ author = "agente", events = [], reviews = [review("dona")], teams = {}, pr = {}, pages = null, reviewPages = null, calls = [] } = {}) {
  return (path) => {
    calls.push(path);
    if (/\/pulls\/\d+$/.test(path)) return { user: { login: author }, state: "open", head: { sha: HEAD }, ...pr };
    const ev = path.match(/\/issues\/\d+\/events\?per_page=100&page=(\d+)$/);
    if (ev) return pages ? (pages[Number(ev[1]) - 1] ?? []) : (ev[1] === "1" ? events : []);
    const rv = path.match(/\/pulls\/\d+\/reviews\?per_page=100&page=(\d+)$/);
    if (rv) return reviewPages ? (reviewPages[Number(rv[1]) - 1] ?? []) : (rv[1] === "1" ? reviews : []);
    const tm = path.match(/^orgs\/([^/]+)\/teams\/([^/]+)\/memberships\/([^/]+)$/);
    if (tm) { if (teams[`${tm[1]}/${tm[2]}`]?.includes(tm[3])) return { state: "active" }; throw new Error("404"); }
    throw new Error(`rota inesperada ${path}`);
  };
}
const verify = (o) => verifyOverrideApproval({ repo: "o/r", pr: 7, codeownersText: CO, ratchetPaths: CHANGED, headShas: [HEAD], ...o });
const check = (o) => verify({ api: api(o) });

// ── O contrato original (rótulo), agora com o review válido por padrão ────────────────

test("parseCodeowners lê usuários e times", () => {
  assert.deepEqual([...parseCodeowners(CO)].sort(), ["@dona", "@org/arquitetura"]);
});
test("verifyLabelApproval é o mesmo verificador (nome do contrato original)", () => {
  assert.equal(verifyLabelApproval, verifyOverrideApproval);
});
test("rótulo aplicado pelo autor do PR → recusado", () => {
  assert.equal(check({ author: "dona", events: [labeled("dona")] }).ok, false);
});
test("rótulo e review de code owner distinto do autor → aprovado", () => {
  const r = check({ events: [labeled("dona")] });
  assert.equal(r.ok, true, r.reason);
  assert.match(r.reason, /rótulo de dona .* review APPROVED de dona .* no commit aaaaaaaa/);
});
test("membro ativo de time dono → aprovado (no rótulo e no review)", () => {
  const teams = { "org/arquitetura": ["bia"] };
  assert.equal(check({ events: [labeled("bia")], teams }).ok, true);
  assert.equal(check({ events: [labeled("dona")], reviews: [review("bia")], teams }).ok, true);
  assert.equal(check({ events: [labeled("dona")], reviews: [review("bia")] }).ok, false);
});
test("bot, estranho ao CODEOWNERS ou sem evento → recusado", () => {
  for (const events of [[labeled("dona[bot]", "Bot")], [labeled("zé")], []]) {
    assert.equal(check({ events }).ok, false);
  }
});
test("vale o evento mais recente: dona aplicou, agente reaplicou → recusado", () => {
  assert.equal(check({ events: [labeled("dona"), { event: "unlabeled", label: { name: LABEL }, actor: { login: "agente" } }, labeled("agente")] }).ok, false);
});
test("sem CODEOWNERS na base → recusado", () => {
  for (const codeownersText of [null, "", "   \n# só comentário\n"]) {
    assert.equal(verify({ codeownersText, api: api({ events: [labeled("dona")] }) }).ok, false);
  }
});

test("parseCodeowners: comentário no fim da linha, e-mail, padrão sem dono e caixa", () => {
  const text = [
    "# cabeçalho",
    "",
    "*            @Dona   # dona de tudo",
    "/docs/       docs@exemplo.com",
    "/sem-dono/",
    "/src/        @Org/Time-A @outro",
  ].join("\n");
  assert.deepEqual([...parseCodeowners(text)].sort(), ["@dona", "@org/time-a", "@outro"]);
  assert.equal(parseCodeowners(null).size, 0);
  assert.equal(parseCodeowners("").size, 0);
});

test("rótulo removido depois (unlabeled mais recente) → recusado", () => {
  const r = check({ events: [labeled("dona"), unlabeled("dona")] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /removido/);
});

test("code owner reaplica depois de uma remoção → aprovado", () => {
  assert.equal(check({ events: [labeled("agente"), unlabeled("dona"), labeled("dona")] }).ok, true);
});

const filler = (n) => Array.from({ length: n }, (_, i) => ({ event: "commented", actor: { login: `u${i}`, type: "User" } }));

test("paginação: o evento que aprova está na segunda página → aprovado", () => {
  const calls = [];
  const r = check({ pages: [filler(100), [labeled("dona")]], calls });
  assert.equal(r.ok, true, r.reason);
  assert.ok(calls.some(c => /events.*page=2$/.test(c)), "tem de ler além da primeira página");
});

test("paginação: dona na primeira página, agente reaplica na segunda → recusado", () => {
  assert.equal(check({ pages: [[labeled("dona"), ...filler(99)], [unlabeled("agente"), labeled("agente")]] }).ok, false);
  // Um estranho (nem autor, nem code owner) reaplicando na terceira página também derruba.
  assert.equal(check({ pages: [[labeled("dona"), ...filler(99)], filler(100), [labeled("estranho")]] }).ok, false);
});

test("paginação sem fim (eventos ou reviews) → recusado, com número limitado de chamadas", () => {
  let n = 0;
  const endless = (path) => {
    if (/\/pulls\/\d+$/.test(path)) return { user: { login: "agente" }, state: "open", head: { sha: HEAD } };
    n++;
    return [labeled("dona"), ...filler(99)];
  };
  const r = verify({ api: endless });
  assert.equal(r.ok, false);
  assert.match(r.reason, /histórico|páginas/);
  assert.ok(n <= 200, `chamadas demais (${n})`);
  const many = Array.from({ length: 100 }, () => [review("x", "COMMENTED")]);
  let m = 0;
  const endlessReviews = (path) => { if (/reviews/.test(path)) { m++; return many[0]; } return api({ events: [labeled("dona")] })(path); };
  assert.equal(verify({ api: endlessReviews }).ok, false);
  assert.ok(m <= 200, `chamadas demais (${m})`);
});

test("created_at decide a ordem, não a posição na resposta", () => {
  const at = (e, t, id) => ({ ...e, created_at: t, id });
  // A resposta traz a remoção ANTES da aplicação, mas a remoção é a mais recente.
  const events = [at(unlabeled("agente"), "2026-01-02T00:00:00Z", 2), at(labeled("dona"), "2026-01-01T00:00:00Z", 1)];
  assert.equal(check({ events }).ok, false);
  // Mesmo segundo: o id desempata (o maior é o mais recente).
  const same = [at(labeled("agente"), "2026-01-01T00:00:00Z", 9), at(labeled("dona"), "2026-01-01T00:00:00Z", 3)];
  assert.equal(check({ events: same }).ok, false);
  const ok = [at(labeled("dona"), "2026-01-03T00:00:00Z", 30), at(labeled("agente"), "2026-01-01T00:00:00Z", 10)];
  assert.equal(check({ events: ok }).ok, true);
});

test("created_at em só parte dos eventos do rótulo → resposta malformada → recusado", () => {
  const events = [{ ...labeled("agente"), created_at: "2026-01-01T00:00:00Z" }, labeled("dona")];
  assert.equal(check({ events }).ok, false);
  const bad = [{ ...labeled("dona"), created_at: "ontem" }];
  assert.equal(check({ events: bad }).ok, false);
});

test("erro de API em qualquer chamada → recusado (fecha), sem lançar", () => {
  const boom = () => { throw new Error("HTTP 500"); };
  assert.equal(verify({ api: boom }).ok, false);
  const good = api({ events: [labeled("dona")] });
  for (const broken of [/\/events\?/, /\/reviews\?/]) {
    const r = verify({ api: (path) => { if (broken.test(path)) throw new Error("HTTP 502"); return good(path); } });
    assert.equal(r.ok, false, String(broken));
    assert.match(r.reason, /API/);
  }
});

test("resposta malformada → recusado", () => {
  const withPr = (prData, events = [labeled("dona")]) => (path) => (/\/pulls\/\d+$/.test(path) ? prData : /reviews/.test(path) ? (/page=1$/.test(path) ? [review("dona")] : []) : /page=1$/.test(path) ? events : []);
  const okPr = { state: "open", head: { sha: HEAD } };
  for (const prData of [null, "texto", {}, { ...okPr, user: null }, { ...okPr, user: { login: "" } }, { ...okPr, user: { login: 7 } }, [],
    { user: { login: "agente" }, state: "open" }, { user: { login: "agente" }, state: "open", head: { sha: "abc" } }, { user: { login: "agente" }, state: "open", head: null }]) {
    assert.equal(verify({ api: withPr(prData) }).ok, false, JSON.stringify(prData));
  }
  assert.equal(verify({ api: withPr({ ...okPr, user: { login: "agente" } }) }).ok, true, "controle: PR bem formado passa");
  for (const events of [null, "texto", { message: "Not Found" }, 42]) {
    assert.equal(check({ pages: [events] }).ok, false, JSON.stringify(events));
    assert.equal(check({ events: [labeled("dona")], reviewPages: [events] }).ok, false, JSON.stringify(events));
  }
  // Página com item que não é objeto, e evento do rótulo sem ator (usuário apagado).
  assert.equal(check({ events: [null, labeled("dona")] }).ok, false);
  assert.equal(check({ events: [{ event: "labeled", label: { name: LABEL }, actor: null }] }).ok, false);
  assert.equal(check({ events: [{ event: "labeled", label: { name: LABEL } }] }).ok, false);
  assert.equal(check({ events: [labeled("dona")], reviews: [null] }).ok, false);
});

test("ator sem type, Organization, Mannequin ou login terminado em [bot] → recusado (rótulo e review)", () => {
  for (const type of [undefined, null, "Organization", "Mannequin", "Bot", "bot"]) {
    const ev = { event: "labeled", label: { name: LABEL }, actor: { login: "dona", type } };
    assert.equal(check({ events: [ev] }).ok, false, String(type));
    assert.equal(check({ events: [labeled("dona")], reviews: [{ ...review("dona"), user: { login: "dona", type } }] }).ok, false, `review ${type}`);
  }
  const r = check({ events: [labeled("dona[bot]", "User")] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /bot/);
  assert.equal(check({ events: [labeled("dona")], reviews: [review("dona[bot]")] }).ok, false);
});

test("login e rótulo comparam sem distinção de caixa", () => {
  assert.equal(check({ events: [labeled("Dona")], reviews: [review("DONA")] }).ok, true);
  // Autor "Dona" × ator "dona": é a mesma conta.
  assert.equal(check({ author: "Dona", events: [labeled("dona")] }).ok, false);
  // Rótulo recriado com outra caixa e aplicado pelo agente: é o evento mais recente do rótulo.
  const upper = { event: "labeled", label: { name: LABEL.toUpperCase() }, actor: { login: "agente", type: "User" } };
  assert.equal(check({ events: [labeled("dona"), upper] }).ok, false);
});

test("evento de OUTRO rótulo não conta nem derruba", () => {
  const other = { event: "labeled", label: { name: "bug" }, actor: { login: "agente", type: "User" } };
  assert.equal(check({ events: [labeled("dona"), other] }).ok, true);
  assert.equal(check({ events: [other] }).ok, false);
});

test("o PR lista os rótulos e o rótulo não está lá → recusado", () => {
  const withLabels = (labels) => check({ events: [labeled("dona")], pr: { labels } });
  assert.equal(withLabels([{ name: "bug" }]).ok, false);
  assert.equal(withLabels([]).ok, false);
  assert.equal(withLabels([{ name: LABEL }]).ok, true);
});

test("time: participação pendente, erro da API ou time de nome inválido → recusado", () => {
  const base = api({ events: [labeled("bia")] });
  const pending = (path) => (/^orgs\//.test(path) ? { state: "pending" } : base(path));
  assert.equal(verify({ api: pending }).ok, false);
  const r = check({ events: [labeled("bia")] }); // 404 em todos os times
  assert.equal(r.ok, false);
  assert.match(r.reason, /bia não consta como responsável pelos arquivos da catraca alterados neste PR/);
  // Time com caractere fora do slug nunca vira caminho da API.
  const calls = [];
  const odd = verify({ codeownersText: "* @org/../../users\n", api: api({ events: [labeled("bia")], calls }) });
  assert.equal(odd.ok, false);
  assert.ok(!calls.some(c => c.startsWith("orgs/")), calls.join(" | "));
});

test("--pr e --repo malformados → recusado sem chamar a API", () => {
  let called = 0;
  const spy = () => { called++; return {}; };
  for (const [repo, pr] of [
    ["o/r", "7; rm -rf /"], ["o/r", "abc"], ["o/r", "-1"], ["o/r", "0"], ["o/r", ""], ["o/r", null], ["o/r", "7/../8"], ["o/r", 1.5],
    ["o", 7], ["o/r/x", 7], ["../..", 7], ["o/..", 7], ["./r", 7], ["o r/x", 7], ["o/r?x=1", 7], ["", 7], [null, 7], ["o/r\n", 7],
  ]) {
    const r = verify({ repo, pr, api: spy });
    assert.equal(r.ok, false, `${JSON.stringify(repo)} ${JSON.stringify(pr)}`);
  }
  assert.equal(called, 0);
  assert.equal(verify({ repo: "Org-1/re.po_x", pr: "12", api: api({ events: [labeled("dona")] }) }).ok, true);
});

test("a razão nunca carrega caractere de controle vindo da API", () => {
  const evil = { event: "labeled", label: { name: LABEL }, actor: { login: "x\u001b[31m\nfalso", type: "User" } };
  for (const r of [check({ events: [evil] }), check({ events: [labeled("dona")], reviews: [review("y\u001b[31m\nfalso")] }),
    check({ events: [labeled("dona")], pr: { state: "aberto\u001b[0m\nfalso" } })]) {
    assert.equal(r.ok, false);
    assert.doesNotMatch(r.reason, /[\u0000-\u001f]/);
  }
});

// ── I4: review APPROVED preso ao head do PR ───────────────────────────────────────────

const OLD = "b".repeat(40);
const approvedByDona = { events: [labeled("dona")] };

test("I4: sem review, ou só COMMENTED/PENDING → recusado", () => {
  for (const reviews of [[], [review("dona", "COMMENTED")], [review("dona", "PENDING")]]) {
    const r = check({ ...approvedByDona, reviews });
    assert.equal(r.ok, false, JSON.stringify(reviews.map(v => v.state)));
    assert.match(r.reason, /nenhum review APPROVED no head do PR/);
  }
});

test("I4: review APPROVED de outro commit (push depois da aprovação) → recusado", () => {
  const r = check({ ...approvedByDona, reviews: [review("dona", "APPROVED", { commit_id: OLD })] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /é de outro commit \(bbbbbbbb\), não do head do PR \(aaaaaaaa\)/);
});

test("I4: para cada pessoa vale o review decisivo mais recente", () => {
  const at = (v, t, id) => ({ ...v, submitted_at: t, id });
  const seq = (...states) => states.map((st, i) => at(review("dona", st), `2026-01-0${i + 1}T00:00:00Z`, i + 1));
  assert.equal(check({ ...approvedByDona, reviews: seq("APPROVED", "CHANGES_REQUESTED") }).ok, false);
  assert.equal(check({ ...approvedByDona, reviews: seq("APPROVED", "DISMISSED") }).ok, false);
  assert.equal(check({ ...approvedByDona, reviews: seq("CHANGES_REQUESTED", "APPROVED") }).ok, true);
  assert.equal(check({ ...approvedByDona, reviews: seq("APPROVED", "COMMENTED") }).ok, true, "COMMENTED não anula");
  // A ordem é a de submitted_at, não a da resposta; o id desempata o mesmo segundo.
  assert.equal(check({ ...approvedByDona, reviews: seq("APPROVED", "CHANGES_REQUESTED").reverse() }).ok, false);
  const same = [at(review("dona", "CHANGES_REQUESTED"), "2026-01-01T00:00:00Z", 9), at(review("dona", "APPROVED"), "2026-01-01T00:00:00Z", 3)];
  assert.equal(check({ ...approvedByDona, reviews: same }).ok, false);
  // O CHANGES_REQUESTED de OUTRA pessoa não anula o APPROVED da dona.
  assert.equal(check({ ...approvedByDona, reviews: [at(review("dona"), "2026-01-01T00:00:00Z", 1), at(review("fulana", "CHANGES_REQUESTED"), "2026-01-02T00:00:00Z", 2)] }).ok, true);
  // Só parte com data → malformada.
  assert.equal(check({ ...approvedByDona, reviews: [at(review("dona"), "2026-01-01T00:00:00Z", 1), review("dona", "CHANGES_REQUESTED")] }).ok, false);
});

test("I4: review do autor do PR, de quem não é responsável, ou paginado → decide certo", () => {
  assert.match(check({ author: "bia", events: [labeled("dona")], reviews: [review("bia")], teams: { "org/arquitetura": ["bia"] } }).reason, /review do autor do PR/);
  assert.match(check({ ...approvedByDona, reviews: [review("fulana")] }).reason, /fulana não consta como responsável/);
  const fillerReviews = Array.from({ length: 100 }, (_, i) => review(`u${i}`, "COMMENTED"));
  assert.equal(check({ ...approvedByDona, reviewPages: [fillerReviews, [review("dona")]] }).ok, true);
  assert.equal(check({ ...approvedByDona, reviewPages: [[review("dona", "APPROVED", { id: 1, submitted_at: "2026-01-01T00:00:00Z" }), ...fillerReviews.slice(1).map((v, i) => ({ ...v, id: i + 2, submitted_at: "2026-01-01T00:00:01Z" }))],
    [review("dona", "CHANGES_REQUESTED", { id: 500, submitted_at: "2026-01-02T00:00:00Z" })]] }).ok, false);
});

test("I4: rótulo ou review feito por meio de um GitHub App → recusado", () => {
  const viaApp = { slug: "agente-ia", owner: { login: "o" } };
  const a = check({ events: [{ ...labeled("dona"), performed_via_github_app: viaApp }] });
  assert.equal(a.ok, false);
  assert.match(a.reason, /GitHub App/);
  const b = check({ ...approvedByDona, reviews: [review("dona", "APPROVED", { performed_via_github_app: viaApp })] });
  assert.equal(b.ok, false);
  assert.match(b.reason, /GitHub App/);
  assert.equal(check({ ...approvedByDona, reviews: [review("dona", "APPROVED", { performed_via_github_app: null })] }).ok, true);
});

test("I4: PR que não está aberto, de outro repositório, ou head que não é o commit local → recusado", () => {
  for (const state of ["closed", "merged", "", undefined, null]) {
    const r = check({ ...approvedByDona, pr: { state } });
    assert.equal(r.ok, false, String(state));
    assert.match(r.reason, /não está aberto/);
  }
  assert.equal(check({ ...approvedByDona, pr: { base: { repo: { full_name: "agente/fork" } } } }).ok, false);
  assert.equal(check({ ...approvedByDona, pr: { base: { repo: { full_name: "O/R" } } } }).ok, true);
  // head.sha da API ≠ HEAD local e ≠ segundo pai do merge.
  const moved = check({ ...approvedByDona, pr: { head: { sha: OLD } }, reviews: [review("dona", "APPROVED", { commit_id: OLD })] });
  assert.equal(moved.ok, false);
  assert.match(moved.reason, /não é o HEAD local nem o segundo pai de um merge da base com o PR \(HEAD de dois pais, o primeiro é a base\)/);
  // No merge do PR, o head do PR é o segundo pai.
  assert.equal(verify({ headShas: ["c".repeat(40), HEAD], api: api(approvedByDona) }).ok, true);
  // Sem o commit local, não há como prender a aprovação.
  for (const headShas of [[], undefined, ["abc"], null]) assert.equal(verify({ headShas, api: api(approvedByDona) }).ok, false);
});

// ── I6: aprova quem é dono, pela ÚLTIMA regra que casa, de TODOS os arquivos da catraca que o PR alterou ──

const by = (who, reviewer = who) => api({ events: [labeled(who)], reviews: [review(reviewer)] });

test("I6: CODEOWNERS só de standards/ — aprova se o PR alterou só um std e o baseline; com .devflow.yaml junto, não", () => {
  const text = "/.context/engineering/standards/ @dona\n";
  assert.deepEqual([...ratchetOwners(text, [STD, BASELINE]).owners], ["@dona"]);
  const ok = verify({ codeownersText: text, ratchetPaths: [STD, BASELINE], api: by("dona") });
  assert.equal(ok.ok, true, ok.reason);
  const r = verify({ codeownersText: text, ratchetPaths: [STD, BASELINE, CFG], api: by("dona") });
  assert.equal(r.ok, false);
  assert.match(r.reason, /nenhuma regra do CODEOWNERS da base cobre todos os arquivos da catraca alterados neste PR/);
  assert.match(r.reason, /sem responsável: \.context\/\.devflow\.yaml/);
  assert.equal(ratchetOwners(text, [STD, BASELINE, CFG]).uncovered, CFG);
});

test("I6: /docs/ @x + /.context/ @y — só @y aprova", () => {
  const text = "/docs/ @x\n/.context/ @y\n";
  assert.deepEqual([...ratchetOwners(text, CHANGED).owners], ["@y"]);
  assert.equal(verify({ codeownersText: text, api: by("y") }).ok, true);
  const x = verify({ codeownersText: text, api: by("x") });
  assert.equal(x.ok, false);
  assert.match(x.reason, /x não consta como responsável pelos arquivos da catraca alterados neste PR/);
  // Rótulo de @y com review de @x: o review também tem de ser de quem é dono.
  assert.equal(verify({ codeownersText: text, api: by("y", "x") }).ok, false);
});

test("I6: standards/ é de @a e .devflow.yaml é de @b — alterando os dois, só aprova quem é dono dos dois", () => {
  const split = "/.context/engineering/standards/ @a\n/.context/.devflow.yaml @b\n";
  assert.equal(ratchetOwners(split, [STD, CFG]).owners.size, 0, "ninguém é dono dos dois");
  for (const [l, v] of [["a", "a"], ["b", "b"], ["a", "b"]]) {
    const r = verify({ codeownersText: split, ratchetPaths: [STD, CFG], api: by(l, v) });
    assert.equal(r.ok, false, `${l}/${v}`);
    assert.match(r.reason, /nenhuma regra do CODEOWNERS da base cobre todos os arquivos/);
  }
  // Cada um aprova sozinho o que é só dele.
  assert.equal(verify({ codeownersText: split, ratchetPaths: [STD], api: by("a") }).ok, true);
  assert.equal(verify({ codeownersText: split, ratchetPaths: [CFG], api: by("b") }).ok, true);
  assert.equal(verify({ codeownersText: split, ratchetPaths: [CFG], api: by("a") }).ok, false);
  // Com @c dono dos dois: um review de @a sozinho não basta.
  const both = "/.context/engineering/standards/ @a @c\n/.context/.devflow.yaml @b @c\n";
  assert.deepEqual([...ratchetOwners(both, [STD, CFG]).owners], ["@c"]);
  assert.equal(verify({ codeownersText: both, ratchetPaths: [STD, CFG], api: by("a") }).ok, false);
  assert.equal(verify({ codeownersText: both, ratchetPaths: [STD, CFG], api: by("c", "a") }).ok, false);
  assert.equal(verify({ codeownersText: both, ratchetPaths: [STD, CFG], api: by("b", "c") }).ok, false);
  assert.equal(verify({ codeownersText: both, ratchetPaths: [STD, CFG], api: by("c") }).ok, true);
});

test("I6: a última regra que casa vence; regra posterior sem dono tira o responsável", () => {
  assert.deepEqual([...ratchetOwners("* @todos\n/.context/ @catraca\n", CHANGED).owners], ["@catraca"]);
  assert.deepEqual([...ratchetOwners("/.context/ @catraca\n* @todos\n", CHANGED).owners], ["@todos"]);
  assert.equal(ratchetOwners("* @todos\n/.context/engineering/\n", CHANGED).owners.size, 0);
  assert.equal(ratchetOwners("* @todos\n/.context/engineering/standards/machine/ docs@exemplo.com\n", [LINTER]).owners.size, 0, "só e-mail = ninguém que o gate consiga conferir");
  assert.deepEqual([...ratchetOwners("* @todos\n/.context/engineering/standards/machine/ docs@exemplo.com\n", [STD]).owners], ["@todos"]);
  // `*.md` cobre o std, mas não o linter nem o baseline.
  assert.deepEqual([...ratchetOwners("*.md @docs\n", [STD]).owners], ["@docs"]);
  assert.equal(ratchetOwners("*.md @docs\n", [STD, LINTER]).uncovered, LINTER);
  assert.equal(ratchetOwners("*.md @docs\n", [BASELINE]).uncovered, BASELINE);
});

test("I6: nenhum arquivo da catraca alterado → não há o que aprovar; arquivo sem regra → não há aprovador", () => {
  for (const ratchetPaths of [[], undefined, null, [""], [null]]) {
    const r = verify({ ratchetPaths, api: by("dona") });
    assert.equal(r.ok, false, JSON.stringify(ratchetPaths));
    assert.match(r.reason, /nenhum arquivo da catraca foi alterado/);
  }
  for (const [text, paths, uncovered] of [
    ["/docs/ @dona\n", [STD], STD],
    ["/.context/engineering/standards/ @dona\n", [STD, LOCAL], LOCAL],
    ["/.context/engineering/ @a\n/.context/standards.local.yaml @b\n", [LOCAL, CFG], CFG],
  ]) {
    const r = verify({ codeownersText: text, ratchetPaths: paths, api: by("dona") });
    assert.equal(r.ok, false, text);
    assert.match(r.reason, /nenhuma regra do CODEOWNERS da base cobre todos os arquivos da catraca alterados neste PR/);
    assert.equal(ratchetOwners(text, paths).uncovered, uncovered);
  }
  // Donos diferentes por arquivo, com um em comum: só o comum é dono de tudo.
  const mixed = "/.context/ @a @comum\n/.context/engineering/standards/ @b @comum\n";
  assert.deepEqual([...ratchetOwners(mixed, [STD, CFG]).owners], ["@comum"]);
});

test("I6: arquivos da catraca com o prefixo do projeto (monorepo) e arquivo removido", () => {
  const paths = CHANGED.map(p => `apps/web/${p}`);
  assert.deepEqual([...ratchetOwners("/apps/web/.context/ @web\n/.context/ @raiz\n", paths).owners], ["@web"]);
  assert.equal(ratchetOwners("/.context/ @raiz\n", paths).owners.size, 0);
  assert.deepEqual([...ratchetOwners(".context/ @qualquer-nivel\n", paths).owners], ["@qualquer-nivel"]);
  // Um arquivo removido conta pelo caminho que tinha: o dono do caminho antigo é quem aprova.
  const moved = [".context/engineering/standards/machine/helper.js", ".context/standards/machine/helper.js"];
  assert.equal(ratchetOwners("/.context/engineering/standards/ @a\n/.context/standards/ @b\n", moved).owners.size, 0);
  assert.deepEqual([...ratchetOwners("/.context/engineering/standards/ @a\n/.context/standards/ @a @b\n", moved).owners], ["@a"]);
  // Nome de arquivo com caractere de controle não vaza para a razão.
  const r = verify({ codeownersText: "/docs/ @dona\n", ratchetPaths: [".context/engineering/standards/x\u001b[31m\ny.md"], api: by("dona") });
  assert.equal(r.ok, false);
  assert.doesNotMatch(r.reason, /[\u0000-\u001f]/);
});

test("I6: casamento de padrão do CODEOWNERS no subconjunto suportado", () => {
  const m = (pattern, path) => { const re = codeownersPatternRegex(pattern); return re ? re.test(path) : null; };
  const yes = [
    ["*", "a/b/c.js"], ["*.js", "a/b/c.js"], ["*.js", "c.js"],
    ["/build/logs/", "build/logs/x/y.log"], ["apps/", "x/apps/a.js"], ["apps/", "apps/a.js"],
    ["/docs/", "docs/a.md"], ["docs/*", "docs/a.md"], ["/apps/github", "apps/github/x.js"], ["/apps/github", "apps/github"],
    ["**/logs", "a/b/logs/x.log"], ["**/logs", "logs/x.log"], ["/build/**", "build/a/b"], ["/a/**/b.js", "a/x/y/b.js"], ["/a/**/b.js", "a/b.js"],
    ["/.context/", ".context/engineering/standards/baseline.json"], [".context/", "apps/web/.context/.devflow.yaml"],
    ["/src/?.js", "src/a.js"], ["Makefile", "sub/Makefile"], ["/a.b/", "a.b/c"],
    // Rodada 2 (poc25): curinga num NOME que casa um diretório vale para o que está abaixo dele.
    ["/.context/eng*", ".context/engineering/standards/std-demo.md"], ["/.context/engineering/stand*", ".context/engineering/standards/machine/x.js"],
    ["**/stand*", ".context/engineering/standards/std-demo.md"], ["/.context/engineering/standards/mach?ne", ".context/engineering/standards/machine/x.js"],
    ["*.md", "a.md/b.js"], ["/.context/.devflow.y*", ".context/.devflow.yaml"], ["/.context/eng*/standards/", ".context/engineering/standards/x.md"],
    ["a**b", "x/aXXb"], ["/.context/**.md", ".context/x.md"],
  ];
  const noMatch = [
    ["*.js", "a/b/c.ts"], ["/docs/", "x/docs/a.md"], ["docs/*", "docs/sub/a.md"], ["/docs", "documentos/a.md"], ["/apps/github", "apps/githubx/x.js"],
    ["/build/logs/", "build/logs"], ["/a/**/b.js", "a/x/c.js"], ["/src/?.js", "src/ab.js"], ["/a.b/", "aXb/c"], ["/.context/", "x/.context/a"],
    ["docs/", "docsx/a"], ["/.context/eng*", ".context/xeng/a.md"], ["/.context/eng*", "x/.context/engineering/a.md"],
    ["/.context/engineering/standards/mach?ne", ".context/engineering/standards/machiine/x.js"],
  ];
  for (const [p, path] of yes) assert.equal(m(p, path), true, `${p} deveria casar com ${path}`);
  for (const [p, path] of noMatch) assert.equal(m(p, path), false, `${p} NÃO deveria casar com ${path}`);
  // `docs/*` só casa os filhos diretos (documentado pelo GitHub); o regex não desce.
  assert.equal(m("/.context/engineering/standards/*", ".context/engineering/standards/std-demo.md"), true);
  assert.equal(m("/.context/engineering/standards/*", ".context/engineering/standards/machine/x.js"), false);
  // Fora do subconjunto: o regex não existe (quem decide o que fazer é codeownersMatch).
  for (const p of ["[abc]*.js", "!docs/", "a\\ b/", "/my\\ app/.context/", "/", "", "a//b", "/.context/***", "a/***/b"]) assert.equal(codeownersPatternRegex(p), null, p);
  assert.equal(codeownersFor("/docs/ @a\n", ".context/x"), null);
  assert.deepEqual(codeownersFor("/.context/ @a\n/.context/x\n", ".context/x"), []);
});

// ── Rodada 2: o casamento tem de FECHAR sempre (vale a última regra que casa; quando a regra
// específica deixa de casar, o arquivo voltava para o dono da regra genérica anterior) ──

test("I6/r2: o regex casa quebra de linha (flag s), mas caminho com caractere de controle não tem aprovador", () => {
  const text = "* @larga\n/.context/ @arquiteta\n";
  // No nível do padrão, a regra específica casa o nome com "\n" (antes o `.+` parava nele).
  for (const ch of ["\n", "\r", "\u2028", "\u2029"]) {
    assert.equal(codeownersPatternRegex("/.context/").test(`.context/engineering/standards/std-demo${ch}.md`), true, JSON.stringify(ch));
    assert.equal(codeownersPatternRegex("/.context/eng*").test(`.context/engineering/dir${ch}/x.md`), true, JSON.stringify(ch));
    assert.equal(codeownersPatternRegex("*.md").test(`a${ch}b.md`), true, JSON.stringify(ch));
    assert.deepEqual(codeownersFor(text, `.context/engineering/standards/std-demo${ch}.md`), ["@arquiteta"], JSON.stringify(ch));
  }
  // No nível da aprovação, um arquivo alterado com caractere de controle no nome fica SEM aprovador.
  for (const p of [".context/engineering/standards/std-demo\n.md", ".context/engineering/standards/machine/x\r.js", ".context/dir\u2028/x.md",
    ".context/a\u2029b", ".context/tab\tx.md", ".context/nul\u0000x", ".context/esc\u001bx", ".context/del\u007fx", ".context/nel\u0085x"]) {
    const o = ratchetOwners(text, [STD, p]);
    assert.equal(o.owners.size, 0, JSON.stringify(p));
    assert.equal(o.uncovered, p);
    assert.match(o.why, /caractere de controle/);
    for (const who of ["larga", "arquiteta"]) {
      const r = verify({ codeownersText: text, ratchetPaths: [p], api: by(who) });
      assert.equal(r.ok, false, `${who} ${JSON.stringify(p)}`);
      assert.doesNotMatch(r.reason, /[\u0000-\u001f\u2028\u2029]/);
    }
  }
  // Controle: o mesmo arquivo sem o caractere de controle é da arquiteta, e só dela.
  assert.equal(verify({ codeownersText: text, ratchetPaths: [STD], api: by("arquiteta") }).ok, true);
  assert.equal(verify({ codeownersText: text, ratchetPaths: [STD], api: by("larga") }).ok, false);
});

test("I6/r2: curinga no último segmento que casa um DIRETÓRIO vale para o que está abaixo (poc25)", () => {
  const text = "/.context/ @larga\n/.context/eng* @arquiteta\n";
  assert.deepEqual(codeownersFor(text, STD), ["@arquiteta"]);
  assert.deepEqual(codeownersFor(text, LINTER), ["@arquiteta"]);
  assert.deepEqual(codeownersFor(text, CFG), ["@larga"], ".devflow.yaml não está sob eng*");
  assert.equal(verify({ codeownersText: text, ratchetPaths: [STD], api: by("larga") }).ok, false);
  assert.equal(verify({ codeownersText: text, ratchetPaths: [STD], api: by("arquiteta") }).ok, true);
});

test("I6/r2: regra fora do subconjunto DEPOIS da última que casa deixa o arquivo sem aprovador", () => {
  for (const later of ["/my\\ app/.context/ @arquiteta", "/.context/[e]ngineering/ @arquiteta", "!/.context/ @arquiteta", "/.context/*** @arquiteta", "/ @arquiteta", "a//b @arquiteta"]) {
    const text = `* @larga\n${later}\n`;
    const m = codeownersMatch(text, STD);
    assert.deepEqual(m.owners, ["@larga"], later);
    assert.equal(typeof m.doubt, "string", later);
    assert.deepEqual(codeownersFor(text, STD), [], later);
    const o = ratchetOwners(text, [STD]);
    assert.equal(o.owners.size, 0, later);
    assert.match(o.why, /fora do subconjunto/, later);
    for (const who of ["larga", "arquiteta"]) {
      const r = verify({ codeownersText: text, ratchetPaths: [STD], api: by(who) });
      assert.equal(r.ok, false, `${who}: ${later}`);
      assert.match(r.reason, /fora do subconjunto/);
    }
  }
  // Regra fora do subconjunto ANTES da última que casa não atrapalha: a que casa depois vence.
  const before = "/my\\ app/.context/ @x\n/.context/ @arquiteta\n";
  assert.deepEqual(codeownersMatch(before, STD), { owners: ["@arquiteta"], doubt: null });
  assert.equal(verify({ codeownersText: before, ratchetPaths: [STD], api: by("arquiteta") }).ok, true);
  // Sem nenhuma regra que case, a regra fora do subconjunto não cria aprovador.
  assert.equal(ratchetOwners("/my\\ app/.context/ @x\n", [STD]).owners.size, 0);
});

test("I6/r2: `dir/*` sobre um arquivo aninhado é dúvida — nem passa a posse, nem deixa a anterior", () => {
  // O GitHub documenta que `docs/*` não desce; o regex segue o documentado. Mas se a regra vem
  // depois da última que casa, o arquivo aninhado fica sem aprovador (fecha nas duas leituras).
  const text = "/.context/ @larga\n/.context/engineering/standards/* @arquiteta\n";
  assert.deepEqual(codeownersFor(text, STD), ["@arquiteta"], "filho direto: casa");
  assert.deepEqual(codeownersMatch(text, LINTER).owners, ["@larga"]);
  assert.equal(typeof codeownersMatch(text, LINTER).doubt, "string");
  assert.deepEqual(codeownersFor(text, LINTER), [], "aninhado: sem aprovador");
  for (const who of ["larga", "arquiteta"]) assert.equal(verify({ codeownersText: text, ratchetPaths: [LINTER], api: by(who) }).ok, false, who);
  // Fora do diretório da regra não há dúvida nenhuma.
  assert.deepEqual(codeownersMatch("/.context/ @larga\n/docs/* @docs\n", LINTER), { owners: ["@larga"], doubt: null });
  // `*` sozinho continua casando tudo, em qualquer nível.
  assert.deepEqual(codeownersMatch("* @todos\n", LINTER), { owners: ["@todos"], doubt: null });
});

test("I6/r2: CRLF e comentário no fim da linha; CR sozinho e dono com vírgula colada ficam sem aprovador (rodada 3)", () => {
  const crlf = "/.context/ @larga # todo mundo\r\n/.context/engineering/ @arquiteta\r\n";
  assert.deepEqual(codeownersFor(crlf, STD), ["@arquiteta"]);
  assert.deepEqual(codeownersFor(crlf, CFG), ["@larga"]);
  // Rodada 3: só "\n" separa linhas. Um "\r" sozinho fica DENTRO do token: a linha casa, mas
  // tem dono fora do formato — dúvida, ninguém aprova. (Na rodada 2 ele valia como fim de linha.)
  const bareCr = "/.context/ @larga\r/.context/engineering/ @arquiteta\r";
  assert.equal(codeownersMatch(bareCr, STD).doubt, "/.context/");
  assert.deepEqual(codeownersFor(bareCr, STD), []);
  // Rodada 3: "@larga," não é um dono bem formado. O GitHub pula a linha com sintaxe inválida;
  // o gate não dá a posse nem ao outro dono da mesma linha. (Na rodada 2 a @outra aprovava.)
  for (const who of ["larga", "outra"]) {
    const r = verify({ codeownersText: "/.context/ @larga, @outra\n", ratchetPaths: [STD], api: by(who) });
    assert.equal(r.ok, false, who);
    assert.match(r.reason, /dono fora do formato/);
  }
});

test("I4/r2: dois reviews decisivos da mesma pessoa no mesmo instante e sem id → ambíguo → recusado", () => {
  const at = "2026-01-01T00:00:00Z";
  const tie = [{ ...review("dona", "CHANGES_REQUESTED"), id: undefined, submitted_at: at }, { ...review("dona", "APPROVED"), id: undefined, submitted_at: at }];
  for (const reviews of [tie, [...tie].reverse()]) {
    const r = check({ events: [labeled("dona")], reviews });
    assert.equal(r.ok, false);
    assert.match(r.reason, /malformada|ordem/);
  }
  // Com id, o maior é o mais recente; com instantes diferentes, o id nem é preciso.
  const withId = [{ ...review("dona", "CHANGES_REQUESTED"), id: 5, submitted_at: at }, { ...review("dona", "APPROVED"), id: 9, submitted_at: at }];
  assert.equal(check({ events: [labeled("dona")], reviews: withId }).ok, true);
  const later = [{ ...review("dona", "CHANGES_REQUESTED"), id: undefined, submitted_at: at }, { ...review("dona", "APPROVED"), id: undefined, submitted_at: "2026-01-02T00:00:00Z" }];
  assert.equal(check({ events: [labeled("dona")], reviews: later }).ok, true);
  // O mesmo vale para os eventos do rótulo.
  const ev = (e) => ({ ...e, created_at: at });
  assert.equal(check({ events: [ev(unlabeled("dona")), ev(labeled("dona"))] }).ok, false);
});

// ── Rodada 3 ──────────────────────────────────────────────────────────────────────────

const cp = (n) => String.fromCodePoint(n);
const NBSP = cp(0xa0), BOM = cp(0xfeff), REPLACEMENT = cp(0xfffd), ASTRAL = cp(0x1f600);

test("I6/r3 (poc32): `/*` ancorado casa só arquivos da raiz; arquivo aninhado é dúvida, igual a `dir/*`", () => {
  const re = codeownersPatternRegex("/*");
  assert.equal(re.test("README.md"), true);
  assert.equal(re.test("docs/a.md"), false);
  assert.equal(re.test(STD), false);
  const text = "/.context/ @arquiteta\n/* @larga\n";
  assert.deepEqual(codeownersMatch(text, "README.md"), { owners: ["@larga"], doubt: null });
  const m = codeownersMatch(text, STD);
  assert.deepEqual(m.owners, ["@arquiteta"], "a regra /* não casa o arquivo aninhado");
  assert.equal(m.doubt, "/*");
  assert.deepEqual(codeownersFor(text, STD), []);
  for (const who of ["larga", "arquiteta"]) {
    const r = verify({ codeownersText: text, ratchetPaths: [STD], api: by(who) });
    assert.equal(r.ok, false, who);
    assert.match(r.reason, /filhos diretos/);
  }
  // Só `/* @larga`: nada casa o arquivo aninhado, e ninguém aprova.
  for (const who of ["larga", "arquiteta"]) assert.equal(verify({ codeownersText: "/* @larga\n", ratchetPaths: [STD], api: by(who) }).ok, false, who);
  // A regra da catraca DEPOIS do `/*` casa e decide; a dúvida some.
  assert.deepEqual(codeownersMatch("/* @larga\n/.context/ @arquiteta\n", STD), { owners: ["@arquiteta"], doubt: null });
  // `*` sem barra continua casando tudo, em qualquer nível.
  assert.deepEqual(codeownersMatch("/.context/ @arquiteta\n* @todos\n", STD), { owners: ["@todos"], doubt: null });
});

// Referência independente para a tabela: casamento por SEGMENTOS, sem regex, com a semântica que
// a documentação do GitHub descreve ("About code owners"). Escrita de outro jeito de propósito,
// para não herdar um erro do regex do gate. Não foi conferida contra a API do GitHub.
// Devolve true/false, ou null para o que o GitHub não documenta ou diz não suportar.
function globSegment(pat, name) {
  const P = [...pat], N = [...name];
  let prev = new Array(N.length + 1).fill(false);
  prev[0] = true;
  for (const ch of P) {
    const cur = new Array(N.length + 1).fill(false);
    if (ch === "*") { cur[0] = prev[0]; for (let j = 1; j <= N.length; j++) cur[j] = prev[j] || cur[j - 1]; }
    else for (let j = 1; j <= N.length; j++) cur[j] = prev[j - 1] && (ch === "?" || ch === N[j - 1]);
    prev = cur;
  }
  return prev[N.length];
}
function refMatch(pattern, path) {
  if (!pattern || pattern.startsWith("!") || /[\[\]\\#]/.test(pattern) || pattern.includes("***")) return null;
  if (pattern === "/") return false;
  let p = pattern;
  const dir = p.endsWith("/");
  if (dir) p = p.slice(0, -1);
  const anchored = p.includes("/");
  if (p.startsWith("/")) p = p.slice(1);
  let segs = p.split("/");
  if (!p || segs.includes("")) return null;
  if (!anchored && segs[0] !== "**") segs = ["**", ...segs];
  if (dir) segs = [...segs, "**"];
  if (segs.some((s, i) => s === "**" && segs[i + 1] === "**")) return null; // `**/**`: não documentado
  const fs = path.split("/");
  const go = (i, j) => {
    if (i === segs.length) return j === fs.length;
    const seg = segs[i], last = i === segs.length - 1;
    if (seg === "**") {
      if (last) return i === 0 || j < fs.length;                 // `dir/**`: o que está abaixo; `**` sozinho: tudo
      for (let k = j; k <= fs.length; k++) if (go(i + 1, k)) return true;
      return false;
    }
    if (j >= fs.length) return false;
    if (seg === "*") return last ? j === fs.length - 1 : go(i + 1, j + 1);   // no fim, `*` não desce
    if (!globSegment(seg, fs[j])) return false;
    return last ? true : go(i + 1, j + 1);                       // nome no fim: ele mesmo ou o que está abaixo
  };
  return go(0, 0);
}
const refOwners = (text, path) => {
  let owners = null;
  for (const line of text.split("\n").filter(Boolean)) {
    const [pattern, ...o] = line.split(" ");
    if (refMatch(pattern, path) === true) owners = o;
  }
  return owners ?? [];
};
const gateOwners = (text, path) => codeownersFor(text, path) ?? [];

test("I6/r3: tabela própria — os exemplos da documentação do GitHub, um por um", () => {
  // [CODEOWNERS, caminho, donos segundo o texto da documentação]
  const doc = [
    ["* @g1 @g2", "README.md", ["@g1", "@g2"]], ["* @g1 @g2", "a/b/c.txt", ["@g1", "@g2"]],
    ["* @g\n*.js @js", "src/a.js", ["@js"]], ["* @g\n*.js @js", "a.js", ["@js"]], ["* @g\n*.js @js", "src/a.rb", ["@g"]],
    ["*.txt @octo-org/octocats", "docs/notes.txt", ["@octo-org/octocats"]],
    ["/build/logs/ @doctocat", "build/logs/a.log", ["@doctocat"]], ["/build/logs/ @doctocat", "build/logs/deep/a.log", ["@doctocat"]],
    ["* @g\n/build/logs/ @doctocat", "other/build/logs/a.log", ["@g"]],
    ["docs/* @d", "docs/getting-started.md", ["@d"]], ["* @g\ndocs/* @d", "docs/build-app/troubleshooting.md", ["@g"]],
    ["apps/ @octocat", "apps/x.rb", ["@octocat"]], ["apps/ @octocat", "pkg/apps/deep/x.rb", ["@octocat"]],
    ["/docs/ @doctocat", "docs/x.md", ["@doctocat"]], ["/docs/ @doctocat", "docs/sub/x.md", ["@doctocat"]], ["* @g\n/docs/ @doctocat", "pkg/docs/x.md", ["@g"]],
    ["/scripts/ @doctocat @octocat", "scripts/x.sh", ["@doctocat", "@octocat"]],
    ["**/logs @octocat", "build/logs/x", ["@octocat"]], ["**/logs @octocat", "scripts/logs/x", ["@octocat"]], ["**/logs @octocat", "deeply/nested/logs/x", ["@octocat"]],
    ["/apps/ @octocat\n/apps/github", "apps/x.rb", ["@octocat"]], ["/apps/ @octocat\n/apps/github", "apps/github/x.rb", []],
    ["/apps/ @octocat\n/apps/github @doctocat", "apps/github/x.rb", ["@doctocat"]], ["/apps/ @octocat\n/apps/github @doctocat", "apps/x.rb", ["@octocat"]],
  ];
  for (const [text, path, expected] of doc) {
    assert.deepEqual(refOwners(text, path), expected, `a referência diverge da documentação: ${JSON.stringify(text)} × ${path}`);
    const got = gateOwners(text, path);
    assert.ok(got.every(o => expected.includes(o)), `ABRE: ${JSON.stringify(text)} × ${path} → ${JSON.stringify(got)}`);
  }
  // O único exemplo em que o gate é mais fechado que a documentação: `docs/*` depois da regra
  // genérica, arquivo aninhado → dúvida (ninguém), onde a documentação daria o dono genérico.
  assert.deepEqual(doc.filter(([text, path, expected]) => JSON.stringify(gateOwners(text, path)) !== JSON.stringify(expected)).map(([text]) => text), ["* @g\ndocs/* @d"]);
});

test("I6/r3: tabela própria — nenhum padrão dá posse a quem a referência não daria", () => {
  const SEG = [".context", "engineering", "standards", "machine", "bin", "docs", "*", "**", "eng*", "*.md", "*.js", "std-*", "?context", "s*s", ".devflow.yaml", "*.yaml"];
  const PATHS = [
    "README.md", ".devflow.yaml", "docs/a.md", "docs/sub/a.md",
    STD, LINTER, BASELINE, CFG, LOCAL, ".context/engineering/standards/machine/lib/util.js",
    ".context/bin/devflow-standards.mjs", ".context/standards/std-legado.md", ".context/standards/machine/x.js",
    ".context/engineering/node_modules/p/index.js", "apps/web/.context/.devflow.yaml",
  ];
  const patterns = new Set(["*", "**", "/*", "/**", "*/", "**/", "/*/", "/**/", "/*/*", "/*.md", "/.*", "/.context*", ".context*", "**/*", "**/*/*", "*/*", "/.context/**/*", "**/standards/**/*.js"]);
  for (const lead of ["", "/"]) for (const trail of ["", "/"]) for (const a of SEG) {
    patterns.add(`${lead}${a}${trail}`);
    for (const b of SEG) {
      patterns.add(`${lead}${a}/${b}${trail}`);
      for (const c of SEG) patterns.add(`${lead}${a}/${b}/${c}${trail}`);
    }
  }
  // (1) Uma regra só. (a) Onde o gate casa, a referência casa. (b) Onde a referência casa e o
  // gate não, o gate acusa a dúvida. Com (a) e (b), "vale a última regra que casa" nunca dá
  // posse a quem a referência não daria — e (2) confere isso direto, com duas regras.
  const open = [], silent = [];
  let checked = 0;
  for (const p of patterns) for (const path of PATHS) {
    const ref = refMatch(p, path), m = codeownersMatch(`${p} @x\n`, path);
    checked++;
    if (m.owners && m.doubt === null && ref !== true) open.push(`${p} × ${path}`);
    if (ref === true && !m.owners && m.doubt === null) silent.push(`${p} × ${path}`);
  }
  assert.ok(patterns.size > 15000 && checked > 200000, `${patterns.size} padrões, ${checked} casos`);
  assert.deepEqual(open.slice(0, 10), [], `o gate casa e a referência não (${open.length})`);
  assert.deepEqual(silent.slice(0, 10), [], `a referência casa, o gate não casa nem acusa dúvida (${silent.length})`);
  // (2) Duas regras, nas duas ordens: o dono pelo gate tem de ser dono pela referência.
  const GENERIC = ["*", "**", "/*", "/.context/", ".context/", "/.context/**", "/.context/*", "*.md", "/.context", "/.context/engineering/"];
  const small = [...patterns].filter(p => p.split("/").filter(Boolean).length <= 2);
  const wrong = [];
  for (const g of GENERIC) for (const s of small) for (const [first, second] of [[g, s], [s, g]]) {
    if (first === second) continue;
    const text = `${first} @first\n${second} @second\n`;
    for (const path of PATHS) {
      const got = gateOwners(text, path), ref = refOwners(text, path);
      if (!got.every(o => ref.includes(o))) wrong.push(`[${first} → ${second}] ${path}: gate=${got} referência=${ref}`);
    }
  }
  assert.deepEqual(wrong.slice(0, 10), [], `ABRE em ${wrong.length} caso(s)`);
});

test("I6/r3: linha que o gate não entende inteira é dúvida quando o padrão casa (ou não é entendido)", () => {
  const base = "/.context/ @arquiteta\n";
  const later = [
    "/.context/ @larga, @outra",          // vírgula colada no dono
    "/.context/ larga",                   // dono sem @
    "/.context/ @larga @",                // @ sozinho
    "/.context/ @arqui#teta @larga",      // `#` no meio de um dono: comentário ou parte do nome?
    "/.context/#x @larga",                // `#` no meio do padrão
    `/.context/${NBSP}@larga`,            // espaço que não é ASCII gruda no padrão…
    `/.context/ @larga${NBSP}@outra`,     // … ou no dono
    "**/ @larga", "/**/ @larga", "/.context/**/**/x @larga",   // padrões degenerados
  ];
  for (const line of later) {
    const text = `${base}${line}\n`;
    assert.deepEqual(codeownersFor(text, STD), [], JSON.stringify(line));
    for (const who of ["larga", "outra", "arquiteta"]) {
      const r = verify({ codeownersText: text, ratchetPaths: [STD], api: by(who) });
      assert.equal(r.ok, false, `${who}: ${JSON.stringify(line)}`);
      assert.match(r.reason, /fora do formato|fora do subconjunto/, JSON.stringify(line));
      assert.doesNotMatch(r.reason, /[\u0000-\u001f]/);
    }
  }
  // Linha fora do formato cujo padrão NÃO casa o arquivo não atrapalha…
  assert.deepEqual(codeownersMatch(`${base}/docs/ @larga, @outra\n`, STD), { owners: ["@arquiteta"], doubt: null });
  // … e uma regra posterior que casa, bem formada, decide.
  assert.deepEqual(codeownersMatch(`/.context/ @larga, @outra\n${base}`, STD), { owners: ["@arquiteta"], doubt: null });
  // BOM no começo do arquivo: a primeira linha não é entendida.
  assert.deepEqual(codeownersFor(`${BOM}* @larga\n`, STD), []);
  assert.deepEqual(codeownersMatch(`${BOM}# comentário\n${base}`, STD), { owners: ["@arquiteta"], doubt: null });
  // E-mail é dono bem formado, mas não vira login: a regra casa e fica sem dono conhecido.
  assert.deepEqual(codeownersMatch(`${base}/.context/ docs@exemplo.com\n`, STD), { owners: [], doubt: null });
  // Comentário depois de espaço ou tab continua sendo comentário.
  assert.deepEqual(codeownersMatch("/.context/ @arquiteta\t# só ela\n", STD), { owners: ["@arquiteta"], doubt: null });
});

test("I6/r3: `?` vale um caractere inteiro, e caminho com U+FFFD (bytes que não são UTF-8) não tem aprovador", () => {
  assert.equal(codeownersPatternRegex("/.context/a?b.md").test(`.context/a${ASTRAL}b.md`), true);
  assert.equal(codeownersPatternRegex("/.context/a?b.md").test(".context/aXYb.md"), false);
  const p = `.context/engineering/standards/std-${REPLACEMENT}.md`;
  const o = ratchetOwners("/.context/ @arquiteta\n", [STD, p]);
  assert.equal(o.owners.size, 0);
  assert.equal(o.uncovered, p);
  assert.match(o.why, /UTF-8/);
  assert.equal(verify({ codeownersText: "/.context/ @arquiteta\n", ratchetPaths: [p], api: by("arquiteta") }).ok, false);
});

test("r3: CODEOWNERS com 3 MB ou mais é tratado como ausente — o GitHub ignora o arquivo inteiro", () => {
  const rule = "/.context/ @dona\n";
  const sized = (n) => `${rule}#${"x".repeat(n - rule.length - 2)}\n`;
  assert.equal(Buffer.byteLength(sized(3_000_000)), 3_000_000);
  const under = verify({ codeownersText: sized(2_999_999), api: by("dona") });
  assert.equal(under.ok, true, under.reason);
  for (const n of [3_000_000, 3_500_000]) {
    const r = verify({ codeownersText: sized(n), api: by("dona") });
    assert.equal(r.ok, false, String(n));
    assert.match(r.reason, /3 MB/);
  }
});
