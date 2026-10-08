import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, realpathSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fingerprint, normalizeMessage, toRelPosix, loadBaseline, saveBaseline, parseBaseline, BaselineError,
  initBaseline, splitByBaseline, pruneBaseline, acceptFinding, compareCounts, baselinePath, stripRoots,
  realPathOr, RealPathLoopError, reinitStandard,
} from "../../scripts/lib/standards-baseline.mjs";

const f = (o = {}) => { const x = { stdId: "std-a", ruleId: "r", path: "src/x.ts", line: 1, message: "m", ...o }; x.fp = fingerprint(x); return x; };

test("impressão digital ignora números (contagens e linhas)", () => {
  assert.equal(
    fingerprint(f({ message: normalizeMessage("3 tipo(s) problemático(s) em x.sql:12") })),
    fingerprint(f({ message: normalizeMessage("2 tipo(s) problemático(s) em x.sql:40") })),
  );
});

test("impressão digital muda com regra, arquivo ou std", () => {
  const base = fingerprint(f());
  assert.notEqual(base, fingerprint(f({ ruleId: "s" })));
  assert.notEqual(base, fingerprint(f({ path: "src/y.ts" })));
  assert.notEqual(base, fingerprint(f({ stdId: "std-b" })));
});

test("caminhos equivalentes viram o mesmo relativo POSIX", () => {
  assert.equal(toRelPosix("/p", "/p/src/x.ts"), "src/x.ts");
  assert.equal(toRelPosix("/p", "src\\x.ts"), "src/x.ts");
  assert.equal(toRelPosix("/p", "lib/../src/x.ts"), "src/x.ts");
  assert.equal(toRelPosix("/p", "/p/lib/../src/x.ts"), "src/x.ts");
  assert.equal(toRelPosix("C:\\p", "C:\\p\\src\\x.ts"), "src/x.ts");
  assert.equal(toRelPosix("C:\\p", "/c/p/src/x.ts"), "src/x.ts");
  assert.equal(toRelPosix("c:/p", "C:/p/src/x.ts"), "src/x.ts");
});

test("caminho fora do projeto → null", () => {
  assert.equal(toRelPosix("/p", "../fora.ts"), null);
  assert.equal(toRelPosix("/p", "/q/x.ts"), null);
  assert.equal(toRelPosix("/p", "/p/../q/x.ts"), null);
});

test("raiz por symlink (caso /private do macOS)", () => {
  const t = mkdtempSync(join(tmpdir(), "sl-"));
  mkdirSync(join(t, "real/src"), { recursive: true });
  symlinkSync(join(t, "real"), join(t, "link"));
  assert.equal(toRelPosix(join(t, "link"), join(t, "real/src/x.ts")), "src/x.ts");
  assert.equal(toRelPosix(join(t, "real"), join(t, "link/src/novo.ts")), "src/novo.ts");
});

test("init conta ocorrências e save/load fazem ida e volta", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-"));
  const b = initBaseline([f({ line: 1 }), f({ line: 9 })], { by: "t" });
  assert.equal(b.entries.length, 1);
  assert.equal(b.entries[0].count, 2);
  saveBaseline(root, b);
  assert.equal(loadBaseline(root).entries[0].count, 2);
});

test("multiconjunto: uma ocorrência aceita não isenta a segunda", () => {
  const b = initBaseline([f({ line: 3 })], { by: "t" });
  const { accepted, fresh } = splitByBaseline([f({ line: 3 }), f({ line: 57 })], b);
  assert.equal(accepted.length, 1);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].line, 57);
});

test("sem baseline, tudo é novo", () => {
  assert.equal(splitByBaseline([f()], null).fresh.length, 1);
});

test("sem arquivo → null; arquivo inválido → BaselineError", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-"));
  assert.equal(loadBaseline(root), null);
  mkdirSync(join(root, ".context/engineering/standards"), { recursive: true });
  writeFileSync(baselinePath(root), "x");
  assert.throws(() => loadBaseline(root), BaselineError);
  assert.throws(() => parseBaseline('{"version":1,"entries":[{"fp":"a"}]}', "t"), BaselineError);
  assert.throws(() => parseBaseline('{"version":2,"entries":[]}', "t"), BaselineError);
  assert.throws(() => parseBaseline('{"version":1,"entries":[{"fp":"a","count":1},{"fp":"a","count":1}]}', "t"), /repetida/);
});

