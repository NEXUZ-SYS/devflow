// tests/e2e/release-scaffold.e2e.test.mjs
// Task G do plano config-release-scaffold: E2E do scaffold ponta a ponta,
// totalmente isolado.
//
// Higiene (não-negociável):
//   - fixture em mktemp -d, FORA da árvore do repo
//   - `origin` é um repositório bare LOCAL; nenhuma URL de rede
//   - HOME/GIT_CONFIG_*/GH_CONFIG_DIR em tmp; GIT_TERMINAL_PROMPT=0
//   - GH_TOKEN/GITHUB_TOKEN removidos
//   - `git push` e `gh` são STUBS que marcam uma sentinela; ausência da
//     sentinela é asserção POSITIVA de que nada foi empurrado.
//
// Sobre o remote GitHub: desde C.9g o `applyScaffold` RECUSA um repo sem remote
// GitHub, então o fixture precisa de um. Ele é uma STRING inerte em .git/config
// — nada jamais a contata:
//   - `origin` continua sendo o bare LOCAL, e é para lá que qualquer push iria;
//   - `git push` e `gh` são stubs que marcam sentinela (G.3);
//   - o bare local termina sem refs (G.4).
// O parsing de host em si é testado em unidade na Task C.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { applyScaffold, verifyWritten, checkGate, SCAFFOLD } from "../../scripts/lib/release-scaffold.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ASSET_DIR = join(ROOT, "assets", "release-scaffold");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

let SANDBOX, FIXTURE, ORIGIN, STUBS, SENTINEL_DIR, ORIGINAL_PATH, REAL_GIT;

const sentinel = (name) => join(SENTINEL_DIR, name);

before(() => {
  REAL_GIT = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();

  SANDBOX = mkdtempSync(join(tmpdir(), "rs-e2e-"));
  FIXTURE = join(SANDBOX, "projeto");
  ORIGIN = join(SANDBOX, "origin.git");
  STUBS = join(SANDBOX, "stubs");
  SENTINEL_DIR = join(SANDBOX, "sentinelas");
  const HOME_TMP = join(SANDBOX, "home");
  for (const d of [FIXTURE, STUBS, SENTINEL_DIR, HOME_TMP]) mkdirSync(d, { recursive: true });

  // Env isolado — nada alcança o repo real, ~/.gitconfig, gh, ou a rede.
  process.env.HOME = HOME_TMP;
  process.env.GIT_CONFIG_GLOBAL = join(HOME_TMP, "gitconfig");
  process.env.GIT_CONFIG_SYSTEM = "/dev/null";
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  process.env.GIT_TERMINAL_PROMPT = "0";
  process.env.GH_CONFIG_DIR = join(HOME_TMP, "gh");
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  writeFileSync(join(HOME_TMP, "gitconfig"), "");

  // origin = bare LOCAL. Jamais uma URL de rede.
  execFileSync(REAL_GIT, ["init", "--bare", "-q", ORIGIN]);
  execFileSync(REAL_GIT, ["-C", FIXTURE, "init", "-q", "-b", "feature/release-scaffold"]);
  execFileSync(REAL_GIT, ["-C", FIXTURE, "config", "user.email", "e2e@example.invalid"]);
  execFileSync(REAL_GIT, ["-C", FIXTURE, "config", "user.name", "E2E"]);
  execFileSync(REAL_GIT, ["-C", FIXTURE, "remote", "add", "origin", ORIGIN]);
  // URL inerte: satisfaz o gate C.9g sem nunca ser contatada (push vai p/ origin).
  execFileSync(REAL_GIT, ["-C", FIXTURE, "remote", "add", "github", "https://github.com/acme/demo.git"]);

  // Stubs: `git push` e `gh` marcam sentinela e falham. Os demais subcomandos
  // de git passam adiante para o git real (o applier precisa de rev-parse etc.).
  writeFileSync(
    join(STUBS, "git"),
    `#!/usr/bin/env bash
for a in "$@"; do
  if [ "$a" = "push" ]; then touch "${sentinel("git-push")}"; echo "stub: push bloqueado" >&2; exit 90; fi
done
exec "${REAL_GIT}" "$@"
`,
  );
  writeFileSync(
    join(STUBS, "gh"),
    `#!/usr/bin/env bash
touch "${sentinel("gh")}"
echo "stub: gh bloqueado" >&2
exit 91
`,
  );
  chmodSync(join(STUBS, "git"), 0o755);
  chmodSync(join(STUBS, "gh"), 0o755);

  ORIGINAL_PATH = process.env.PATH;
  process.env.PATH = `${STUBS}:${ORIGINAL_PATH}`;
});

after(() => {
  if (ORIGINAL_PATH) process.env.PATH = ORIGINAL_PATH;
  rmSync(SANDBOX, { recursive: true, force: true });
});

