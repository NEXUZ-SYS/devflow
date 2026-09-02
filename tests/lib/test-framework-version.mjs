// Suite — resolução da versão do framework no nível do projeto.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runProbe, aggregateMajority, classifyConfidence, npmDep, resolveStackVersions,
} from "../../scripts/lib/framework-version.mjs";

const ODOO17 = "tests/fixtures/version-scoped/odoo17";
const ODOO12 = "tests/fixtures/version-scoped/odoo12";

test("runProbe file+pattern extrai a série do .gitmodules", () => {
  const r = runProbe(ODOO17, { file: ".gitmodules", pattern: "path = odoo[\\s\\S]*?branch = (\\d+)\\.0" });
  assert.equal(r.value, "17");
  assert.equal(r.source, ".gitmodules");
});

test("runProbe file+pattern extrai a série do Dockerfile", () => {
  const r = runProbe(ODOO17, { file: "Dockerfile", pattern: "FROM\\s+odoo:(\\d+)\\.0" });
  assert.equal(r.value, "17");
});

test("runProbe devolve null quando o arquivo não existe — nunca lança", () => {
  const r = runProbe(ODOO17, { file: "Gemfile.lock", pattern: "rails \\((\\d+)\\." });
  assert.equal(r.value, null);
});

test("runProbe devolve null quando o pattern não casa — nunca lança", () => {
  const r = runProbe(ODOO17, { file: "Dockerfile", pattern: "FROM\\s+rails:(\\d+)" });
  assert.equal(r.value, null);
});

test("runProbe devolve null para pattern inválido — dado ruim não é crash", () => {
  const r = runProbe(ODOO17, { file: "Dockerfile", pattern: "FROM\\s+odoo:(\\d+" });
  assert.equal(r.value, null);
});

test("runProbe glob+majority agrega manifestos", () => {
  const r = runProbe(ODOO12, {
    glob: "addons/*/__manifest__.py",
    pattern: "['\"]version['\"]\\s*:\\s*['\"](\\d+)\\.",
    aggregate: "majority",
  });
  assert.equal(r.value, "12");
});

test("aggregateMajority resolve pelo mais frequente E reporta a contagem do vencedor", () => {
  // caso real medido: 48 de 54 manifestos em 17
  const vals = [...Array(48).fill("17"), ...Array(6).fill("1")];
  const r = aggregateMajority(vals);
  assert.equal(r.value, "17");
  assert.equal(r.tie, false);
  assert.equal(r.count, 48, "quantos concordaram com o VENCEDOR");
  assert.equal(r.total, 54, "quantos produziram algum valor");
});

test("a evidência da maioria mostra a divergência, não unanimidade falsa", () => {
  // Achado A2 da fase R: reportar N/N onde houve divergência recria a
  // opacidade que escondeu o bug original.
  const vals = [...Array(48).fill("17"), ...Array(6).fill("1")];
  const r = aggregateMajority(vals);
  assert.notEqual(r.count, r.total, "48 de 54 não pode aparecer como 54/54");
});

test("aggregateMajority sinaliza empate em vez de desempatar", () => {
  const r = aggregateMajority(["17", "18"]);
  assert.equal(r.tie, true);
  assert.equal(r.value, null, "empate NUNCA resolve por escolha arbitrária");
});

test("aggregateMajority com lista vazia devolve null sem empate", () => {
  const r = aggregateMajority([]);
  assert.equal(r.value, null);
  assert.equal(r.tie, false);
});

test("classifyConfidence: duas sondas concordando é high", () => {
  const ev = [
    { probe: "submodule-branch", value: "17", source: ".gitmodules" },
    { probe: "docker-base-image", value: "17", source: "Dockerfile" },
  ];
  assert.equal(classifyConfidence(ev), "high");
});

test("classifyConfidence: uma sonda é medium", () => {
  assert.equal(classifyConfidence([{ probe: "p", value: "17", source: "s" }]), "medium");
});

test("classifyConfidence: sondas discordando é ambiguous", () => {
  const ev = [
    { probe: "a", value: "17", source: "s1" },
    { probe: "b", value: "18", source: "s2" },
  ];
  assert.equal(classifyConfidence(ev), "ambiguous");
});

test("classifyConfidence: nenhuma sonda casou é unknown", () => {
  assert.equal(classifyConfidence([]), "unknown");
  assert.equal(classifyConfidence([{ probe: "a", value: null, source: "s" }]), "unknown");
});

const TS = "tests/fixtures/version-scoped/ts-src";

test("npmDep extrai o major de dependencies e devDependencies", () => {
  assert.equal(npmDep(TS, "react").value, "18");
  assert.equal(npmDep(TS, "typescript").value, "5");
});

test("npmDep devolve null para lib ausente e para projeto sem package.json", () => {
  assert.equal(npmDep(TS, "vue").value, null);
  assert.equal(npmDep(ODOO17, "react").value, null);
});

test("resolveStackVersions: sondas declarativas concordando dão high com evidência de lista", () => {
  const m = resolveStackVersions(ODOO17, [{
    lib: "odoo",
    versionDetect: [
      { file: ".gitmodules", pattern: "path = odoo[\\s\\S]*?branch = (\\d+)\\.0" },
      { file: "Dockerfile", pattern: "FROM\\s+odoo:(\\d+)\\.0" },
    ],
  }]);
  const r = m.get("odoo");
  assert.equal(r.version, "17");
  assert.equal(r.confidence, "high");
  assert.equal(r.evidence.length, 2, "evidência é LISTA, não booleano");
  assert.ok(r.evidence.every((e) => e.probe && e.source));
});

test("resolveStackVersions: versionDetect string resolve pela sonda embutida npmDep", () => {
  const m = resolveStackVersions(TS, [{ lib: "react", versionDetect: "npmDep" }]);
  assert.equal(m.get("react").version, "18");
  assert.equal(m.get("react").confidence, "medium");
});

test("resolveStackVersions: sonda embutida desconhecida é unknown, não crash", () => {
  const m = resolveStackVersions(TS, [{ lib: "react", versionDetect: "cargoDep" }]);
  assert.equal(m.get("react").confidence, "unknown");
});

test("resolveStackVersions: sondas discordando dão ambiguous e preservam as duas evidências", () => {
  const m = resolveStackVersions(ODOO17, [{
    lib: "odoo",
    versionDetect: [
      { file: ".gitmodules", pattern: "path = odoo[\\s\\S]*?branch = (\\d+)\\.0" },
      { file: "Dockerfile", pattern: "FROM\\s+odoo:17\\.(\\d+)" },
    ],
  }]);
  const r = m.get("odoo");
  assert.equal(r.confidence, "ambiguous");
  assert.equal(r.version, null, "ambiguous NÃO escolhe uma das versões");
  assert.equal(r.evidence.length, 2);
});
