/**
 * TG4 — linters default bundlados (subconjunto curado) + barra de FP (R14).
 * Run: node --test tests/validation/test-default-linters.mjs
 *
 * Conjunto curado conservador (baixo falso-positivo, alto sinal). Para cada um:
 *   - existe assets/standards/machine/std-<id>.js
 *   - enforcement.linter no .md aponta para machine/std-<id>.js
 *   - um snippet VIOLADOR dispara (VIOLATION + exit 1)
 *   - um snippet CONFORME NÃO dispara (FP bar — exit 0, sem VIOLATION)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const ASSETS = join(REPO, "assets/standards");

const CURATED = [
  { id: "std-security",
    bad: 'export const D = () => <div dangerouslySetInnerHTML={{ __html: x }} />;\n',
    good: 'export const D = () => <div>{x}</div>;\n' },
  { id: "std-error-handling",
    bad: 'export function f(){ try { risky(); } catch {} }\n',
    good: 'export function f(){ try { risky(); } catch (e) { logger.error(e); throw e; } }\n' },
  { id: "std-test-discipline",
    bad: 'it.only("faz algo", () => { expect(1).toBe(1); });\n',
    good: 'it("faz algo", () => { expect(1).toBe(1); });\n' },
  { id: "std-secret-conventions",
    bad: 'export const key = "sk-live-abc123def456ghi789jkl";\n',
    good: 'export const key = process.env.OPENAI_API_KEY;\n' },
  { id: "std-typescript-strict",
    bad: 'export default function f(x: any) { return x; }\n',
    good: 'export function f(x: unknown) { return x; }\n// nota: any value aqui é prosa, não tipo\n' },
  { id: "std-data-modeling",
    bad: 'CREATE TABLE orders (created_at TIMESTAMP, price FLOAT, name VARCHAR(255));\n',
    good: 'CREATE TABLE orders (created_at TIMESTAMPTZ NOT NULL, price NUMERIC(18,4), name TEXT);\n' },
  { id: "std-schemas",
    bad: 'export const S = z.object({ payload: z.any() }).passthrough();\n',
    good: 'export const S = z.object({ payload: z.unknown() });\n' },
  { id: "std-observability",
    bad: 'export function f(){ console.log("user", u); }\n',
    good: 'export function f(){ logger.info({ userId: u.id }, "user_loaded"); }\n' },
  { id: "std-migration",
    bad: 'CREATE INDEX idx_orders_tenant ON orders(tenant_id);\nUPDATE orders SET status = 1;\n',
    good: 'CREATE INDEX CONCURRENTLY idx_orders_tenant ON orders(tenant_id);\nUPDATE orders SET status = 1 WHERE id = 1;\n' },
  { id: "std-performance",
    bad: 'const q = "SELECT * FROM orders OFFSET 100";\n',
    good: 'const q = "SELECT id, total FROM orders WHERE id > $1 LIMIT 20";\n' },
  { id: "std-naming-conventions",
    bad: 'enum Status { A, B }\nconst isNotActive = true;\n',
    good: 'type Status = "A" | "B";\nconst isActive = false;\nclass IOStream {}\ninterface IPAddress {}\n' },
  { id: "std-runtime-validation",
    bad: 'const k = process.env.API_KEY!;\n',
    good: 'const k = requireEnv("API_KEY");\nif (process.env.NODE_ENV !== "prod" && process.env.X != null) {}\n' },
  { id: "std-api-conventions",
    bad: 'app.post("/v1/createOrder", handler);\n',
    good: 'app.post("/v1/orders", handler);\n' },
];

function runLinter(linterPath, content) {
  const tmp = mkdtempSync(join(tmpdir(), "tg4-"));
  const f = join(tmp, "sample.tsx");
  writeFileSync(f, content);
  const r = spawnSync("node", [linterPath, f], { encoding: "utf-8" });
  rmSync(tmp, { recursive: true, force: true });
  return r;
}

describe("TG4 — ReDoS guard (security review)", () => {
  it("std-error-handling: arquivo com whitespace gigante após 'catch' lint em <2s (sem ReDoS)", () => {
    const linterPath = join(ASSETS, "machine", "std-error-handling.js");
    const evil = "catch" + " ".repeat(200000) + "x\n"; // não casa, mas estressa backtracking
    const t0 = Date.now();
    const r = runLinter(linterPath, evil);
    const dt = Date.now() - t0;
    assert.equal(r.status, 0, "não deve casar (sem bloco vazio)");
    assert.ok(dt < 2000, `lint demorou ${dt}ms — possível ReDoS`);
  });
});

describe("TG4 — linters default curados + FP bar", () => {
  it("anti-no-op: TMPDIR é neutro (sem segmento excluído por GATE de path)", () => {
    // std-observability auto-exclui paths com /tests?/, /scripts/ etc. Se o tmpdir
    // do harness contiver um desses segmentos, o GATE viraria no-op e o teste do
    // violador passaria por exit 0 (falso verde). Este assert protege contra isso.
    assert.doesNotMatch(tmpdir(), /[\\/](tests?|__tests__|scripts)[\\/]/,
      "TMPDIR contém segmento excluído → observability viraria no-op");
  });

  for (const { id, bad, good } of CURATED) {
    const linterPath = join(ASSETS, "machine", `${id.replace(/^std-/, "std-")}.js`);

    it(`${id}: linter bundlado existe e está religado no .md`, () => {
      assert.ok(existsSync(linterPath), `${linterPath} deve existir`);
      const { data } = parseFrontmatter(readFileSync(join(ASSETS, `${id}.md`), "utf-8"));
      assert.equal(data.enforcement?.linter, `machine/${id}.js`,
        `${id}.md enforcement.linter deve apontar para machine/${id}.js`);
    });

    it(`${id}: snippet violador dispara VIOLATION`, () => {
      const r = runLinter(linterPath, bad);
      assert.equal(r.status, 1, `esperava exit 1 no violador: ${r.stdout}`);
      assert.match(r.stdout, /^VIOLATION:/m, `esperava VIOLATION: ${r.stdout}`);
    });

    it(`${id}: snippet conforme NÃO dispara (FP bar)`, () => {
      const r = runLinter(linterPath, good);
      assert.equal(r.status, 0, `conforme não deve falhar: ${r.stdout}`);
      assert.doesNotMatch(r.stdout, /VIOLATION/, `FP no conforme: ${r.stdout}`);
    });
  }
});

describe("Phase 5 — extensões", () => {
  // 5.1 secret-conventions
  it("secret-conventions: NEXT_PUBLIC_*KEY dispara", () => {
    const r = runLinter(join(ASSETS, "machine", "std-secret-conventions.js"), 'export const k = process.env.NEXT_PUBLIC_OPENAI_API_KEY;\n');
    assert.equal(r.status, 1, r.stdout);
  });
  it("secret-conventions: NEXT_PUBLIC_API_URL não dispara (FP bar)", () => {
    const r = runLinter(join(ASSETS, "machine", "std-secret-conventions.js"), 'export const u = process.env.NEXT_PUBLIC_API_URL;\n');
    assert.equal(r.status, 0, r.stdout);
  });

  // 5.2 error-handling
  it("error-handling: catch que só console.log dispara", () => {
    const r = runLinter(join(ASSETS, "machine", "std-error-handling.js"), 'try { f(); } catch (e) { console.log(e); }\n');
    assert.equal(r.status, 1, r.stdout);
  });
  it("error-handling: catch com log+rethrow não dispara (FP bar)", () => {
    const r = runLinter(join(ASSETS, "machine", "std-error-handling.js"), 'try { f(); } catch (e) { logger.error(e); throw e; }\n');
    assert.equal(r.status, 0, r.stdout);
  });

  // 5.3 security
  it("security: SQL string-interpolada dispara", () => {
    const r = runLinter(join(ASSETS, "machine", "std-security.js"), 'const q = `SELECT * FROM u WHERE id = ${id}`;\n');
    assert.equal(r.status, 1, r.stdout);
  });
  it("security: query parametrizada não dispara (FP bar)", () => {
    const r = runLinter(join(ASSETS, "machine", "std-security.js"), 'const r = db.query("SELECT * FROM u WHERE id = $1", [id]);\n');
    assert.equal(r.status, 0, r.stdout);
  });
  it("security: tagged sql template não dispara (FP bar)", () => {
    const r = runLinter(join(ASSETS, "machine", "std-security.js"), 'const q = sql`SELECT * FROM u WHERE id = ${id}`;\n');
    assert.equal(r.status, 0, r.stdout);
  });

  // 5.4 test-discipline
  it("test-discipline: waitForTimeout dispara", () => {
    const r = runLinter(join(ASSETS, "machine", "std-test-discipline.js"), 'await page.waitForTimeout(500);\n');
    assert.equal(r.status, 1, r.stdout);
  });
  it("test-discipline: expect(true).toBe(true) dispara", () => {
    const r = runLinter(join(ASSETS, "machine", "std-test-discipline.js"), 'expect(true).toBe(true);\n');
    assert.equal(r.status, 1, r.stdout);
  });
  it("test-discipline: assert real não dispara (FP bar)", () => {
    const r = runLinter(join(ASSETS, "machine", "std-test-discipline.js"), 'await expect(page.getByText("x")).toBeVisible();\n');
    assert.equal(r.status, 0, r.stdout);
  });
});

describe("ReDoS — todos os linters < 2s", () => {
  const dir = join(ASSETS, "machine");
  for (const f of readdirSync(dir).filter(n => n.endsWith(".js"))) {
    it(`${f} lint 200k chars < 2s`, () => {
      for (const evil of ["x".repeat(200000), "catch".repeat(40000), "CREATE TABLE ".repeat(15000)]) {
        const t0 = Date.now();
        runLinter(join(dir, f), evil);
        assert.ok(Date.now() - t0 < 2000, `${f} > 2s — possível ReDoS`);
      }
    });
  }
});