test("prune reduz a contagem e remove o que zerou", () => {
  const a = f(), b = f({ ruleId: "s" });
  const bl = initBaseline([a, { ...a, line: 2 }, b], { by: "t" });
  const { baseline, removed } = pruneBaseline(bl, [a]);
  assert.equal(baseline.entries.length, 1);
  assert.equal(baseline.entries[0].count, 1);
  assert.equal(removed[0].fp, b.fp);
});

test("accept exige justificativa e soma à contagem", () => {
  const b = initBaseline([], { by: "t" });
  assert.throws(() => acceptFinding(b, f(), { by: "t" }), /justificativa/);
  const b2 = acceptFinding(acceptFinding(b, f(), { reason: "legado", by: "t" }), f(), { reason: "outro", by: "u" });
  assert.equal(b2.entries[0].count, 2);
  // I-8: a entrada carrega a aceitação mais recente; a justificativa digitada não some.
  assert.equal(b2.entries[0].reason, "outro");
  assert.equal(b2.entries[0].acceptedBy, "u");
});

test("accept em impressão digital criada pelo init grava reason, acceptedBy e acceptedAt da aceitação", () => {
  const antigo = "2020-01-01T00:00:00.000Z";
  const outra = f({ ruleId: "s" });
  const b = initBaseline([f(), outra], { by: "init-user" });
  for (const e of b.entries) e.acceptedAt = antigo;
  const t0 = Date.now();
  const b2 = acceptFinding(b, f(), { reason: "mais uma no mesmo arquivo", by: "operador" });
  const e = b2.entries.find(x => x.fp === f().fp);
  assert.equal(e.count, 2);
  assert.equal(e.reason, "mais uma no mesmo arquivo");
  assert.equal(e.acceptedBy, "operador");
  assert.ok(Date.parse(e.acceptedAt) >= t0, `acceptedAt não foi atualizado: ${e.acceptedAt}`);
  // A outra entrada (sem reason, do init) fica como estava e continua válida.
  const o = b2.entries.find(x => x.fp === outra.fp);
  assert.deepEqual(o, b.entries.find(x => x.fp === outra.fp));
  assert.equal("reason" in o, false);
});

test("accept repetido: formato segue version 1, o save/load aceita e a catraca só vê o count", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-"));
  const base = initBaseline([f()], { by: "t" });
  const head = acceptFinding(base, f(), { reason: "r", by: "u" });
  assert.equal(head.version, 1);
  saveBaseline(root, head);
  const loaded = loadBaseline(root);
  assert.equal(loaded.version, 1);
  assert.equal(loaded.entries[0].reason, "r");
  assert.deepEqual(compareCounts(loaded, base), [{ fp: f().fp, stdId: "std-a", ruleId: "r", path: "src/x.ts", head: 2, base: 1 }]);
  // Só a justificativa diferente, com o mesmo count, não é aumento para a catraca.
  const soTexto = { version: 1, entries: loaded.entries.map(e => ({ ...e, reason: "outro texto", acceptedBy: "z" })) };
  assert.deepEqual(compareCounts(soTexto, loaded), []);
});

test("stripRoots tira as raízes da mensagem", () => {
  assert.equal(stripRoots("2 problemas em /tmp/c1/src/b.py.", ["/tmp/c1"]), "2 problemas em src/b.py.");
  assert.equal(stripRoots("em C:\\w\\src\\b.py", ["C:\\w"]), "em src\\b.py");
});

test("compareCounts aponta só o que o HEAD aceita a mais", () => {
  const base = initBaseline([f()], { by: "t" });
  const head = initBaseline([f(), f({ line: 2 }), f({ ruleId: "s" })], { by: "t" });
  const excess = compareCounts(head, base);
  assert.equal(excess.length, 2);
  assert.deepEqual(excess.map(e => [e.head, e.base]).sort(), [[1, 0], [2, 1]]);
});

// R3 (decisão do controller): helper único de realpath tolerante a caminho inexistente,
// exportado para T6 (engine) e T16 (guard) importarem. Testado diretamente com os três
// casos exigidos: caminho existente, arquivo inexistente em diretório existente, raiz via
// symlink.
test("realPathOr: caminho existente resolve para o próprio realpath", () => {
  const t = mkdtempSync(join(tmpdir(), "rp-"));
  mkdirSync(join(t, "real"), { recursive: true });
  assert.equal(realPathOr(join(t, "real")), realpathSync(join(t, "real")));
});

