// tests/lib/release-scaffold-sync.test.mjs
// Task D do plano config-release-scaffold: update seguro dos artefatos de CI.
//
// Regra central (MED-HIGH do review R): artefato classe-CI NUNCA é
// auto-sobrescrito. `untouched` + asset mudou → needsConfirm com diff.
// E, por D7b, nem mesmo com `confirm` o workflow é escrito por node:fs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { SCAFFOLD, syncScaffold } from "../../scripts/lib/release-scaffold.mjs";
import { distributableFiles, scaffoldFiles, indexedFiles, genFromWorkingTree } from "../../scripts/lib/gen-known-hashes.mjs";
import { applySync } from "../../scripts/lib/provenance-sync.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ASSET_DIR = join(ROOT, "assets", "release-scaffold");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const CLEANUP = [];
let HOME_TMP;

before(() => {
  HOME_TMP = mkdtempSync(join(tmpdir(), "rss-home-"));
  CLEANUP.push(HOME_TMP);
  process.env.HOME = HOME_TMP;
  process.env.GIT_CONFIG_GLOBAL = join(HOME_TMP, "gitconfig");
  process.env.GIT_CONFIG_SYSTEM = "/dev/null";
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  process.env.GIT_TERMINAL_PROMPT = "0";
  writeFileSync(join(HOME_TMP, "gitconfig"), "");
});

after(() => {
  for (const d of CLEANUP) rmSync(d, { recursive: true, force: true });
});

function newRepo() {
  const dir = mkdtempSync(join(tmpdir(), "rss-repo-"));
  CLEANUP.push(dir);
  execFileSync("git", ["-C", dir, "init", "-q", "-b", "feature/x"]);
  return dir;
}

/** Materializa cópias verbatim dos assets no repo (como o applyScaffold faria). */
function seedVerbatim(dir, assetDir = ASSET_DIR) {
  for (const item of SCAFFOLD) {
    const destAbs = join(dir, item.dest);
    mkdirSync(dirname(destAbs), { recursive: true });
    cpSync(join(assetDir, item.src), destAbs);
  }
}

/** Cópia do ASSET_DIR com um asset alterado — simula uma versão nova do plugin. */
function assetDirWithChange() {
  const d = mkdtempSync(join(tmpdir(), "rss-assets-"));
  CLEANUP.push(d);
  cpSync(ASSET_DIR, d, { recursive: true });
  for (const item of SCAFFOLD) {
    const p = join(d, item.src);
    writeFileSync(p, readFileSync(p, "utf8") + "\n# versão nova do plugin\n");
  }
  return d;
}

/** Registry contendo os hashes dos assets ATUAIS (o que uma cópia verbatim teria). */
function registryOfCurrentAssets() {
  return new Set(SCAFFOLD.map((i) => sha256(readFileSync(join(ASSET_DIR, i.src)))));
}

// ─── (a) gen-known-hashes: walk SEPARADO, sem ampliar o filtro global ───────

test("D.a scaffoldFiles indexa assets/release-scaffold/** (.yml/.sh/.mjs)", () => {
  const files = scaffoldFiles(ROOT);
  for (const item of SCAFFOLD) {
    assert.ok(
      files.includes(join("assets", "release-scaffold", item.src)),
      `${item.src} não foi indexado; veio: ${files.join(", ")}`,
    );
  }
});

test("D.a o filtro GLOBAL não foi ampliado — nenhum .yml/.mjs de skills/** entra", () => {
  const dist = distributableFiles(ROOT);
  const polluted = dist.filter((f) => f.endsWith(".yml") || f.endsWith(".mjs"));
  assert.deepEqual(
    polluted,
    [],
    `distributableFiles passou a varrer .yml/.mjs — isso arrasta ${polluted.length} arquivos de skills/** para o registry compartilhado`,
  );

  const all = indexedFiles(ROOT);
  const skillScripts = all.filter((f) => f.startsWith("skills/") && (f.endsWith(".yml") || f.endsWith(".mjs")));
  assert.deepEqual(skillScripts, [], `scripts de skills/** vazaram para o registry: ${skillScripts.join(", ")}`);
});

test("D.a genFromWorkingTree inclui os hashes do scaffold", () => {
  const set = genFromWorkingTree(ROOT);
  for (const item of SCAFFOLD) {
    assert.ok(
      set.has(sha256(readFileSync(join(ASSET_DIR, item.src)))),
      `hash de ${item.src} ausente do registry`,
    );
  }
});

// ─── (b)-(g) syncScaffold ───────────────────────────────────────────────────

