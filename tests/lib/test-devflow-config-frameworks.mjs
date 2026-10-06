// Suite — leitura do bloco `frameworks:` do .devflow.yaml (ADR-011: parser único).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFrameworkVersions, readFrameworkVersionsFromPath } from "../../scripts/lib/devflow-config.mjs";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = `
git:
  strategy: branch-flow
frameworks:
  odoo:
    version: "17"
    confidence: high
    resolvedAt: "2026-09-02"
mempalace:
  enabled: true
`;

test("readFrameworkVersions lê o bloco aninhado", () => {
  assert.equal(readFrameworkVersions(SRC).get("odoo"), "17");
});

test("readFrameworkVersions ignora entrada sem version", () => {
  const m = readFrameworkVersions("frameworks:\n  odoo:\n    confidence: unknown\n");
  assert.equal(m.has("odoo"), false);
});

test("readFrameworkVersions devolve Map vazio quando o bloco não existe", () => {
  assert.equal(readFrameworkVersions("git:\n  strategy: x\n").size, 0);
});

test("readFrameworkVersions não vaza a chave do bloco seguinte", () => {
  const m = readFrameworkVersions(SRC);
  assert.equal(m.has("mempalace"), false, "o bloco frameworks termina na desindentação");
});

test("readFrameworkVersions tolera comentário inline", () => {
  // O parser de permissions.yaml já teve exatamente este bug: comentário inline
  // não removido virava parte do valor.
  const m = readFrameworkVersions('frameworks:\n  odoo:\n    version: "17"  # resolvido\n');
  assert.equal(m.get("odoo"), "17");
});

test("readFrameworkVersions aceita valor sem aspas", () => {
  assert.equal(readFrameworkVersions("frameworks:\n  odoo:\n    version: 17\n").get("odoo"), "17");
});

test("readFrameworkVersions não lança com input não-string", () => {
  assert.equal(readFrameworkVersions(null).size, 0);
  assert.equal(readFrameworkVersions(undefined).size, 0);
});

test("readFrameworkVersions lê múltiplos frameworks", () => {
  const m = readFrameworkVersions('frameworks:\n  odoo:\n    version: "17"\n  rails:\n    version: "7"\n');
  assert.equal(m.get("odoo"), "17");
  assert.equal(m.get("rails"), "7");
});

test("readFrameworkVersionsFromPath lê do disco e nunca lança em path ausente", () => {
  const dir = mkdtempSync(join(tmpdir(), "dfcfg-"));
  const p = join(dir, ".devflow.yaml");
  writeFileSync(p, 'frameworks:\n  odoo:\n    version: "17"\n');
  assert.equal(readFrameworkVersionsFromPath(p).get("odoo"), "17");
  assert.equal(readFrameworkVersionsFromPath(join(dir, "ausente.yaml")).size, 0);
  assert.equal(readFrameworkVersionsFromPath(null).size, 0);
  rmSync(dir, { recursive: true });
});

// T14 rodada 1 (Important): .devflow.yaml como FIFO ou symlink para /dev/zero travava o hook
// síncrono (RSS de 12 GB). Roda num filho com teto de memória virtual e timeout, para o RED
// não derrubar a máquina.
const CFG_URL = new URL("../../scripts/lib/devflow-config.mjs", import.meta.url).href;
function versionsInChild(path) {
  // Imprime as versões e o pico de RSS (kB): sob o ulimit, a leitura de /dev/zero falharia com
// ENOMEM e cairia no catch — o RSS denuncia que a leitura aconteceu.
  const code = `import(${JSON.stringify(CFG_URL)}).then(m=>{const v=[...m.readFrameworkVersionsFromPath(process.argv[1])];console.log(JSON.stringify({v,rss:process.resourceUsage().maxRSS}))})`;
  const t0 = Date.now();
  const r = spawnSync("bash", ["-c", 'ulimit -v 3000000; exec "$0" --input-type=module -e "$1" "$2"', process.execPath, code, path],
    { encoding: "utf8", timeout: 3000, killSignal: "SIGKILL" });
  return { ms: Date.now() - t0, r };
}

test("readFrameworkVersionsFromPath: FIFO → Map vazio, sem travar", () => {
  const dir = mkdtempSync(join(tmpdir(), "fw-fifo-"));
  try {
    const p = join(dir, ".devflow.yaml");
    spawnSync("mkfifo", [p]);
    const { ms, r } = versionsInChild(p);
    assert.ok(ms < 2000, `travou: ${ms}ms (signal ${r.signal})`);
    assert.deepEqual(JSON.parse(r.stdout).v, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("readFrameworkVersionsFromPath: symlink para /dev/zero → Map vazio, sem estourar memória", () => {
  const dir = mkdtempSync(join(tmpdir(), "fw-zero-"));
  try {
    const p = join(dir, ".devflow.yaml");
    symlinkSync("/dev/zero", p);
    const { ms, r } = versionsInChild(p);
    assert.ok(ms < 2000, `travou: ${ms}ms (signal ${r.signal})`);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.v, []);
    assert.ok(out.rss < 300 * 1024, `leu /dev/zero: pico de RSS ${Math.round(out.rss / 1024)} MB`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("readFrameworkVersionsFromPath: arquivo acima de 1 MiB → Map vazio", () => {
  const dir = mkdtempSync(join(tmpdir(), "fw-big-"));
  try {
    const p = join(dir, ".devflow.yaml");
    writeFileSync(p, SRC + "#".repeat(1024 * 1024));
    assert.equal(readFrameworkVersionsFromPath(p).size, 0);
    writeFileSync(p, SRC);
    assert.equal(readFrameworkVersionsFromPath(p).get("odoo"), "17");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
