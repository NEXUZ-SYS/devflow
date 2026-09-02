/**
 * Gate — `devflow stacks reconcile`: poda só sob --yes, com evidência impressa.
 *
 * SAFETY: o fixture odoo17 é COPIADO para um tmpdir. O fixture versionado
 * nunca é operado in-place.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { loadManifest } from "../../scripts/lib/manifest-stacks.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const CLI = join(REPO, "scripts", "devflow-stacks.mjs");
const FIXTURE = join(REPO, "tests/fixtures/version-scoped/odoo17");
const MANIFEST_REL = ".context/engineering/stacks/manifest.yaml";

// Copia o fixture e semeia o manifesto com as 7 séries — o estado exato que o
// /devflow init produzia no nexuz/odoo_17.
function setupOdoo17Project() {
  const root = mkdtempSync(join(tmpdir(), "reconcile-cli-"));
  cpSync(FIXTURE, root, { recursive: true });
  mkdirSync(join(root, ".context/engineering/stacks"), { recursive: true });
  const body = ["spec: devflow-stack/v0", "frameworks:"];
  for (const s of [12, 13, 14, 15, 16, 17, 18]) {
    body.push(`  odoo-${s}:`, `    version: "${s}.0"`, "    mcpIndexed: true");
  }
  writeFileSync(join(root, MANIFEST_REL), body.join("\n") + "\n");
  return root;
}

function run(root, ...flags) {
  return execFileSync("node", [CLI, "reconcile", `--project=${root}`, ...flags], {
    encoding: "utf-8", env: { ...process.env, CLAUDE_PLUGIN_ROOT: REPO },
  });
}

describe("devflow stacks reconcile", () => {
  it("sem --yes NÃO poda: imprime o plano e preserva o manifesto", () => {
    const root = setupOdoo17Project();
    const before = readFileSync(join(root, MANIFEST_REL), "utf-8");
    const out = run(root);
    assert.match(out, /odoo-12/, "o plano lista o que seria podado");
    assert.match(out, /--yes/, "o plano diz como confirmar");
    assert.equal(readFileSync(join(root, MANIFEST_REL), "utf-8"), before,
      "nada foi escrito sem confirmação");
    rmSync(root, { recursive: true });
  });

  it("--yes poda as 6 séries e mantém odoo-17", () => {
    const root = setupOdoo17Project();
    run(root, "--yes");
    const libs = Object.keys(loadManifest(root).frameworks).filter((k) => k.startsWith("odoo-"));
    assert.deepEqual(libs, ["odoo-17"]);
    rmSync(root, { recursive: true });
  });

  it("é idempotente: a segunda passada não muda nada", () => {
    const root = setupOdoo17Project();
    run(root, "--yes");
    const after1 = readFileSync(join(root, MANIFEST_REL), "utf-8");
    run(root, "--yes");
    assert.equal(readFileSync(join(root, MANIFEST_REL), "utf-8"), after1);
    rmSync(root, { recursive: true });
  });

  it("imprime a evidência da resolução, com a razão da maioria", () => {
    const root = setupOdoo17Project();
    const out = run(root);
    assert.match(out, /\.gitmodules/);
    assert.match(out, /Dockerfile/);
    assert.match(out, /high/);
    assert.match(out, /__manifest__\.py \(\d+\/\d+\)/, "a sonda de maioria mostra vencedor/total");
    rmSync(root, { recursive: true });
  });
});
