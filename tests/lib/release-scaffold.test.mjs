// tests/lib/release-scaffold.test.mjs
// Task C do plano config-release-scaffold.
//
// Controles sob teste (ADR-012 v1.1.0):
//   - checkGate: host do remote parseado de forma ANCORADA (userinfo, porta, case)
//   - applyScaffold: recusa sem confirmação humana (C.9)
//   - D7a: recusa sob autonomy != supervised, lendo status.yaml — a FONTE REAL,
//     a mesma de hooks/post-tool-use (C.9b)
//   - D7b: .github/workflows/** nunca é escrito por node:fs; sai em
//     mustWriteViaTool para a ferramenta Write (C.9c)
//   - N6a: verifyWritten — hash(dest) === hash(asset), fail-loud (C.9d)
//   - contenção: symlink, '..' e diretório-pai symlink fora da raiz (C.13/C.13b)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  checkGate,
  parseHost,
  planScaffold,
  applyScaffold,
  verifyWritten,
  containmentViolation,
  readAutonomy,
  SCAFFOLD,
} from "../../scripts/lib/release-scaffold.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ASSET_DIR = join(ROOT, "assets", "release-scaffold");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

let HOME_TMP;
const CLEANUP = [];

before(() => {
  // Env isolado: nenhum teste pode alcançar ~/.gitconfig, gh, ou a rede.
  HOME_TMP = mkdtempSync(join(tmpdir(), "rs-home-"));
  CLEANUP.push(HOME_TMP);
  process.env.HOME = HOME_TMP;
  process.env.GIT_CONFIG_GLOBAL = join(HOME_TMP, "gitconfig");
  process.env.GIT_CONFIG_SYSTEM = "/dev/null";
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  process.env.GIT_TERMINAL_PROMPT = "0";
  process.env.GH_CONFIG_DIR = join(HOME_TMP, "gh");
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  writeFileSync(join(HOME_TMP, "gitconfig"), "");
});

after(() => {
  for (const d of CLEANUP) rmSync(d, { recursive: true, force: true });
});

function newRepo({ init = true, remotes = [], branch = "feature/x", autonomy = null, devflowYaml = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "rs-repo-"));
  CLEANUP.push(dir);
  if (init) {
    execFileSync("git", ["-C", dir, "init", "-q", "-b", branch]);
    execFileSync("git", ["-C", dir, "config", "user.email", "t@example.invalid"]);
    execFileSync("git", ["-C", dir, "config", "user.name", "T"]);
    for (const [name, url] of remotes) {
      execFileSync("git", ["-C", dir, "remote", "add", name, url]);
    }
  }
  if (autonomy !== null) {
    mkdirSync(join(dir, ".context", "workflow"), { recursive: true });
    writeFileSync(join(dir, ".context", "workflow", "status.yaml"), `phase: E\nautonomy: ${autonomy}\n`);
  }
  if (devflowYaml !== null) {
    mkdirSync(join(dir, ".context"), { recursive: true });
    writeFileSync(join(dir, ".context", ".devflow.yaml"), devflowYaml);
  }
  return dir;
}

const ok = (cwd) => applyScaffold(cwd, { confirmed: true });

// ─── checkGate / parseHost ──────────────────────────────────────────────────

test("C.1 sem git → {git:false} e applyScaffold não cria nada", () => {
  const dir = newRepo({ init: false });
  const gate = checkGate(dir);
  assert.equal(gate.git, false);

  const r = ok(dir);
  assert.equal(r.created.length, 0);
  assert.ok(r.refused.length > 0, "deveria recusar sem repositório git");
  assert.ok(!existsSync(join(dir, "scripts", "bump-version.sh")));
});

test("C.2 git sem remote → {git:true, github:false}", () => {
  const gate = checkGate(newRepo());
  assert.deepEqual({ git: gate.git, github: gate.github }, { git: true, github: false });
});

