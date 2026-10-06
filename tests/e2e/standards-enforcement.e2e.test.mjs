// E2E de aceitação do enforcement de standards (ADR-015): fluxo completo, agente adversário
// e baseline apagado da árvore, contra os hooks e o CLI reais em fixtures temporários.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint } from "../../scripts/lib/standards-baseline.mjs";
import { runStandardsCommand } from "../../scripts/lib/standards-check-cli.mjs";
import { demoProject } from "../helpers/standards-fixture.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(REPO); // o helper demoProject lê assets/standards por caminho relativo
const HOME = mkdtempSync(join(tmpdir(), "std-e2e-home-"));
after(() => rmSync(HOME, { recursive: true, force: true }));
const ENV = {
  ...process.env,
  HOME,
  GIT_CONFIG_GLOBAL: join(HOME, ".gitconfig"),
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  CI: "",
};
delete ENV.CLAUDE_PLUGIN_ROOT;
delete ENV.DEVFLOW_LINTER_TIMEOUT_MS;

const hook = (name, ev, cwd) =>
  spawnSync("bash", [join(REPO, "hooks", name)], { input: JSON.stringify(ev), cwd, encoding: "utf8", env: ENV }).stdout;
const cli = (root, ...a) =>
  spawnSync("node", [join(REPO, "scripts/devflow-standards.mjs"), ...a, `--project=${root}`], { encoding: "utf8", env: ENV });
const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8", env: ENV, stdio: ["ignore", "pipe", "pipe"] });

async function fixture(t) {
  const root = demoProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q", "-b", "main");
  writeFileSync(join(root, ".context/.devflow.yaml"), 'git:\n  strategy: branch-flow\n  protectedBranches: [main]\nverify:\n  standards: ["devflow-standards", "gate"]\n');
  writeFileSync(join(root, "src/legacy.js"), "BAD\n");
  git(root, "add", "-A");
  const quiet = t.mock.method(console, "log", () => {}); // o CLI anuncia o baseline criado; não é ruído do teste
  const rc = await runStandardsCommand("baseline", ["init"], root, { isInteractive: () => true });
  quiet.mock.restore();
  assert.equal(rc, 0);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "init");
  git(root, "checkout", "-q", "-b", "feat");
  return root;
}

test("baseline → contexto pré-edição → bloqueio → correção → check --staged → gate V", async (t) => {
  const root = await fixture(t);
  const pre = JSON.parse(hook("pre-tool-use", { tool_name: "Write", tool_input: { file_path: join(root, "src/new.js") }, cwd: root, session_id: "e2e" }, root));
  assert.match(pre.hookSpecificOutput.additionalContext, /sem BAD/);

  writeFileSync(join(root, "src/new.js"), "BAD\n");
  const post = JSON.parse(hook("post-tool-use-lint", { tool_name: "Write", tool_input: { file_path: join(root, "src/new.js") }, cwd: root }, root));
  assert.equal(post.decision, "block");

  writeFileSync(join(root, "src/new.js"), "ok\n");
  assert.equal(hook("post-tool-use-lint", { tool_name: "Write", tool_input: { file_path: join(root, "src/new.js") }, cwd: root }, root), "");

  git(root, "add", "-A");
  assert.equal(cli(root, "check", "--staged").status, 0);
  git(root, "commit", "-qm", "feat");

  const run = spawnSync("node", [join(REPO, "scripts/lib/verify-run.mjs"), "standards", root], { encoding: "utf8", env: { ...ENV, BASE_REF: "main" } });
  assert.equal(run.status, 0, run.stderr);
  const gate = spawnSync("node", [join(REPO, "scripts/lib/verify-gate.mjs"), root, ""], { encoding: "utf8", env: ENV });
  assert.equal(gate.status, 0, gate.stderr);
});

test("agente adversário: toda camada local resiste ou o gate pega", async (t) => {
  const root = await fixture(t);
  const S = join(root, ".context/engineering/standards");
  const dec = (out) => (out.trim() ? JSON.parse(out).hookSpecificOutput.permissionDecision : "");

  // (a) Edit no baseline → deny
  assert.equal(dec(hook("pre-tool-use", { tool_name: "Write", tool_input: { file_path: join(S, "baseline.json"), content: "{}" }, cwd: root }, root)), "deny");
  // (b) Bash com o CLI da catraca → ask
  assert.equal(dec(hook("pre-tool-use-ratchet", { tool_name: "Bash", tool_input: { command: `node ${REPO}/scripts/devflow-standards.mjs baseline init` }, cwd: root }, root)), "ask");
  // (c) CLI sem terminal → recusado pela checagem de terminal (fp válido: não é erro de uso)
  const fp = JSON.parse(readFileSync(join(S, "baseline.json"), "utf8")).entries[0].fp;
  const acc = cli(root, "baseline", "accept", fp, "--reason", "y");
  assert.equal(acc.status, 2);
  assert.match(acc.stderr, /recusado: baseline accept [0-9a-f]{40} --reason .* afrouxa a catraca e exige o terminal interativo do operador \(ADR-015 D6\)/);
  // (d) escrita ofuscada (fora do Write tool e do CLI): baseline regravado aceitando o BAD novo
  //     e nível rebaixado, tudo commitado
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  const bl = JSON.parse(readFileSync(join(S, "baseline.json"), "utf8"));
  const e0 = bl.entries[0];
  const forged = { ...e0, path: "src/new.js", count: 1 };
  forged.fp = fingerprint({ stdId: forged.stdId, ruleId: forged.ruleId, path: forged.path, message: forged.message });
  bl.entries.push(forged);
  writeFileSync(join(S, "baseline.json"), JSON.stringify(bl, null, 2) + "\n");
  const md = join(S, "std-demo.md");
  writeFileSync(md, readFileSync(md, "utf8").replace("level: block", "level: warn"));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "atalho");
  const g = spawnSync("node", [join(REPO, "scripts/devflow-standards.mjs"), "gate", "--base-ref=refs/heads/main", "--ci", `--project=${root}`], { encoding: "utf8", env: ENV });
  assert.equal(g.status, 1, g.stderr);
  assert.match(g.stderr, /baseline aceita a mais/);
  assert.match(g.stderr, /std-demo: nível block → warn/);
});

test("baseline apagado da árvore (sem commit): o hook continua bloqueando pelo HEAD", async (t) => {
  const root = await fixture(t);
  rmSync(join(root, ".context/engineering/standards/baseline.json"));
  writeFileSync(join(root, "src/x.js"), "BAD\n");
  const post = JSON.parse(hook("post-tool-use-lint", { tool_name: "Write", tool_input: { file_path: join(root, "src/x.js") }, cwd: root }, root));
  assert.equal(post.decision, "block");
});
