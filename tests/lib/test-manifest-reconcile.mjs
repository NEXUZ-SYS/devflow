/**
 * Gate — reconcileManifest: poda, re-pin e fail-closed.
 *
 * SAFETY: fixture criado em tmpdir. Nenhum diretório rastreado é mutado.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadManifest, reconcileManifest } from "../../scripts/lib/manifest-stacks.mjs";

const MANIFEST_REL = ".context/engineering/stacks/manifest.yaml";

function setupManifest(frameworks) {
  const root = mkdtempSync(join(tmpdir(), "reconcile-"));
  mkdirSync(join(root, ".context/engineering/stacks"), { recursive: true });
  const body = ["spec: devflow-stack/v0", "frameworks:"];
  for (const [lib, cfg] of Object.entries(frameworks)) {
    body.push(`  ${lib}:`);
    body.push(`    version: "${cfg.version}"`);
    body.push("    mcpIndexed: true");
  }
  writeFileSync(join(root, MANIFEST_REL), body.join("\n") + "\n");
  return root;
}

const ODOO_SERIES = ["12", "17", "18"].map((s) => ({
  lib: `odoo-${s}`, family: "odoo", series: s, version: `${s}.0`,
}));

describe("reconcileManifest — eixo série", () => {
  it("mantém só a série resolvida e poda as demais", () => {
    const root = setupManifest({
      "odoo-12": { version: "12.0" }, "odoo-17": { version: "17.0" }, "odoo-18": { version: "18.0" },
    });
    const r = reconcileManifest(root, {
      axis: "series", entries: ODOO_SERIES,
      versions: new Map([["odoo", "17"]]), dryRun: true,
    });
    assert.deepEqual(r.kept, ["odoo-17"]);
    assert.deepEqual(r.pruned.sort(), ["odoo-12", "odoo-18"]);
    rmSync(root, { recursive: true });
  });

  it("dryRun NÃO escreve o manifesto", () => {
    const root = setupManifest({ "odoo-12": { version: "12.0" }, "odoo-17": { version: "17.0" } });
    const before = readFileSync(join(root, MANIFEST_REL), "utf-8");
    reconcileManifest(root, {
      axis: "series", entries: ODOO_SERIES, versions: new Map([["odoo", "17"]]), dryRun: true,
    });
    assert.equal(readFileSync(join(root, MANIFEST_REL), "utf-8"), before);
    rmSync(root, { recursive: true });
  });

  it("sem dryRun aplica a poda de fato", () => {
    const root = setupManifest({
      "odoo-12": { version: "12.0" }, "odoo-17": { version: "17.0" }, "odoo-18": { version: "18.0" },
    });
    reconcileManifest(root, {
      axis: "series", entries: ODOO_SERIES, versions: new Map([["odoo", "17"]]), dryRun: false,
    });
    const libs = Object.keys(loadManifest(root).frameworks).filter((k) => k.startsWith("odoo-"));
    assert.deepEqual(libs, ["odoo-17"]);
    rmSync(root, { recursive: true });
  });

  it("FAIL-CLOSED: versão não resolvida não poda nada", () => {
    const root = setupManifest({ "odoo-12": { version: "12.0" }, "odoo-17": { version: "17.0" } });
    const r = reconcileManifest(root, {
      axis: "series", entries: ODOO_SERIES, versions: new Map(), dryRun: true,
    });
    assert.deepEqual(r.pruned, [], "sem versão resolvida, poda é proibida");
    assert.equal(r.kept.length, 2, "mantém tudo — nunca adivinha");
    rmSync(root, { recursive: true });
  });

  it("não toca em lib que o perfil não declara", () => {
    const root = setupManifest({ "odoo-17": { version: "17.0" }, react: { version: "18" } });
    const r = reconcileManifest(root, {
      axis: "series", entries: ODOO_SERIES, versions: new Map([["odoo", "17"]]), dryRun: false,
    });
    assert.ok(!r.pruned.includes("react"));
    assert.ok(loadManifest(root).frameworks.react, "react sobrevive — fora do escopo do perfil");
    rmSync(root, { recursive: true });
  });

  it("é idempotente: 2ª passada não muda nada", () => {
    const root = setupManifest({ "odoo-12": { version: "12.0" }, "odoo-17": { version: "17.0" } });
    const opts = { axis: "series", entries: ODOO_SERIES, versions: new Map([["odoo", "17"]]), dryRun: false };
    reconcileManifest(root, opts);
    const after1 = readFileSync(join(root, MANIFEST_REL), "utf-8");
    reconcileManifest(root, opts);
    assert.equal(readFileSync(join(root, MANIFEST_REL), "utf-8"), after1);
    rmSync(root, { recursive: true });
  });
});

describe("reconcileManifest — eixo composição", () => {
  it("re-pina a versão real e nunca poda coexistentes", () => {
    const root = setupManifest({ react: { version: "19" }, typescript: { version: "6" } });
    const r = reconcileManifest(root, {
      axis: "composition",
      entries: [{ lib: "react" }, { lib: "typescript" }],
      versions: new Map([["react", "18"], ["typescript", "5"]]), dryRun: true,
    });
    assert.deepEqual(r.pruned, [], "eixo composição nunca poda por coexistência");
    assert.deepEqual(
      r.repinned.sort((a, b) => a.lib.localeCompare(b.lib)),
      [{ lib: "react", from: "19", to: "18" }, { lib: "typescript", from: "6", to: "5" }],
    );
    rmSync(root, { recursive: true });
  });

  it("não re-pina quando a versão não foi resolvida", () => {
    const root = setupManifest({ react: { version: "19" } });
    const r = reconcileManifest(root, {
      axis: "composition", entries: [{ lib: "react" }], versions: new Map(), dryRun: true,
    });
    assert.deepEqual(r.repinned, []);
    rmSync(root, { recursive: true });
  });
});