test("C.3 remote https github → {github:true}", () => {
  assert.equal(checkGate(newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] })).github, true);
});

test("C.4 remote SSH scp-like → {github:true}", () => {
  assert.equal(checkGate(newRepo({ remotes: [["origin", "git@github.com:x/y.git"]] })).github, true);
});

test("C.5 github.com.evil.tld → {github:false}", () => {
  assert.equal(checkGate(newRepo({ remotes: [["origin", "https://github.com.evil.tld/x/y.git"]] })).github, false);
});

test("C.6 evilgithub.com → {github:false}", () => {
  assert.equal(checkGate(newRepo({ remotes: [["origin", "https://evilgithub.com/x/y.git"]] })).github, false);
});

test("C.7 GitHub Enterprise (github.company.com) → {github:false}", () => {
  assert.equal(checkGate(newRepo({ remotes: [["origin", "https://github.company.com/x/y.git"]] })).github, false);
});

test("C.8 multi-remote com um GitHub → {github:true}", () => {
  const dir = newRepo({
    remotes: [
      ["origin", "https://gitlab.com/x/y.git"],
      ["upstream", "https://github.com/x/y.git"],
    ],
  });
  assert.equal(checkGate(dir).github, true);
});

test("C.8b [N2] userinfo: https://github.com@evil.tld → {github:false}", () => {
  assert.equal(parseHost("https://github.com@evil.tld/x/y.git"), "evil.tld");
  assert.equal(checkGate(newRepo({ remotes: [["origin", "https://github.com@evil.tld/x/y.git"]] })).github, false);
});

test("C.8c [N2] userinfo: https://user@github.com → {github:true}", () => {
  assert.equal(parseHost("https://user@github.com/x/y.git"), "github.com");
});

test("C.8d ssh://git@github.com:22/x/y.git → {github:true}", () => {
  assert.equal(parseHost("ssh://git@github.com:22/x/y.git"), "github.com");
  assert.equal(checkGate(newRepo({ remotes: [["origin", "ssh://git@github.com:22/x/y.git"]] })).github, true);
});

test("C.8e porta e case: :443 e GitHub.com → {github:true}", () => {
  assert.equal(parseHost("https://github.com:443/x/y.git"), "github.com");
  assert.equal(parseHost("https://GitHub.com/x/y"), "github.com");
});

// ─── applyScaffold: enforcement ─────────────────────────────────────────────

test("C.9 sem confirmed:true → refused, NADA escrito", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  const r = applyScaffold(dir, {});
  assert.equal(r.created.length, 0);
  assert.equal(r.mustWriteViaTool.length, 0);
  assert.ok(
    r.refused.some((x) => /confirm/i.test(x.reason)),
    `esperava recusa por falta de confirmação, veio: ${JSON.stringify(r.refused)}`,
  );
  assert.ok(!existsSync(join(dir, "scripts", "bump-version.sh")));
});

test("C.9b [D7a] autonomy:autonomous em status.yaml → refused mesmo com confirmed:true", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]], autonomy: "autonomous" });
  const r = ok(dir);
  assert.equal(r.created.length, 0);
  assert.equal(r.mustWriteViaTool.length, 0);
  assert.ok(
    r.refused.some((x) => /autonom/i.test(x.reason)),
    `esperava recusa por autonomia, veio: ${JSON.stringify(r.refused)}`,
  );
  assert.ok(!existsSync(join(dir, "scripts", "bump-version.sh")));
});

test("C.9b assisted → refused; supervised → permitido; status.yaml ausente → supervised", () => {
  const assisted = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]], autonomy: "assisted" });
  assert.ok(ok(assisted).refused.some((x) => /autonom/i.test(x.reason)));

  const supervised = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]], autonomy: "supervised" });
  assert.equal(ok(supervised).refused.length, 0);

  const absent = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  assert.ok(!existsSync(join(absent, ".context", "workflow", "status.yaml")));
  assert.equal(ok(absent).refused.length, 0, "status.yaml ausente deve valer supervised (default do hook)");
});