test("realPathOr: arquivo inexistente em diretório existente junta o restante do caminho", () => {
  const t = mkdtempSync(join(tmpdir(), "rp-"));
  mkdirSync(join(t, "dir"), { recursive: true });
  assert.equal(
    realPathOr(join(t, "dir/nao-existe.ts")),
    join(realpathSync(join(t, "dir")), "nao-existe.ts"),
  );
});

test("realPathOr: raiz por symlink resolve através do link até o alvo real", () => {
  const t = mkdtempSync(join(tmpdir(), "rp-"));
  mkdirSync(join(t, "real/src"), { recursive: true });
  symlinkSync(join(t, "real"), join(t, "link"));
  assert.equal(
    realPathOr(join(t, "link/src/novo.ts")),
    join(realpathSync(join(t, "real")), "src", "novo.ts"),
  );
});

// ---------------------------------------------------------------------------
// Correção — rodada 1 (revisão de segurança): I-1, I-2, I-3, M-4 e menores.
// ---------------------------------------------------------------------------

// I-1: saveBaseline seguia symlink no .tmp previsível e sobrescrevia arquivo arbitrário.
test("saveBaseline: symlink no nome previsível de .tmp não é seguido — vítima intacta", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-"));
  mkdirSync(join(root, ".context/engineering/standards"), { recursive: true });
  const victim = join(root, "vitima.txt");
  writeFileSync(victim, "conteúdo original");
  const p = baselinePath(root);
  symlinkSync(victim, `${p}.tmp`); // nome previsível que a versão vulnerável usava
  saveBaseline(root, initBaseline([f()], { by: "t" }));
  assert.equal(readFileSync(victim, "utf-8"), "conteúdo original");
  assert.equal(loadBaseline(root).entries.length, 1);
});

// I-1: baseline.json em si não pode ser um link simbólico (R7, como standards-loader.mjs).
test("loadBaseline e saveBaseline recusam baseline.json que seja link simbólico", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-"));
  mkdirSync(join(root, ".context/engineering/standards"), { recursive: true });
  const alvo = join(root, "alvo.json");
  writeFileSync(alvo, '{"version":1,"entries":[]}');
  symlinkSync(alvo, baselinePath(root));
  assert.throws(() => loadBaseline(root), BaselineError);
  assert.throws(() => saveBaseline(root, initBaseline([], { by: "t" })), BaselineError);
});

// I-2: validate aceitava entradas com rótulos forjados ou campos faltando.
test("validate recusa entrada com rótulos forjados (fp de uma regra, campos de outra)", () => {
  const a = f({ stdId: "std-a", ruleId: "r1", path: "src/a.ts", message: "m1" });
  const forjada = { fp: a.fp, stdId: "std-b", ruleId: "r2", path: "src/b.ts", message: "m2", count: 1 };
  assert.throws(
    () => parseBaseline(JSON.stringify({ version: 1, entries: [forjada] }), "t"),
    BaselineError,
  );
});

test("validate recusa entrada com campos faltando ({fp, count} só)", () => {
  assert.throws(
    () => parseBaseline('{"version":1,"entries":[{"fp":"a","count":1}]}', "t"),
    BaselineError,
  );
});

test("initBaseline e acceptFinding gravam message consistente com o fp (round-trip init/save/load)", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-"));
  const a = f({ path: "src/a.ts", message: "algo aconteceu" });
  const b0 = initBaseline([a], { by: "t" });
  const novo = f({ path: "src/novo.ts", message: "outra coisa", ruleId: "s2" });
  const b1 = acceptFinding(b0, novo, { reason: "legado", by: "t" });
  saveBaseline(root, b1);
  const loaded = loadBaseline(root); // lança se fp não bater com stdId/ruleId/path/message
  assert.equal(loaded.entries.length, 2);
  for (const e of loaded.entries) assert.equal(e.fp, fingerprint(e));
});

