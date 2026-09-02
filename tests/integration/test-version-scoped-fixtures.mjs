// Suite — valida os fixtures de regressão do escopo de versão.
//
// Os fixtures são DADO, não código: um fixture silenciosamente errado
// invalidaria as asserções de regressão das Tasks 6 e 9. Este teste existe
// para que o dado falhe alto quando alguém o mexer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "tests/fixtures/version-scoped";

test("fixture odoo17: três sondas independentes declaram a série 17", () => {
  const p = join(ROOT, "odoo17");
  assert.match(readFileSync(join(p, ".gitmodules"), "utf-8"), /branch = 17\.0/);
  assert.match(readFileSync(join(p, "Dockerfile"), "utf-8"), /FROM\s+odoo:17\.0/);
  assert.match(
    readFileSync(join(p, "addons/nxz_cadastro/__manifest__.py"), "utf-8"),
    /"version":\s*"17\./,
  );
});

test("fixture odoo17: o XML usa <tree>, correto no 17 e alvo do falso-positivo", () => {
  const xml = readFileSync(
    join(ROOT, "odoo17/addons/nxz_cadastro/views/cadastro_views.xml"),
    "utf-8",
  );
  assert.match(xml, /<tree/, "o fixture precisa conter <tree> para exercer a regra do 18");
  assert.doesNotMatch(xml, /<list/, "o fixture não pode já estar migrado para <list>");
});

test("fixture odoo12: sondas em 12 e API legítima da série", () => {
  const p = join(ROOT, "odoo12");
  assert.match(readFileSync(join(p, ".gitmodules"), "utf-8"), /branch = 12\.0/);
  assert.match(readFileSync(join(p, "Dockerfile"), "utf-8"), /FROM\s+odoo:12\.0/);
  const py = readFileSync(join(p, "addons/legacy_cadastro/models/cadastro.py"), "utf-8");
  assert.match(py, /@api\.multi/);
  assert.match(py, /def name_get/);
});

test("fixture ts-src: package.json com majors distintos e diretório src/ real", () => {
  const p = join(ROOT, "ts-src");
  const pkg = JSON.parse(readFileSync(join(p, "package.json"), "utf-8"));
  assert.equal(pkg.dependencies.react, "^18.3.1");
  assert.equal(pkg.devDependencies.typescript, "~5.4.5");
  assert.ok(existsSync(join(p, "src/index.ts")), "src/ deve existir de fato");
});
