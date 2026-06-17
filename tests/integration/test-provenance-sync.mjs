// Unit da lib provenance-sync. Run: node --test tests/integration/test-provenance-sync.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  hashFile, decideArtifact, loadManifest, saveManifest, applySync, resolveArtifacts,
} from "../../scripts/lib/provenance-sync.mjs";

const REPO = resolve(import.meta.dirname, "../..");
function mk() {
  return { plug: mkdtempSync(join(tmpdir(), "prov-plug-")), proj: mkdtempSync(join(tmpdir(), "prov-proj-")) };
}

describe("decideArtifact — 7 linhas", () => {
  const reg = new Set(["HIST"]);
  const d = (o) => decideArtifact(o).action;
  it("pluginHash null → skip", () => assert.equal(d({ projHash: "A", pluginHash: null, recorded: null, registry: reg }), "skip"));
  it("ausente → add", () => assert.equal(d({ projHash: null, pluginHash: "P", recorded: null, registry: reg }), "add"));
  it("igual plugin → current", () => assert.equal(d({ projHash: "P", pluginHash: "P", recorded: "X", registry: reg }), "current"));
  it("recorded==proj → untouched", () => assert.equal(d({ projHash: "A", pluginHash: "P", recorded: "A", registry: reg }), "untouched"));
  it("recorded!=proj → edited", () => assert.equal(d({ projHash: "A", pluginHash: "P", recorded: "B", registry: reg }), "edited"));
  it("sem recorded & registry hit → untouched", () => assert.equal(d({ projHash: "HIST", pluginHash: "P", recorded: null, registry: reg }), "untouched"));
  it("sem recorded & registry miss → edited", () => assert.equal(d({ projHash: "Z", pluginHash: "P", recorded: null, registry: reg }), "edited"));
});

describe("hashFile + manifesto roundtrip", () => {
  it("hashFile estável e null em erro", () => {
    const dir = mkdtempSync(join(tmpdir(), "prov-h-"));
    const f = join(dir, "a"); writeFileSync(f, "abc");
    assert.match(hashFile(f), /^[0-9a-f]{64}$/);
    assert.equal(hashFile(join(dir, "nope")), null);
  });
  it("load default + roundtrip", () => {
    const proj = mkdtempSync(join(tmpdir(), "prov-m-"));
    assert.deepEqual(loadManifest(proj), { schema: 1, artifacts: [] });
    const m = { schema: 1, artifacts: [{ path: ".context/x.md", hash: "H", sourceVersion: "1.0.0", framework: "odoo" }] };
    saveManifest(proj, m);
    assert.ok(existsSync(join(proj, ".context", ".provenance.json")));
    assert.deepEqual(loadManifest(proj), m);
  });
});

describe("applySync — efeitos", () => {
  it("add / untouched(registry) / edited(preserva); report relativo", () => {
    const { plug, proj } = mk();
    for (const n of ["new", "stale", "edited"]) { mkdirSync(join(plug, n), { recursive: true }); writeFileSync(join(plug, n, "S.md"), `PLUG-${n}-v2`); }
    mkdirSync(join(proj, ".context", "stale"), { recursive: true }); writeFileSync(join(proj, ".context", "stale", "S.md"), "ANTIGO");
    mkdirSync(join(proj, ".context", "edited"), { recursive: true }); writeFileSync(join(proj, ".context", "edited", "S.md"), "USER");
    const registry = new Set([hashFile(join(proj, ".context", "stale", "S.md"))]);
    const artifacts = ["new", "stale", "edited"].map((n) => ({ src: join(plug, n, "S.md"), dest: join(proj, ".context", n, "S.md"), framework: "odoo" }));
    const r = applySync({ projectRoot: proj, pluginRoot: plug, artifacts, registry, sourceVersion: "2.0.0" });
    assert.ok(r.added.some((p) => p.endsWith("new/S.md")));
    assert.ok(r.updated.some((p) => p.endsWith("stale/S.md")));
    assert.ok(r.preserved.some((p) => p.endsWith("edited/S.md")));
    assert.ok([...r.added, ...r.updated].every((p) => !p.startsWith("/")), "report relativo");
    assert.equal(readFileSync(join(proj, ".context", "stale", "S.md"), "utf-8"), "PLUG-stale-v2");
    assert.equal(readFileSync(join(proj, ".context", "edited", "S.md"), "utf-8"), "USER");
  });
});

describe("applySync — segurança (contenção)", () => {
  it("traversal de dest/src → refused, nada escrito fora", () => {
    const { plug, proj } = mk();
    mkdirSync(join(plug, "ok"), { recursive: true }); writeFileSync(join(plug, "ok", "S.md"), "X");
    const artifacts = [
      { src: join(plug, "ok", "S.md"), dest: join(proj, ".context", "..", "escape.md"), framework: "odoo" },
      { src: join(plug, "..", "outside.md"), dest: join(proj, ".context", "z.md"), framework: "odoo" },
    ];
    const r = applySync({ projectRoot: proj, pluginRoot: plug, artifacts, registry: new Set(), sourceVersion: "2.0.0" });
    assert.equal(r.refused.length, 2);
    assert.ok(!existsSync(join(proj, "escape.md")), "não escreveu fora de .context");
  });
  it("src symlink → refused", () => {
    const { plug, proj } = mk();
    writeFileSync(join(plug, "real.md"), "R"); symlinkSync(join(plug, "real.md"), join(plug, "link.md"));
    const artifacts = [{ src: join(plug, "link.md"), dest: join(proj, ".context", "x.md"), framework: "odoo" }];
    const r = applySync({ projectRoot: proj, pluginRoot: plug, artifacts, registry: new Set(), sourceVersion: "2.0.0" });
    assert.equal(r.refused.length, 1);
    assert.ok(!existsSync(join(proj, ".context", "x.md")));
  });
});

describe("resolveArtifacts", () => {
  it("inclui skills e standards de profile; exclui agents; src no plugin", () => {
    const proj = mkdtempSync(join(tmpdir(), "prov-res-"));
    mkdirSync(join(proj, "addons", "x"), { recursive: true });
    writeFileSync(join(proj, "addons", "x", "__manifest__.py"), "{'name':'x'}");
    const arts = resolveArtifacts({ projectRoot: proj, pluginRoot: REPO, baseSkills: [] });
    assert.ok(arts.some((a) => a.dest.includes(`${join(".context", "skills", "odoo-development")}`)));
    assert.ok(arts.some((a) => a.dest.includes(`${join(".context", "engineering", "standards", "std-odoo-naming-conventions.md")}`)));
    assert.ok(arts.every((a) => !a.dest.includes(`${join(".context", "agents")}`)), "agents fora");
    assert.ok(arts.every((a) => a.src.startsWith(REPO)), "src no plugin");
  });
});

describe("CLI apply", () => {
  it("resolve+aplica via CLI e imprime report", () => {
    const proj = mkdtempSync(join(tmpdir(), "prov-cli-"));
    mkdirSync(join(proj, "addons", "x"), { recursive: true });
    writeFileSync(join(proj, "addons", "x", "__manifest__.py"), "{'name':'x'}");
    const CLI = resolve(import.meta.dirname, "../../scripts/lib/provenance-sync.mjs");
    const out = execFileSync("node", [CLI, "apply", `--project=${proj}`, `--plugin=${REPO}`], { encoding: "utf-8" });
    const r = JSON.parse(out);
    assert.ok(Array.isArray(r.added));
    assert.ok(existsSync(join(proj, ".context", "skills", "odoo-development", "SKILL.md")), "skill copiada");
  });
});