// I-3: realPathOr tratava symlink pendurado como inexistente (existsSync não segue o link).
test("realPathOr: symlink pendurado é seguido até o alvo, mesmo inexistente", () => {
  const t = mkdtempSync(join(tmpdir(), "rp-"));
  mkdirSync(join(t, "proj"), { recursive: true });
  mkdirSync(join(t, "outside"), { recursive: true });
  symlinkSync(join("..", "outside", "nao-existe"), join(t, "proj/dang"));
  assert.equal(
    realPathOr(join(t, "proj/dang")),
    join(realpathSync(join(t, "outside")), "nao-existe"),
  );
  // Pelo caminho real (já resolvido), o achado não fica "dentro" do projeto — a resolução
  // do symlink revela que ele escapa para fora de proj/. toRelPosix não é verificação de
  // contenção; quem precisa dessa garantia deve resolver com realPathOr antes de chamá-la.
  assert.equal(toRelPosix(join(t, "proj"), realPathOr(join(t, "proj/dang"))), null);
});

// M-4: achado com path null nunca pode ser aceito, e a ordenação não pode lançar com null.
test("splitByBaseline: achado com path null nunca é aceito e a ordenação não quebra", () => {
  const withPath = f({ path: "src/x.ts", line: 5 });
  const semPath = { stdId: "std-a", ruleId: "r", path: null, message: "m", line: 1 };
  semPath.fp = fingerprint(semPath);
  const b = initBaseline([withPath, semPath], { by: "t" });
  assert.doesNotThrow(() => splitByBaseline([semPath, withPath], b));
  const { accepted, fresh } = splitByBaseline([semPath, withPath], b);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].path, "src/x.ts");
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].path, null);
});

// Menor: stripRoots cortava a raiz como prefixo textual, sem exigir separador ou fim.
test("stripRoots não corta quando a raiz é só prefixo textual de um segmento maior", () => {
  assert.equal(stripRoots("/tmp/c10/x", ["/tmp/c1"]), "/tmp/c10/x");
});

// Menor: raízes vazias e a raiz "/" (depois de normalizar) precisam ser descartadas.
test("stripRoots descarta raízes vazias e a raiz \"/\" após normalizar", () => {
  assert.equal(stripRoots("/tmp/c1/x", ["", null, "/"]), "/tmp/c1/x");
});

// Menor: count aceitava qualquer "inteiro" de ponto flutuante, incluindo 1e300.
test("count aceita só inteiro seguro (rejeita 1e300)", () => {
  assert.throws(() => parseBaseline('{"version":1,"entries":[{"fp":"x","count":1e300}]}', "t"), BaselineError);
});

// ---------------------------------------------------------------------------
// Correção — rodada 2 (re-revisão): quebra Important da mesma classe do I-3, mais o
// ruling de saveBaseline/loadBaseline/stripRoots. PoCs: poc6.mjs e poc7.mjs.
// ---------------------------------------------------------------------------

// PoC7: `proj/ext -> outside/deep` e `proj/evil -> "ext/../secret"`. O kernel resolve ".."
// fisicamente DEPOIS de já ter atravessado o symlink "ext" (physically em outside/deep), e
// dá outside/secret; um join/normalize lexical cancelaria "ext" e o "..", devolvendo
// proj/secret — que parece interno.
test("realPathOr: resolve o alvo físico do symlink mesmo com '..' embutido no alvo (poc7)", () => {
  const t = mkdtempSync(join(tmpdir(), "esc-"));
  const proj = join(t, "proj");
  mkdirSync(proj);
  mkdirSync(join(t, "outside/deep"), { recursive: true });
  writeFileSync(join(t, "outside/secret"), "SEGREDO EXTERNO");
  symlinkSync(join(t, "outside/deep"), join(proj, "ext"));
  symlinkSync("ext/../secret", join(proj, "evil"));
  assert.equal(realPathOr(join(proj, "evil")), realpathSync.native(join(proj, "evil")));
  assert.equal(realPathOr(join(proj, "evil")), join(realpathSync(join(t, "outside")), "secret"));
});

test("toRelPosix: symlink com '..' embutido no alvo não passa por 'dentro' do projeto (poc7)", () => {
  const t = mkdtempSync(join(tmpdir(), "esc-"));
  const proj = join(t, "proj");
  mkdirSync(proj);
  mkdirSync(join(t, "outside/deep"), { recursive: true });
  writeFileSync(join(t, "outside/secret"), "SEGREDO EXTERNO");
  symlinkSync(join(t, "outside/deep"), join(proj, "ext"));
  symlinkSync("ext/../secret", join(proj, "evil"));
  // chamado direto (sem o caller pré-resolver) — é como o engine chamaria de verdade.
  assert.equal(toRelPosix(proj, join(proj, "evil")), null);
  // e também pelo caminho já resolvido (padrão "resolva antes" do JSDoc de toRelPosix).
  assert.equal(toRelPosix(proj, realPathOr(join(proj, "evil"))), null);
});

