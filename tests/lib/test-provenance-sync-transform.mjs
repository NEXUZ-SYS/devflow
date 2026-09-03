// Suite — `transform` no applySync.
//
// Artefato com transform NAO é verbatim: o conteúdo escrito difere da origem.
// O hash de procedência tem de ser o dos bytes ESCRITOS — usar o da origem
// classificaria todo projeto como "edited" na 1ª passada e congelaria o sync.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySync, loadManifest, hashFile } from "../../scripts/lib/provenance-sync.mjs";

function setup() {
  const plugin = mkdtempSync(join(tmpdir(), "prov-plug-"));
  const project = mkdtempSync(join(tmpdir(), "prov-proj-"));
  mkdirSync(join(plugin, "assets"), { recursive: true });
  mkdirSync(join(project, ".context"), { recursive: true });
  writeFileSync(join(plugin, "assets", "a.md"), "linter: machine/a.js\n");
  return {
    plugin, project,
    cleanup: () => { rmSync(plugin, { recursive: true }); rmSync(project, { recursive: true }); },
  };
}

const RETARGET = (s) => s.replace("machine/a.js", "engineering/standards/machine/a.js");

function artifacts(plugin, project) {
  return [{
    src: join(plugin, "assets", "a.md"),
    dest: join(project, ".context", "a.md"),
    framework: "default",
    transform: RETARGET,
  }];
}

function opts(f) {
  return {
    projectRoot: f.project, pluginRoot: f.plugin,
    artifacts: artifacts(f.plugin, f.project),
    registry: new Set(), sourceVersion: "1.0.0",
  };
}

test("os bytes GRAVADOS são os transformados", () => {
  const f = setup();
  applySync(opts(f));
  const written = readFileSync(join(f.project, ".context", "a.md"), "utf-8");
  assert.match(written, /engineering\/standards\/machine\/a\.js/);
  assert.doesNotMatch(written, /^linter: machine\/a\.js$/m);
  f.cleanup();
});

test("o hash do manifesto é o dos bytes TRANSFORMADOS, não os da origem", () => {
  const f = setup();
  applySync(opts(f));
  const recorded = loadManifest(f.project).artifacts[0].hash;
  assert.equal(recorded, hashFile(join(f.project, ".context", "a.md")),
    "hash da origem faria todo projeto virar 'edited' na 1ª passada");
  assert.notEqual(recorded, hashFile(join(f.plugin, "assets", "a.md")),
    "o hash da origem NÃO pode ser o gravado");
  f.cleanup();
});

test("2ª passada classifica 'current' — sem isso o sync congelaria", () => {
  const f = setup();
  applySync(opts(f));
  const r2 = applySync(opts(f));
  assert.deepEqual(r2.added, []);
  assert.deepEqual(r2.updated, []);
  assert.equal(r2.current.length, 1, "2ª passada é no-op");
  f.cleanup();
});

test("edição local é preservada e reportada, não sobrescrita", () => {
  const f = setup();
  applySync(opts(f));
  const dest = join(f.project, ".context", "a.md");
  writeFileSync(dest, "EDITADO PELO USUARIO\n");
  const r = applySync(opts(f));
  assert.equal(readFileSync(dest, "utf-8"), "EDITADO PELO USUARIO\n",
    "edição local NUNCA é sobrescrita");
  assert.equal(r.preserved.length, 1, "e é reportada");
  f.cleanup();
});

test("deploy intocado é ATUALIZADO quando o bundle muda", () => {
  const f = setup();
  applySync(opts(f));
  writeFileSync(join(f.plugin, "assets", "a.md"), "linter: machine/a.js\nnovo: campo\n");
  const r = applySync(opts(f));
  assert.equal(r.updated.length, 1, "intocado acompanha o bundle");
  assert.match(readFileSync(join(f.project, ".context", "a.md"), "utf-8"), /novo: campo/);
  f.cleanup();
});

test("RETROCOMPAT: artefato SEM transform copia verbatim, como hoje", () => {
  const f = setup();
  const arts = [{
    src: join(f.plugin, "assets", "a.md"),
    dest: join(f.project, ".context", "b.md"),
    framework: "skill",
  }];
  applySync({ projectRoot: f.project, pluginRoot: f.plugin, artifacts: arts, registry: new Set(), sourceVersion: "1.0.0" });
  assert.equal(readFileSync(join(f.project, ".context", "b.md"), "utf-8"), "linter: machine/a.js\n");
  f.cleanup();
});