// Achado do security review: `readAutonomy` afirma espelhar o hooks/post-tool-use,
// que faz `tr -d '[:space:]"'` e portanto é CRLF-safe. A regex JS não era: `.` e `$`
// não cruzam `\r`, então `autonomy: autonomous\r` não casava e o guard FALHAVA ABERTO.
// Todos os fixtures usavam `\n`, então nenhum teste pegava.
test("C.9b-crlf [D7a] status.yaml em CRLF não pode fazer o guard falhar aberto", () => {
  for (const modo of ["autonomous", "assisted"]) {
    const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
    mkdirSync(join(dir, ".context", "workflow"), { recursive: true });
    writeFileSync(join(dir, ".context", "workflow", "status.yaml"), `phase: E\r\nautonomy: ${modo}\r\n`);

    assert.equal(readAutonomy(dir), modo, `readAutonomy leu errado com CRLF (${modo})`);

    const r = ok(dir);
    assert.ok(
      r.refused.some((x) => /autonom/i.test(x.reason)),
      `CRLF + autonomy:${modo} deveria recusar, veio: ${JSON.stringify(r.refused)}`,
    );
    assert.ok(!existsSync(join(dir, "scripts", "bump-version.sh")));
  }
});

test("C.9b-crlf supervised em CRLF continua permitido", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  mkdirSync(join(dir, ".context", "workflow"), { recursive: true });
  writeFileSync(join(dir, ".context", "workflow", "status.yaml"), "phase: E\r\nautonomy: supervised\r\n");
  assert.equal(readAutonomy(dir), "supervised");
  assert.equal(ok(dir).refused.length, 0);
});

// NOTE 7 do code review: em detached HEAD, `git branch --show-current` volta vazio e
// o check de branch protegida era PULADO. Sem branch, não dá para saber se estamos
// protegidos → falha fechado.
test("C.9f detached HEAD → refused (não dá para avaliar branch protection)", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  writeFileSync(join(dir, "a.txt"), "x\n");
  execFileSync("git", ["-C", dir, "add", "a.txt"]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "init"]);
  execFileSync("git", ["-C", dir, "checkout", "-q", "--detach", "HEAD"]);

  const r = ok(dir);
  assert.equal(r.created.length, 0);
  assert.ok(
    r.refused.some((x) => /detached|branch/i.test(x.reason)),
    `esperava recusa em detached HEAD, veio: ${JSON.stringify(r.refused)}`,
  );
  assert.ok(!existsSync(join(dir, "scripts", "bump-version.sh")));
});

test("C.9c [D7b] .github/workflows/** nunca é escrito por node:fs", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  const r = ok(dir);

  assert.ok(!existsSync(join(dir, ".github", "workflows", "release.yml")), "o applier escreveu o workflow por node:fs");

  const viaTool = r.mustWriteViaTool.map((x) => x.dest);
  assert.deepEqual(viaTool, [".github/workflows/release.yml"]);
  assert.ok(r.mustWriteViaTool[0].content.length > 0, "mustWriteViaTool deve carregar o conteúdo p/ a ferramenta Write");

  // só scripts/** é materializado pelo applier
  assert.deepEqual(r.created.sort(), ["scripts/bump-version.sh", "scripts/lib/changelog-cut.mjs"]);
});

