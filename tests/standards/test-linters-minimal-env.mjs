// tests/standards/test-linters-minimal-env.mjs — os linters do plugin não dependem do ambiente.
//
// SI-4 #6 (ruling da T19): o `runOneLinter` entrega ao linter só uma allowlist de variáveis
// (PATH, HOME, TMPDIR/TMP/TEMP, LANG, LC_*). Aqui cada linter bundlado roda sobre o mesmo corpus
// com o ambiente INTEIRO do processo e com o ambiente MÍNIMO: a saída tem de ser a mesma. Se um
// linter passar a depender de uma variável fora da allowlist, é este teste que acusa.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runOneLinter, linterEnv } from "../../scripts/lib/run-linter.mjs";
import { hasViolation } from "../../scripts/lib/linter-protocol.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const MACHINE = join(REPO, "assets/standards/machine");
const PROFILES = join(REPO, "assets/standards/profiles");

// Arquivos com desvios de vários standards; o que importa é que muitos linters achem algo.
const CORPUS = {
  "src/app/page.tsx": [
    'export const D = () => <div dangerouslySetInnerHTML={{ __html: x }} />;',
    "export function f(){ try { risky(); } catch {} }",
    "const k = process.env.API_KEY!;",
    'export const key = process.env.NEXT_PUBLIC_OPENAI_API_KEY; console.log(process.env);',
    "const a: any = 1; // @ts-ignore",
    '<img src="x.png"><button onClick={go}></button><div onClick={go}>x</div>',
    'const t = "Salvar alterações"; fetch("/api/getUsers");',
    "console.log('pedido', pedido);",
  ].join("\n") + "\n",
  "src/x.test.ts": 'it.only("faz algo", async () => { await page.waitForTimeout(500); expect(true).toBe(true); });\n',
  "src/api/users.ts": [
    'app.get("/getUsers", async (req, res) => {',
    "  const rows = await db.query(`select * from users where id = ${req.params.id}`);",
    "  for (const r of rows) { await db.query(`select * from orders where user_id = ${r.id}`); }",
    "  res.json(rows);",
    "});",
    "export function handler(evt) { publish('order_created', evt); }",
  ].join("\n") + "\n",
  "src/domain/order.ts": 'import { prisma } from "../infra/db";\nexport const total = (o) => o.price * 1.1;\nexport class order_service {}\n',
  "db/migrations/001_init.sql": "CREATE TABLE pedidos (id SERIAL, valor FLOAT, criado TIMESTAMP);\nDROP TABLE antigos;\nALTER TABLE x DROP COLUMN y;\n",
  "src/schema.prisma": "model Pedido {\n  id Int @id @default(autoincrement())\n  valor Float\n}\n",
  "src/styles.css": "a { color: #fff; outline: none; }\n.x { font-size: 9px; transition: all 3s; }\n@keyframes pulse { 0% { opacity: 0 } }\n",
  "src/index.html": '<html><body><img src="x.png"><div onclick="a()" style="color:#777">Clique aqui</div><input type="text"></body></html>\n',
  "README.md": "# Projeto\n\nTODO: escrever.\n",
  "addons/venda/models/sale.py": [
    "from odoo import models, fields, api",
    "class sale_order(models.Model):",
    "    _inherit = 'sale.order'",
    "    total = fields.Float(compute='_compute_total')",
    "    def _compute_total(self):",
    "        for rec in self:",
    "            rec.total = sum(self.env['sale.order.line'].search([('order_id', '=', rec.id)]).mapped('price'))",
    "            self.env.cr.execute(\"select * from sale_order where id = %s\" % rec.id)",
    "            print('debug')",
    "    @api.multi",
    "    def action(self):",
    "        raise Exception('Erro ao confirmar')",
  ].join("\n") + "\n",
  "addons/venda/__manifest__.py": "{'name': 'Venda', 'version': '1.0', 'depends': ['base'], 'data': []}\n",
  "addons/venda/views/sale.xml": '<odoo><template id="t"><t t-raw="doc.note"/><div t-esc="x"/></template></odoo>\n',
  "addons/venda/static/src/js/widget.js": 'odoo.define("venda.widget", function (require) { var core = require("web.core"); console.log(1); });\n',
};