// Ciclo de symlinks: realPathOr precisa lançar (erro identificável), nunca devolver `p`.
test("realPathOr: ciclo de symlinks (a <-> b) lança em vez de devolver o caminho lexical", () => {
  const t = mkdtempSync(join(tmpdir(), "cyc-"));
  const proj = join(t, "proj");
  mkdirSync(proj);
  symlinkSync("b", join(proj, "a"));
  symlinkSync("a", join(proj, "b"));
  assert.throws(() => realPathOr(join(proj, "a")), RealPathLoopError);
});

test("toRelPosix: ciclo de symlinks dá null (realPathOr lança e é tratado como fora)", () => {
  const t = mkdtempSync(join(tmpdir(), "cyc-"));
  const proj = join(t, "proj");
  mkdirSync(proj);
  symlinkSync("b", join(proj, "a"));
  symlinkSync("a", join(proj, "b"));
  assert.equal(toRelPosix(proj, join(proj, "a")), null);
});

// Cadeia de 41 saltos: estoura o limite (40) e precisa lançar, não devolver o lexical.
test("realPathOr e toRelPosix: cadeia de 41 saltos de symlink estoura o limite", () => {
  const t = mkdtempSync(join(tmpdir(), "chain-"));
  const proj = join(t, "proj");
  mkdirSync(proj);
  mkdirSync(join(t, "out"), { recursive: true });
  for (let i = 0; i < 41; i++) {
    symlinkSync(i === 40 ? join(t, "out/secret") : `l${i + 1}`, join(proj, `l${i}`));
  }
  assert.throws(() => realPathOr(join(proj, "l0")), RealPathLoopError);
  assert.equal(toRelPosix(proj, join(proj, "l0")), null);
});

// Os testes de symlink pendurado e de raiz por symlink (rodada 1) continuam verdes — ver
// "realPathOr: symlink pendurado é seguido até o alvo, mesmo inexistente" e "raiz por
// symlink (caso /private do macOS)" mais acima no arquivo; não duplicados aqui.

// Ruling: saveBaseline recusa quando o DIRETÓRIO real do baseline escapa do projeto —
// cobre `.context/engineering/standards` sendo um symlink pra fora (poc6).
test("saveBaseline recusa quando o diretório real do baseline escapa do projeto", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-"));
  mkdirSync(join(root, ".context/engineering"), { recursive: true });
  const elsewhere = mkdtempSync(join(tmpdir(), "else-"));
  symlinkSync(elsewhere, join(root, ".context/engineering/standards"));
  assert.throws(() => saveBaseline(root, initBaseline([f()], { by: "t" })), BaselineError);
  assert.deepEqual(readdirSync(elsewhere), []); // nada foi escrito no diretório de fora
});

// Ruling: se o renameSync falhar (baseline.json é um diretório), o tmp órfão não pode
// ficar para trás — remove num catch/finally e relança.
test("saveBaseline limpa o tmp órfão e relança se o renameSync falhar", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-"));
  mkdirSync(baselinePath(root), { recursive: true }); // baseline.json como diretório
  const standardsDir = join(root, ".context/engineering/standards");
  assert.throws(() => saveBaseline(root, initBaseline([f()], { by: "t" })));
  const leftovers = readdirSync(standardsDir).filter((n) => n.includes(".tmp"));
  assert.deepEqual(leftovers, []);
});

// Ruling: raiz de drive nua (C:\ ou C:) é tão perigosa de cortar quanto "/" — descarta.
test("stripRoots descarta raiz de drive nua (C:\\ / C:) do mesmo jeito que a raiz \"/\"", () => {
  assert.equal(stripRoots("em C:\\w\\x e C:/w/y", ["C:\\"]), "em C:\\w\\x e C:/w/y");
});

// Ruling: loadBaseline usa O_NOFOLLOW (fecha a janela TOCTOU) e qualquer erro de leitura
// que não seja ENOENT (ex.: EISDIR) vira BaselineError, não uma exceção crua do fs.
test("loadBaseline: baseline.json sendo diretório (EISDIR) vira BaselineError", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-"));
  mkdirSync(baselinePath(root), { recursive: true });
  assert.throws(() => loadBaseline(root), BaselineError);
});