test("C.9d [N6a] verifyWritten: hash(dest) === hash(asset); 1 byte → mismatch", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  const r = ok(dir);
  const entry = r.mustWriteViaTool[0];

  // ausente ainda → não passa
  assert.equal(verifyWritten(dir).ok, false, "sem o workflow gravado, verifyWritten não pode dizer ok");

  // simula a ferramenta Write gravando o conteúdo entregue
  mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
  writeFileSync(join(dir, ".github", "workflows", "release.yml"), entry.content);
  const good = verifyWritten(dir);
  assert.equal(good.ok, true, `esperava ok, veio: ${JSON.stringify(good.mismatch)}`);

  // 1 byte alterado → mismatch fail-loud
  writeFileSync(join(dir, ".github", "workflows", "release.yml"), entry.content + " ");
  const bad = verifyWritten(dir);
  assert.equal(bad.ok, false);
  assert.equal(bad.mismatch.length, 1);
  assert.equal(bad.mismatch[0].dest, ".github/workflows/release.yml");
});

test("C.9e branch protegida → applyScaffold recusa (evita scripts/** órfãos)", () => {
  const dir = newRepo({
    branch: "main",
    remotes: [["origin", "https://github.com/x/y.git"]],
    devflowYaml: "git:\n  protectedBranches: [main, develop]\n",
  });
  const r = ok(dir);
  assert.equal(r.created.length, 0);
  assert.ok(
    r.refused.some((x) => /branch/i.test(x.reason)),
    `esperava recusa por branch protegida, veio: ${JSON.stringify(r.refused)}`,
  );
  assert.ok(!existsSync(join(dir, "scripts", "bump-version.sh")));
});

test("C.10 dryRun → nada escrito, retorna o plano", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  const r = applyScaffold(dir, { confirmed: true, dryRun: true });
  assert.equal(r.created.length, 0);
  assert.equal(r.mustWriteViaTool.length, 0);
  assert.equal(r.plan.length, SCAFFOLD.length);
  for (const item of r.plan) assert.equal(item.status, "create");
  assert.ok(!existsSync(join(dir, "scripts", "bump-version.sh")));
  assert.ok(!existsSync(join(dir, ".github", "workflows", "release.yml")));
});

test("C.11 confirmed + gate ok → cria writer:'fs' verbatim (hash dest == hash asset)", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  ok(dir);
  for (const item of SCAFFOLD.filter((s) => s.writer === "fs")) {
    const destAbs = join(dir, item.dest);
    assert.ok(existsSync(destAbs), `${item.dest} não foi criado`);
    assert.equal(
      sha256(readFileSync(destAbs)),
      sha256(readFileSync(join(ASSET_DIR, item.src))),
      `${item.dest} não é byte-idêntico ao asset`,
    );
  }
});

test("C.12 dest já existe → preserved, conteúdo original intacto", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(join(dir, "scripts", "bump-version.sh"), "#!/bin/sh\n# MEU script\n");

  const r = ok(dir);
  assert.ok(r.preserved.includes("scripts/bump-version.sh"));
  assert.ok(!r.created.includes("scripts/bump-version.sh"));
  assert.equal(readFileSync(join(dir, "scripts", "bump-version.sh"), "utf8"), "#!/bin/sh\n# MEU script\n");
});

// ─── Contenção ──────────────────────────────────────────────────────────────

test("C.13 dest com '..' → violação de contenção", () => {
  const dir = newRepo();
  assert.equal(containmentViolation(dir, "../fora.sh"), "outside-root");
  assert.equal(containmentViolation(dir, "scripts/../../fora.sh"), "outside-root");
  assert.equal(containmentViolation(dir, "scripts/bump-version.sh"), null);
});

test("C.13 dest é symlink → refused, alvo intacto", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  const outside = mkdtempSync(join(tmpdir(), "rs-outside-"));
  CLEANUP.push(outside);
  const target = join(outside, "alvo.sh");
  writeFileSync(target, "ORIGINAL\n");

  mkdirSync(join(dir, "scripts"), { recursive: true });
  symlinkSync(target, join(dir, "scripts", "bump-version.sh"));

  assert.equal(containmentViolation(dir, "scripts/bump-version.sh"), "symlink");
  const r = ok(dir);
  assert.ok(
    r.refused.some((x) => x.dest === "scripts/bump-version.sh" && /symlink/.test(x.reason)),
    `esperava recusa por symlink, veio: ${JSON.stringify(r.refused)}`,
  );
  assert.equal(readFileSync(target, "utf8"), "ORIGINAL\n", "escreveu através do symlink");
});