const root = mkdtempSync(join(tmpdir(), "linters-env-"));
after(() => rmSync(root, { recursive: true, force: true }));
for (const [rel, content] of Object.entries(CORPUS)) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

// O linter chamado direto, como o runOneLinter o chama, com o ambiente dado.
function direct(linter, rel, env) {
  return new Promise((done) => {
    execFile(process.execPath, [linter, rel], { cwd: root, encoding: "utf8", env, timeout: 10000 }, (err, stdout) => {
      done({ status: err ? (typeof err.code === "number" ? err.code : null) : 0, stdout });
    });
  });
}
const FILES = Object.keys(CORPUS);
// O contrato de saída (ADR-015 D4): 0, ou 1 com VIOLATION, são resultados; o resto é erro.
const isResult = (r) => r.status === 0 || (r.status === 1 && hasViolation(r.stdout));
const hasFinding = (stdout) => /^(VIOLATION|ADVISORY)\b/m.test(stdout);

const defaults = readdirSync(MACHINE).filter(n => /^std-.*\.js$/.test(n)).sort();
const profiles = readdirSync(PROFILES).flatMap((fw) => {
  let names = [];
  try { names = readdirSync(join(PROFILES, fw, "machine")); } catch { /* perfil sem linter */ }
  return names.filter(n => /^std-.*\.js$/.test(n)).sort().map(n => join(PROFILES, fw, "machine", n));
});

// O ambiente do teste ganha variáveis que NÃO passam pela allowlist: se um linter as lesse, a
// saída com o ambiente inteiro e com o mínimo divergiria.
const NOISE = { GH_TOKEN: "ghs_x", NODE_ENV: "production", CI: "true", DEBUG: "*", FORCE_COLOR: "1", NO_COLOR: "", TZ: "Pacific/Kiritimati" };
const fullEnv = () => ({ ...process.env, ...NOISE });

test("os 20 linters default: mesma saída pelo runOneLinter (ambiente mínimo) e com o ambiente inteiro", async () => {
  assert.equal(defaults.length, 20, `linters default: ${defaults.join(", ")}`);
  const saved = Object.fromEntries(Object.keys(NOISE).map(k => [k, process.env[k]]));
  Object.assign(process.env, NOISE);
  const withFindings = new Set();
  try {
    for (const name of defaults) {
      const std = { id: name.replace(/\.js$/, ""), origin: "default", enforcement: { linter: `machine/${name}` } };
      await Promise.all(FILES.map(async (rel) => {
        const label = `${name} × ${rel}`;
        const [full, min] = await Promise.all([
          direct(join(MACHINE, name), rel, fullEnv()),
          runOneLinter(std, rel, { projectRoot: root, cwd: root, trustedPlugin: REPO }),
        ]);
        assert.equal(min.ok, isResult(full), `${label}: ${min.reason ?? "ok"} × exit ${full.status} com o ambiente inteiro`);
        if (min.ok) assert.equal(min.stdout, full.stdout, label);
        if (min.ok && hasFinding(min.stdout)) withFindings.add(name);
      }));
    }
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  assert.ok(withFindings.size >= 10, `o corpus só faz ${withFindings.size} dos 20 linters acharem algo: ${[...withFindings].join(", ")}`);
});

test("os linters de perfil (odoo, nxz): mesma saída com o ambiente mínimo e com o ambiente inteiro", async () => {
  assert.ok(profiles.length >= 18, `linters de perfil: ${profiles.length}`);
  const withFindings = new Set();
  for (const linter of profiles) {
    await Promise.all(FILES.map(async (rel) => {
      const label = `${linter.slice(PROFILES.length + 1)} × ${rel}`;
      const [full, min] = await Promise.all([direct(linter, rel, fullEnv()), direct(linter, rel, linterEnv(fullEnv()))]);
      assert.ok(isResult(full), `${label}: exit ${full.status} com o ambiente inteiro`);
      assert.deepEqual(min, full, label);
      if (hasFinding(min.stdout)) withFindings.add(linter);
    }));
  }
  assert.ok(withFindings.size >= 6, `o corpus só faz ${withFindings.size} dos ${profiles.length} linters de perfil acharem algo`);
});