test("D.b cópia verbatim + asset inalterado → nada a fazer", () => {
  const dir = newRepo();
  seedVerbatim(dir);
  const r = syncScaffold(dir, { registry: registryOfCurrentAssets() });
  assert.deepEqual(r.updated, []);
  assert.deepEqual(r.needsConfirm, []);
  assert.deepEqual(r.preserved, []);
  assert.equal(r.current.length, SCAFFOLD.length);
});

test("D.1c [MED-HIGH] untouched + asset mudou → needsConfirm com diff, NÃO escreve", () => {
  const dir = newRepo();
  seedVerbatim(dir);
  const before = SCAFFOLD.map((i) => readFileSync(join(dir, i.dest), "utf8"));

  const r = syncScaffold(dir, { registry: registryOfCurrentAssets(), assetDir: assetDirWithChange() });

  assert.equal(r.updated.length, 0, "classe-CI nunca é auto-sobrescrita");
  assert.equal(r.needsConfirm.length, SCAFFOLD.length);
  for (const nc of r.needsConfirm) {
    assert.ok(nc.diff && nc.diff.length > 0, `needsConfirm sem diff para ${nc.dest}`);
    assert.match(nc.diff, /\+.*versão nova do plugin/, "o diff deve mostrar a linha adicionada");
  }
  SCAFFOLD.forEach((i, idx) => {
    assert.equal(readFileSync(join(dir, i.dest), "utf8"), before[idx], `${i.dest} foi escrito sem confirmação`);
  });
});

test("D.d confirm → updated (mas o workflow ainda vai pela ferramenta Write)", () => {
  const dir = newRepo();
  seedVerbatim(dir);
  const newAssets = assetDirWithChange();

  const r = syncScaffold(dir, { confirm: true, registry: registryOfCurrentAssets(), assetDir: newAssets });

  const fsItems = SCAFFOLD.filter((i) => i.writer === "fs");
  assert.deepEqual(r.updated.sort(), fsItems.map((i) => i.dest).sort());
  for (const i of fsItems) {
    assert.equal(
      sha256(readFileSync(join(dir, i.dest))),
      sha256(readFileSync(join(newAssets, i.src))),
      `${i.dest} não recebeu o conteúdo novo`,
    );
  }

  // D7b vale também no update: .github/** nunca por node:fs
  const toolItems = SCAFFOLD.filter((i) => i.writer === "tool");
  assert.deepEqual(r.mustWriteViaTool.map((x) => x.dest), toolItems.map((i) => i.dest));
  for (const i of toolItems) {
    assert.notEqual(
      sha256(readFileSync(join(dir, i.dest))),
      sha256(readFileSync(join(newAssets, i.src))),
      `${i.dest} foi escrito por node:fs no update — viola D7b`,
    );
  }
});

test("D.e editado 1 byte → preserved", () => {
  const dir = newRepo();
  seedVerbatim(dir);
  const target = SCAFFOLD.find((i) => i.writer === "fs");
  const destAbs = join(dir, target.dest);
  writeFileSync(destAbs, readFileSync(destAbs, "utf8") + "#");
  const mine = readFileSync(destAbs, "utf8");

  const r = syncScaffold(dir, { confirm: true, registry: registryOfCurrentAssets(), assetDir: assetDirWithChange() });

  assert.ok(r.preserved.includes(target.dest), `esperava preserved, veio ${JSON.stringify(r)}`);
  assert.ok(!r.updated.includes(target.dest));
  assert.equal(readFileSync(destAbs, "utf8"), mine, "edição local foi sobrescrita");
});

test("D.f ausente → skipped, NÃO recria (scaffold é opt-in)", () => {
  const dir = newRepo();
  const r = syncScaffold(dir, { confirm: true, registry: registryOfCurrentAssets(), assetDir: assetDirWithChange() });
  assert.deepEqual(r.skipped.sort(), SCAFFOLD.map((i) => i.dest).sort());
  assert.deepEqual(r.updated, []);
  for (const i of SCAFFOLD) assert.ok(!existsSync(join(dir, i.dest)), `${i.dest} foi recriado`);
});

// ─── Task F: por que o sync do scaffold NÃO pode passar pelo applySync ──────
//
// Estes dois testes provam, em CÓDIGO, as duas razões que o review R levantou.
// Sem eles, "o sync do scaffold roda fora do applySync" seria só uma frase.

test("F.1 applySync RECUSA dests fora de .context/ — daí o sync próprio", () => {
  const dir = newRepo();
  const artifacts = SCAFFOLD.map((i) => ({
    src: join(ASSET_DIR, i.src),
    dest: join(dir, i.dest),
  }));

  const report = applySync({
    projectRoot: dir,
    pluginRoot: ROOT,
    artifacts,
    registry: new Set(),
    sourceVersion: "test",
  });

  assert.deepEqual(
    report.refused.sort(),
    SCAFFOLD.map((i) => i.dest).sort(),
    "applySync deveria recusar TODOS os dests do scaffold (contido a .context/)",
  );
  for (const i of SCAFFOLD) {
    assert.ok(!existsSync(join(dir, i.dest)), `${i.dest} foi criado pelo applySync`);
  }
});