// T14 rodada 1 (Important): baseline.json como FIFO travava o open (O_NOFOLLOW sem
// O_NONBLOCK). Agora: leitura segura da T9 — FIFO, dispositivo ou > 1 MiB viram BaselineError.
import { spawnSync } from "node:child_process";
import { after } from "node:test";
import { rmSync } from "node:fs";
const BL_URL = new URL("../../scripts/lib/standards-baseline.mjs", import.meta.url).href;
function loadInChild(root) {
  const code = `import(${JSON.stringify(BL_URL)}).then(m=>{try{m.loadBaseline(process.argv[1]);console.log("ok")}catch(e){console.log((e instanceof m.BaselineError?"BaselineError: ":"outro: ")+e.message)}})`;
  const t0 = Date.now();
  const r = spawnSync("bash", ["-c", 'ulimit -v 3000000; exec "$0" --input-type=module -e "$1" "$2"', process.execPath, code, root],
    { encoding: "utf8", timeout: 3000, killSignal: "SIGKILL" });
  return { ms: Date.now() - t0, r };
}
const blRoots = [];
after(() => { for (const d of blRoots) rmSync(d, { recursive: true, force: true }); });
const blRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "bl-"));
  blRoots.push(root);
  mkdirSync(join(root, ".context/engineering/standards"), { recursive: true });
  return root;
};

test("loadBaseline: FIFO → BaselineError sem travar", () => {
  const root = blRoot();
  spawnSync("mkfifo", [baselinePath(root)]);
  const { ms, r } = loadInChild(root);
  assert.ok(ms < 2000, `travou: ${ms}ms (signal ${r.signal})`);
  assert.match(r.stdout, /^BaselineError: baseline inválido/);
});

test("loadBaseline: symlink para /dev/zero → BaselineError sem travar", () => {
  const root = blRoot();
  symlinkSync("/dev/zero", baselinePath(root));
  const { ms, r } = loadInChild(root);
  assert.ok(ms < 2000, `travou: ${ms}ms (signal ${r.signal})`);
  assert.match(r.stdout, /^BaselineError: baseline inválido/);
});

test("loadBaseline: arquivo acima do teto → BaselineError (teto injetado, para não criar 16 MiB)", () => {
  const root = blRoot();
  writeFileSync(baselinePath(root), JSON.stringify({ version: 1, entries: [] }) + " ".repeat(2048));
  assert.throws(() => loadBaseline(root, { maxBytes: 1024 }), (e) => e instanceof BaselineError && /TOO_BIG/.test(e.message));
  assert.deepEqual(loadBaseline(root), { version: 1, entries: [] });
});

// T14 rodada 1 (ruling do teto): baseline com teto próprio de 16 MiB, igual no load e no save.
import * as baselineMod from "../../scripts/lib/standards-baseline.mjs";

test("teto do baseline: BASELINE_MAX_BYTES = 16 MiB", () => {
  assert.equal(baselineMod.BASELINE_MAX_BYTES, 16 * 1024 * 1024);
});

test("baseline de ~2 MiB (acima do teto de 1 MiB do .devflow.yaml) carrega normalmente", () => {
  const root = blRoot();
  const entries = [];
  for (let i = 0; entries.length < 12000; i++) entries.push({ ...f({ path: `src/m${i}.ts`, message: `mensagem ${i} ${"x".repeat(40)}` }), count: 1 });
  saveBaseline(root, { version: 1, entries });
  const size = readFileSync(baselinePath(root)).length;
  assert.ok(size > 2 * 1024 * 1024, `fixture pequena demais: ${size} bytes`);
  assert.equal(loadBaseline(root).entries.length, 12000);
});

test("saveBaseline acima do teto lança BaselineError e não grava nada (nem o diretório, nem tmp)", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-cap-"));
  blRoots.push(root);
  const big = { version: 1, entries: [{ ...f(), count: 1 }] };
  assert.throws(() => saveBaseline(root, big, { maxBytes: 100 }),
    (e) => e instanceof BaselineError && /teto|bytes/.test(e.message));
  assert.deepEqual(readdirSync(root), [], "save recusado deixou rastro no disco");
});