test("G.0 higiene do fixture: origin é bare local; o remote GitHub é uma string inerte", () => {
  const gate = checkGate(FIXTURE);
  assert.equal(gate.git, true);
  assert.equal(gate.github, true, "o gate C.9g exige um remote GitHub para materializar");

  // `origin` — o alvo default de qualquer push — é um path local, nunca a rede.
  const originUrl = execFileSync(REAL_GIT, ["-C", FIXTURE, "remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  assert.equal(originUrl, ORIGIN);
  assert.ok(!originUrl.includes("://"), `origin virou URL de rede: ${originUrl}`);
  assert.ok(existsSync(join(ORIGIN, "HEAD")), "origin não é um repositório bare local");
});

test("G.1 [N6a] applyScaffold materializa 2 por fs + 1 via ferramenta Write; verifyWritten é fail-loud", () => {
  const r = applyScaffold(FIXTURE, { confirmed: true });

  assert.deepEqual(r.refused, [], `recusas inesperadas: ${JSON.stringify(r.refused)}`);
  assert.deepEqual(r.created.sort(), ["scripts/bump-version.sh", "scripts/lib/changelog-cut.mjs"]);
  assert.equal(r.mustWriteViaTool.length, 1);
  assert.equal(r.mustWriteViaTool[0].dest, ".github/workflows/release.yml");
  assert.ok(!existsSync(join(FIXTURE, ".github")), "o applier escreveu .github/** por node:fs (D7b violado)");

  // os dois de writer:'fs' são byte-idênticos ao asset
  for (const item of SCAFFOLD.filter((s) => s.writer === "fs")) {
    assert.equal(
      sha256(readFileSync(join(FIXTURE, item.dest))),
      sha256(readFileSync(join(ASSET_DIR, item.src))),
      `${item.dest} não é verbatim`,
    );
  }

  const entry = r.mustWriteViaTool[0];
  const destAbs = join(FIXTURE, entry.dest);
  mkdirSync(dirname(destAbs), { recursive: true });

  // (a) 1 byte alterado ANTES da gravação → mismatch fail-loud.
  //     Simula a ferramenta Write gravando um conteúdo corrompido no trânsito
  //     pelo LLM — o único artefato que roda em CI e o único cujos bytes não
  //     são copiados pelo applier.
  writeFileSync(destAbs, entry.content.replace("runs-on: ubuntu-latest", "runs-on: ubuntu-latest "));
  const bad = verifyWritten(FIXTURE);
  assert.equal(bad.ok, false, "verifyWritten passou com 1 byte alterado");
  assert.equal(bad.mismatch[0].dest, ".github/workflows/release.yml");
  assert.match(bad.mismatch[0].reason, /hash difere/);

  // (b) conteúdo entregue, gravado como veio → hash bate
  writeFileSync(destAbs, entry.content);
  const good = verifyWritten(FIXTURE);
  assert.equal(good.ok, true, `verifyWritten falhou: ${JSON.stringify(good.mismatch)}`);
  assert.equal(
    sha256(readFileSync(destAbs)),
    sha256(readFileSync(join(ASSET_DIR, "release.yml"))),
    "o workflow gravado não é byte-idêntico ao asset",
  );
});

test("G.2 bump-version.sh scaffoldado bumpa e corta o CHANGELOG", () => {
  writeFileSync(join(FIXTURE, "package.json"), '{\n  "name": "e2e",\n  "version": "1.2.3"\n}\n');
  writeFileSync(
    join(FIXTURE, "CHANGELOG.md"),
    "# Changelog\n\n## [Unreleased]\n\n### Added\n- suporte a scaffold\n\n## [1.0.0] — 2026-01-01\n- init\n",
  );

  const out = execFileSync("bash", [join(FIXTURE, "scripts", "bump-version.sh"), "minor"], {
    cwd: FIXTURE,
    encoding: "utf8",
    env: process.env,
  });

  // a versão nova é o último token de stdout (contrato com o release.yml)
  assert.equal(out.trim().split(/\s+/).pop(), "1.3.0");

  const pkg = JSON.parse(readFileSync(join(FIXTURE, "package.json"), "utf8"));
  assert.equal(pkg.version, "1.3.0");

  const changelog = readFileSync(join(FIXTURE, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /## \[1\.3\.0\] — \d{4}-\d{2}-\d{2}/, "CHANGELOG não foi cortado");
  assert.match(changelog, /## \[Unreleased\]/, "[Unreleased] novo não foi preservado no topo");

  // a seção [1.3.0] não é vazia: o conteúdo do Unreleased migrou para baixo dela
  const idx130 = changelog.indexOf("## [1.3.0]");
  const idx100 = changelog.indexOf("## [1.0.0]");
  const corpo = changelog.slice(idx130, idx100);
  assert.match(corpo, /- suporte a scaffold/, "a seção [1.3.0] saiu vazia");
});

test("G.3 asserção positiva: nenhum `git push` e nenhum `gh` foram invocados", () => {
  assert.ok(!existsSync(sentinel("git-push")), "algum passo executou `git push`");
  assert.ok(!existsSync(sentinel("gh")), "algum passo executou `gh`");

  // o stub está realmente no PATH e funciona — senão a asserção acima seria vácua
  assert.throws(() => execFileSync("gh", ["--version"], { env: process.env, stdio: "ignore" }));
  assert.ok(existsSync(sentinel("gh")), "o stub de gh não está ativo — a sentinela não prova nada");
  rmSync(sentinel("gh"), { force: true });

  assert.throws(() => execFileSync("git", ["push", "origin", "x"], { cwd: FIXTURE, env: process.env, stdio: "ignore" }));
  assert.ok(existsSync(sentinel("git-push")), "o stub de git push não está ativo");
});

test("G.4 o origin bare local continua vazio — nada foi empurrado", () => {
  const refs = execFileSync(REAL_GIT, ["-C", ORIGIN, "for-each-ref"], { encoding: "utf8" }).trim();
  assert.equal(refs, "", `o origin recebeu refs: ${refs}`);
});