test("F.2 applySync AUTO-SOBRESCREVE 'untouched' sem confirmação — daí o needsConfirm", () => {
  const dir = newRepo();
  // dest dentro de .context/ para passar na contenção do applySync
  const dest = join(dir, ".context", "artefato.md");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, "conteúdo v1\n");

  const src = join(mkdtempSync(join(tmpdir(), "rss-plugin-")), "artefato.md");
  CLEANUP.push(dirname(src));
  writeFileSync(src, "conteúdo v2\n");

  const report = applySync({
    projectRoot: dir,
    pluginRoot: dirname(src),
    artifacts: [{ src, dest }],
    registry: new Set([sha256(Buffer.from("conteúdo v1\n"))]), // deploy intocado
    sourceVersion: "test",
  });

  assert.deepEqual(report.updated, [".context/artefato.md"]);
  assert.equal(
    readFileSync(dest, "utf8"),
    "conteúdo v2\n",
    "applySync escreveu sem nenhum gate — é este o comportamento que o classe-CI não pode ter",
  );

  // O contraste: syncScaffold, no mesmo cenário, exigiria confirmação.
  const repo2 = newRepo();
  seedVerbatim(repo2);
  const r = syncScaffold(repo2, { registry: registryOfCurrentAssets(), assetDir: assetDirWithChange() });
  assert.equal(r.updated.length, 0);
  assert.equal(r.needsConfirm.length, SCAFFOLD.length);
});

// Achado do security review: dest existe mas é ILEGÍVEL (ex.: um diretório).
// hashFile → null → decideArtifact devolve "add", que não é skip/current/edited e
// caía no ramo `untouched`. Sem confirm, o lineDiff fazia readFileSync(dir) e
// ESTOURAVA; com confirm, tentaria sobrescrever.
test("D.h dest ilegível (diretório) → skipped, sem lançar", () => {
  const dir = newRepo();
  const target = SCAFFOLD.find((i) => i.writer === "fs");
  mkdirSync(join(dir, target.dest), { recursive: true }); // dest é um DIRETÓRIO

  let r;
  assert.doesNotThrow(() => {
    r = syncScaffold(dir, { registry: registryOfCurrentAssets(), assetDir: assetDirWithChange() });
  }, "syncScaffold estourou num dest ilegível");

  assert.ok(
    r.skipped.includes(target.dest) || r.refused.some((x) => x.dest === target.dest),
    `dest ilegível deveria ser skipped/refused, veio: ${JSON.stringify(r)}`,
  );
  assert.ok(!r.updated.includes(target.dest));
  assert.ok(!r.needsConfirm.some((x) => x.dest === target.dest));
});

// NOTE 6 do code review: `apply` sai 1 quando há refused; `sync` saía 0 sempre.
test("D.i CLI sync → exit 1 quando há refused (paridade com apply)", () => {
  const dir = newRepo();
  const outside = mkdtempSync(join(tmpdir(), "rss-out2-"));
  CLEANUP.push(outside);
  symlinkSync(outside, join(dir, "scripts"));

  const cliPath = join(ROOT, "scripts", "lib", "release-scaffold.mjs");
  let status = 0;
  let out = "";
  try {
    out = execFileSync("node", [cliPath, "sync"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    status = e.status ?? 1;
    out = e.stdout ?? "";
  }
  assert.equal(status, 1, "a CLI sync deve sinalizar recusa no exit code");
  assert.ok(JSON.parse(out).refused.length > 0);
});

test("D.g contenção mantida — pai symlink fora da raiz → refused", () => {
  const dir = newRepo();
  const outside = mkdtempSync(join(tmpdir(), "rss-outside-"));
  CLEANUP.push(outside);
  writeFileSync(join(outside, "bump-version.sh"), "ALVO\n");
  symlinkSync(outside, join(dir, "scripts"));

  const r = syncScaffold(dir, { confirm: true, registry: registryOfCurrentAssets(), assetDir: assetDirWithChange() });

  assert.ok(
    r.refused.some((x) => x.dest === "scripts/bump-version.sh" && /parent/.test(x.reason)),
    `esperava recusa por pai-symlink, veio: ${JSON.stringify(r.refused)}`,
  );
  assert.equal(readFileSync(join(outside, "bump-version.sh"), "utf8"), "ALVO\n", "escreveu fora do projectRoot");
});