test("saveBaseline acima do teto não sobrescreve o baseline existente", () => {
  const root = blRoot();
  const small = { version: 1, entries: [{ ...f(), count: 1 }] };
  saveBaseline(root, small);
  const before = readFileSync(baselinePath(root), "utf8");
  const more = { version: 1, entries: [{ ...f(), count: 1 }, { ...f({ path: "src/y.ts" }), count: 2 }] };
  assert.throws(() => saveBaseline(root, more, { maxBytes: before.length }), BaselineError);
  assert.equal(readFileSync(baselinePath(root), "utf8"), before);
  assert.deepEqual(readdirSync(join(root, ".context/engineering/standards")), ["baseline.json"]);
});

const T0 = { entries: 0, count: 0 };

test("reinit: entrada nova recebe justificativa e autor; a de outro standard fica como estava", () => {
  const keepA = f({ stdId: "std-a", message: "a1" });
  const oldB = f({ stdId: "std-b", message: "antiga" });
  const bl = initBaseline([keepA, oldB, oldB], { by: "ana" });
  const n1 = f({ stdId: "std-b", message: "nova", line: 3 });
  const n2 = f({ stdId: "std-b", message: "nova", line: 9 });
  const n3 = f({ stdId: "std-b", ruleId: "s", message: "outra" });
  const out = reinitStandard(bl, [keepA, n1, n2, n3], "std-b", { reason: "linter migrado", by: "bia" });
  assert.equal(out.changed, true);
  assert.equal(out.baseline.entries[0], bl.entries[0]);
  const b = out.baseline.entries.filter(e => e.stdId === "std-b");
  assert.deepEqual(b.map(e => [e.fp, e.count]), [[n1.fp, 2], [n3.fp, 1]]);
  assert.ok(b.every(e => e.reason === "linter migrado" && e.acceptedBy === "bia" && e.acceptedAt));
  assert.ok(!out.baseline.entries.some(e => e.fp === oldB.fp));
  assert.deepEqual([out.kept, out.added, out.altered, out.removed], [T0, { entries: 2, count: 3 }, T0, { entries: 1, count: 2 }]);
  assert.deepEqual(out.byRule, [["r", 2], ["s", 1]]);
  assert.doesNotThrow(() => parseBaseline(JSON.stringify(out.baseline)));
});

test("reinit: entrada com mesma impressão digital e contagem fica intacta, com a justificativa antiga", () => {
  const a = f({ stdId: "std-b", path: "src/a.ts" });
  const b = f({ stdId: "std-b", path: "src/b.ts" });
  const bl = acceptFinding(initBaseline([a], { by: "ana" }), b, { reason: "legado do fornecedor, chamado 123", by: "ana" });
  const novo = f({ stdId: "std-b", path: "src/c.ts" });
  const out = reinitStandard(bl, [a, b, novo], "std-b", { reason: "aceite em lote", by: "bia" });
  assert.equal(out.changed, true);
  for (const e of bl.entries) assert.ok(out.baseline.entries.includes(e), `a entrada de ${e.path} foi regravada`);
  assert.equal(out.baseline.entries.find(e => e.fp === b.fp).reason, "legado do fornecedor, chamado 123");
  assert.equal(out.baseline.entries.find(e => e.fp === novo.fp).reason, "aceite em lote");
  assert.deepEqual([out.kept, out.added, out.altered, out.removed], [{ entries: 2, count: 2 }, { entries: 1, count: 1 }, T0, T0]);
  assert.deepEqual([out.newPaths, out.grownPaths], [["src/c.ts"], []]);
});

test("reinit: contagem que mudou regrava a entrada e aparece como caminho que cresceu", () => {
  const a = f({ stdId: "std-b", path: "src/a.ts" });
  const out = reinitStandard(initBaseline([a], { by: "ana" }), [a, a, a], "std-b", { reason: "mais duas", by: "bia" });
  const e = out.baseline.entries.find(x => x.fp === a.fp);
  assert.deepEqual([e.count, e.reason, e.acceptedBy], [3, "mais duas", "bia"]);
  assert.deepEqual([out.kept, out.added, out.altered, out.removed], [T0, T0, { entries: 1, count: 3 }, T0]);
  assert.deepEqual([out.newPaths, out.grownPaths], [[], [["src/a.ts", 1, 3]]]);
  assert.deepEqual(out.byRule, [["r", 3]]);
});