test("C.13b diretório-pai é symlink apontando fora da raiz → refused", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  const outside = mkdtempSync(join(tmpdir(), "rs-outside-"));
  CLEANUP.push(outside);

  // scripts/ é um symlink para fora do projectRoot. isWithinDir é LÉXICO: sem
  // realpath do pai, 'scripts/bump-version.sh' parece contido.
  symlinkSync(outside, join(dir, "scripts"));

  assert.equal(containmentViolation(dir, "scripts/bump-version.sh"), "parent-escapes");
  const r = ok(dir);
  assert.ok(
    r.refused.some((x) => x.dest === "scripts/bump-version.sh" && /parent/.test(x.reason)),
    `esperava recusa por pai-symlink, veio: ${JSON.stringify(r.refused)}`,
  );
  assert.ok(!existsSync(join(outside, "bump-version.sh")), "escreveu fora do projectRoot via pai-symlink");
});

// ─── CLI (SI-1: as skills chamam a CLI, nunca `node -e`) ────────────────────

const CLI = join(ROOT, "scripts", "lib", "release-scaffold.mjs");

/** @returns {{status:number, out:string}} */
function runCli(cwd, args) {
  try {
    const out = execFileSync("node", [CLI, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, out };
  } catch (e) {
    return { status: e.status ?? 1, out: e.stdout ?? "" };
  }
}

test("CLI apply sem --confirmed → exit 1, nada escrito", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  const r = runCli(dir, ["apply"]);
  assert.equal(r.status, 1, "a CLI deve sinalizar recusa no exit code");
  assert.match(JSON.parse(r.out).refused[0].reason, /confirm/i);
  assert.ok(!existsSync(join(dir, "scripts", "bump-version.sh")));
});

test("CLI apply --confirmed → cria scripts/**, NUNCA .github/**", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  const r = runCli(dir, ["apply", "--confirmed"]);
  assert.equal(r.status, 0);
  assert.ok(existsSync(join(dir, "scripts", "bump-version.sh")));
  assert.ok(existsSync(join(dir, "scripts", "lib", "changelog-cut.mjs")));
  assert.ok(!existsSync(join(dir, ".github")), "a CLI escreveu .github/** por node:fs — viola D7b");
  assert.equal(JSON.parse(r.out).mustWriteViaTool[0].dest, ".github/workflows/release.yml");
});

test("CLI verify sem o workflow → exit 1 (fail-loud)", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  const r = runCli(dir, ["verify"]);
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.out).ok, false);
});

test("CLI gate → JSON com git/github", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  const gate = JSON.parse(runCli(dir, ["gate"]).out);
  assert.deepEqual({ git: gate.git, github: gate.github }, { git: true, github: true });
});

test("CLI comando inválido → exit 2", () => {
  assert.equal(runCli(newRepo(), ["bogus"]).status, 2);
});

// ─── planScaffold ───────────────────────────────────────────────────────────

test("planScaffold reporta status e writer por artefato", () => {
  const dir = newRepo({ remotes: [["origin", "https://github.com/x/y.git"]] });
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(join(dir, "scripts", "bump-version.sh"), "meu\n");

  const plan = planScaffold(dir);
  assert.equal(plan.length, 3);
  const byDest = Object.fromEntries(plan.map((p) => [p.dest, p]));
  assert.equal(byDest["scripts/bump-version.sh"].status, "exists");
  assert.equal(byDest["scripts/lib/changelog-cut.mjs"].status, "create");
  assert.equal(byDest[".github/workflows/release.yml"].writer, "tool");
  assert.equal(byDest["scripts/bump-version.sh"].writer, "fs");
});