test("reinit: caminho novo e caminho que cresceu saem do caminho, não da mensagem", () => {
  // Migração: todas as mensagens mudam (impressões digitais novas) e os arquivos são os mesmos.
  const b = (path, message) => f({ stdId: "std-b", path, message });
  const bl = initBaseline([b("src/a.ts", "antiga"), b("src/b.ts", "antiga")]);
  const migrado = [b("src/a.ts", "nova"), b("src/b.ts", "nova")];
  const legit = reinitStandard(bl, migrado, "std-b", { reason: "x", by: "bia" });
  assert.deepEqual([legit.newPaths, legit.grownPaths], [[], []]);
  const comPlanta = [...migrado, b("src/b.ts", "nova"), b("src/plantado.ts", "nova")];
  const out = reinitStandard(bl, comPlanta, "std-b", { reason: "x", by: "bia" });
  assert.deepEqual(out.newPaths, ["src/plantado.ts"]);
  assert.deepEqual(out.grownPaths, [["src/b.ts", 1, 2]]);
});

test("reinit: as entradas dos outros standards saem idênticas (propriedade)", () => {
  let seed = 42;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const mk = () => f({ stdId: `std-${"abc"[rnd(3)]}`, ruleId: `r${rnd(3)}`, path: `src/f${rnd(4)}.ts`, message: `m${rnd(5)}` });
  for (let round = 0; round < 200; round++) {
    const bl = initBaseline(Array.from({ length: rnd(12) }, mk), { by: "ana" });
    const now = Array.from({ length: rnd(12) }, mk);
    const target = `std-${"abc"[rnd(3)]}`;
    const out = reinitStandard(bl, now, target, { reason: "x", by: "bia" });
    const others = (x) => x.entries.filter(e => e.stdId !== target);
    assert.deepEqual(others(out.baseline), others(bl), `rodada ${round}`);
    assert.ok(others(bl).every(e => out.baseline.entries.includes(e)), `rodada ${round}: entrada de outro standard foi copiada`);
    const want = new Map();
    for (const x of now) if (x.stdId === target) want.set(x.fp, (want.get(x.fp) || 0) + 1);
    const got = new Map(out.baseline.entries.filter(e => e.stdId === target).map(e => [e.fp, e.count]));
    assert.deepEqual(got, want, `rodada ${round}`);
  }
});

test("reinit: standard sem achados atuais fica sem entradas", () => {
  const a = f({ stdId: "std-a" }), b = f({ stdId: "std-b" });
  const out = reinitStandard(initBaseline([a, b]), [a], "std-b", { reason: "regra retirada", by: "bia" });
  assert.equal(out.changed, true);
  assert.deepEqual(out.baseline.entries.map(e => e.stdId), ["std-a"]);
  assert.deepEqual([out.kept, out.added, out.altered, out.removed], [T0, T0, T0, { entries: 1, count: 1 }]);
});

test("reinit: sem diferença devolve o mesmo baseline e changed false", () => {
  const a = f({ stdId: "std-a" }), b = f({ stdId: "std-b" });
  const bl = initBaseline([a, b, b], { by: "ana" });
  const out = reinitStandard(bl, [b, a, b], "std-b", { reason: "x", by: "bia" });
  assert.equal(out.changed, false);
  assert.equal(out.baseline, bl);
  assert.deepEqual([out.kept, out.added, out.altered, out.removed], [{ entries: 1, count: 2 }, T0, T0, T0]);
});

test("reinit: regra chamada constructor ou __proto__ é contada como qualquer outra", () => {
  const b = (ruleId, path = "src/x.ts") => f({ stdId: "std-b", ruleId, path });
  const out = reinitStandard(initBaseline([f({ stdId: "std-a" })]), [b("constructor"), b("__proto__"), b("__proto__", "src/y.ts")], "std-b", { reason: "x", by: "bia" });
  assert.deepEqual(out.byRule, [["__proto__", 2], ["constructor", 1]]);
});

test("reinit exige justificativa", () => {
  const bl = initBaseline([f()]);
  assert.throws(() => reinitStandard(bl, [f()], "std-a", { by: "bia" }), /justificativa/);
  assert.throws(() => reinitStandard(bl, [f()], "std-a", { reason: "   ", by: "bia" }), /justificativa/);
});
