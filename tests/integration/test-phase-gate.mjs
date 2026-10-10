// tests/integration/test-phase-gate.mjs — coletor do gate de evidência em repositórios git temporários
// (D5, spec 2026-10-10 §4). Nunca toca o repo versionado.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { decide, planFacts } from "../../scripts/lib/phase-gate.mjs";

const PREVC = ".context/runtime/workflows/prevc.json";
const ADV = (cwd, input = {}) => ({ tool_name: "mcp__dotcontext__workflow-advance", tool_input: input, cwd });
const BODY = "# Plano\n\n" + "- [ ] tarefa com teste e implementação\n".repeat(10);
const T0 = "2026-01-01T00:00:00.000Z";
const ENV = {}; // sem CLAUDE_PROJECT_DIR nem DEVFLOW_EVIDENCE_GATE: só o cwd do evento conta
const ID = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };

const sh = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...ID } }).trim();
// Commit com data fixa: a semente fica ANTES de T0 e nunca conta como trabalho da fase E.
const shAt = (cwd, date, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...ID, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } }).trim();
function write(root, rel, text) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}
function commit(root, rel, msg) {
  write(root, rel, `${msg}\n`);
  sh(root, "add", "--", rel);
  sh(root, "commit", "-q", "-m", msg);
}
const tmp = (p) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)));
// Repo com main protegida, workflow LARGE na fase `cur`, fase E iniciada em T0 (passado).
function mkRepo({ cur = "P", phases = {}, yaml = "git:\n  protectedBranches: [main]\n", started = T0, plan = "x" } = {}) {
  const root = tmp("phase-gate-");
  sh(root, "init", "-q", "-b", "main");
  write(root, ".context/.devflow.yaml", yaml);
  write(root, "seed.txt", "seed\n");
  sh(root, "add", "--", "seed.txt");
  shAt(root, "2025-01-01T00:00:00Z", "commit", "-q", "-m", "seed");
  const ph = { P: { status: "in_progress" }, R: { status: "pending" }, E: { status: "pending", started_at: T0 }, V: { status: "pending" }, C: { status: "pending" }, ...phases };
  write(root, PREVC, JSON.stringify({ status: { project: { current_phase: cur, started, scale: 3, ...(plan ? { plan } : {}) }, phases: ph } }));
  return root;
}
const planFile = (root, frontmatter = "", body = BODY) => write(root, ".context/plans/x.md", `---\ntype: plan\nrequiredSignals: [unit]\n${frontmatter}---\n${body}`);
const decision = (s) => (s ? JSON.parse(s).hookSpecificOutput : null);
const dec = (ev, env = ENV) => decision(decide(ev, env));

test("sem evento de avanço, sem prevc.json ou com evidenceGate: off → calado", () => {
  const root = mkRepo();
  assert.equal(decide({ tool_name: "Bash", tool_input: { command: "ls" }, cwd: root }, ENV), "");
  assert.equal(decide(ADV(tmp("phase-gate-")), ENV), "");
  assert.equal(decide(ADV(mkRepo({ yaml: "prevc:\n  evidenceGate: off\n" })), ENV), "");
});

test("P: sem plano → deny (com force também); plano com corpo → passa", () => {
  const root = mkRepo();
  assert.equal(dec(ADV(root)).permissionDecision, "deny");
  assert.equal(dec(ADV(root, { force: true })).permissionDecision, "deny");
  planFile(root);
  assert.equal(decide(ADV(root), ENV), "");
});

test("P: slug pelo plans.json (active ou completed) quando o prevc.json não traz o plano", () => {
  const root = mkRepo({ plan: null });
  planFile(root);
  write(root, ".context/runtime/workflows/plans.json", JSON.stringify({ active: [], completed: [{ slug: "x", path: "plans/x.md" }], primary: "x" }));
  assert.equal(decide(ADV(root), ENV), "");
});

test("P: plans.json do runtime vazio não cai no legado; path do plans.json é ignorado (traversal)", () => {
  const root = mkRepo({ plan: null });
  write(root, ".context/runtime/workflows/plans.json", JSON.stringify({ active: [], completed: [] }));
  write(root, ".context/workflow/plans.json", JSON.stringify({ active: [{ slug: "old", path: "plans/old.md" }], primary: "old" }));
  write(root, ".context/plans/old.md", `---\ntype: plan\n---\n${BODY}`);
  assert.equal(planFacts(root, JSON.parse(fs.readFileSync(path.join(root, PREVC), "utf8"))).linked, false);
  const evil = mkRepo({ plan: null });
  write(evil, ".context/runtime/workflows/plans.json", JSON.stringify({ active: [{ slug: "../../etc/passwd", path: "../../../etc/passwd" }], primary: "../../etc/passwd" }));
  assert.equal(dec(ADV(evil)).permissionDecision, "deny");
});

test("P: plano como symlink para fora da raiz ou FIFO → não linkado, sem travar", () => {
  const out = tmp("phase-gate-out-");
  fs.writeFileSync(path.join(out, "x.md"), `---\ntype: plan\n---\n${BODY}`);
  const a = mkRepo();
  fs.mkdirSync(path.join(a, ".context/plans"), { recursive: true });
  fs.symlinkSync(path.join(out, "x.md"), path.join(a, ".context/plans/x.md"));
  assert.equal(dec(ADV(a)).permissionDecision, "deny");
  const b = mkRepo();
  fs.mkdirSync(path.join(b, ".context/plans"), { recursive: true });
  execFileSync("mkfifo", [path.join(b, ".context/plans/x.md")]);
  const t = Date.now();
  assert.equal(dec(ADV(b)).permissionDecision, "deny");
  assert.ok(Date.now() - t < 3000);
});

test("modo warn avisa; valor inválido nega; DEVFLOW_EVIDENCE_GATE do ambiente tem precedência", () => {
  const w = dec(ADV(mkRepo({ yaml: "prevc:\n  evidenceGate: warn\n" })));
  assert.equal(w.permissionDecision, undefined);
  assert.match(w.additionalContext, /nenhum plano/);
  assert.equal(dec(ADV(mkRepo({ yaml: "prevc:\n  evidenceGate: talvez\n" }))).permissionDecision, "deny");
  assert.equal(decide(ADV(mkRepo()), { DEVFLOW_EVIDENCE_GATE: "off" }), "");
});

test("R: review.verdict decide; frontmatter ilegível nega (não é erro interno)", () => {
  const root = mkRepo({ cur: "R", phases: { P: { status: "completed" }, R: { status: "in_progress" } } });
  planFile(root);
  assert.match(dec(ADV(root)).permissionDecisionReason, /review\.verdict/);
  planFile(root, "review:\n  verdict: REVISE\n  reviewers: [architect]\n");
  assert.match(dec(ADV(root)).permissionDecisionReason, /REVISE/);
  planFile(root, "review:\n  verdict: PENDING\n");
  assert.match(dec(ADV(root)).permissionDecisionReason, /valor inválido/);
  planFile(root, "review:\n  verdict: |\n    PROCEED\n");
  assert.equal(dec(ADV(root)).permissionDecision, "deny");
  planFile(root, "review:\n  verdict: PROCEED  # ok\n  reviewers: [architect, security-auditor]\n  date: \"2026-10-10\"\n");
  assert.equal(decide(ADV(root), ENV), "");
});

test("E: na main protegida e sem commits → deny; commit na feature → passa", () => {
  const root = mkRepo({ cur: "E", phases: { E: { status: "in_progress", started_at: T0 } } });
  const r = dec(ADV(root)).permissionDecisionReason;
  assert.match(r, /protegida/);
  assert.match(r, /nenhum commit/);
  sh(root, "switch", "-q", "-c", "feature/x");
  commit(root, "src.txt", "feat: x");
  assert.equal(decide(ADV(root), ENV), "");
});

test("E: trunk-based ou branchProtection: false não tratam a main como protegida", () => {
  for (const yaml of ["git:\n  strategy: trunk-based\n  protectedBranches: [main]\n", "git:\n  branchProtection: false\n  protectedBranches: [main]\n"]) {
    const root = mkRepo({ cur: "E", yaml, phases: { E: { status: "in_progress", started_at: T0 } } });
    commit(root, "src.txt", "feat: x");
    assert.equal(decide(ADV(root), ENV), "", yaml);
  }
});

test("E: started_at inválido ou HEAD sem commit contam como zero commits (deny, não aviso)", () => {
  const a = mkRepo({ cur: "E", phases: { E: { status: "in_progress", started_at: "never" } } });
  sh(a, "switch", "-q", "-c", "feature/x");
  commit(a, "src.txt", "feat: x");
  assert.match(dec(ADV(a)).permissionDecisionReason, /nenhum commit/);
  const b = tmp("phase-gate-");
  sh(b, "init", "-q", "-b", "feature/y");
  write(b, PREVC, JSON.stringify({ status: { project: { current_phase: "E", started: T0 }, phases: { E: { status: "in_progress", started_at: T0 } } } }));
  assert.equal(dec(ADV(b)).permissionDecision, "deny");
});

test("E: stories deste workflow pendentes negam; stories de outro workflow são ignoradas", () => {
  const started = new Date(Date.now() - 120_000).toISOString();
  const root = mkRepo({ cur: "E", started, phases: { E: { status: "in_progress", started_at: T0 } } });
  sh(root, "switch", "-q", "-c", "feature/x");
  commit(root, "src.txt", "feat: x");
  const stories = (created, status) => `feature: "x"\ncreated: "${created}"\nstories:\n  - id: "S1"\n    title: "a"\n    status: completed\n  - id: "S2"\n    title: "b"\n    status: ${status}\n`;
  write(root, ".context/workflow/stories.yaml", stories(new Date().toISOString(), "pending"));
  assert.match(dec(ADV(root)).permissionDecisionReason, /1 story/);
  write(root, ".context/workflow/stories.yaml", stories("2020-01-01T00:00:00Z", "pending"));
  assert.equal(decide(ADV(root), ENV), "");
});

test("V: verify: declarado e sinal nunca observado → deny com o sinal (requiredSignals do plano)", () => {
  const root = mkRepo({ cur: "V", yaml: "git:\n  protectedBranches: [main]\nverify:\n  unit: [\"node\", \"--test\"]\n" });
  planFile(root);
  assert.match(dec(ADV(root)).permissionDecisionReason, /«unit»/);
});

test("V: plano sem requiredSignals e verify: declarado → exige todos os sinais declarados", () => {
  const root = mkRepo({ cur: "V", yaml: "git:\n  protectedBranches: [main]\nverify:\n  unit: [\"node\", \"--test\"]\n  lint: [\"node\", \"lint.mjs\"]\n" });
  write(root, ".context/plans/x.md", `---\ntype: plan\n---\n${BODY}`);
  const r = dec(ADV(root)).permissionDecisionReason;
  assert.match(r, /«unit»/);
  assert.match(r, /«lint»/);
});

test("V: standard local sem nível e sem verify: → deny que manda declarar verify.standards", () => {
  const root = mkRepo({ cur: "V" });
  planFile(root);
  write(root, ".context/engineering/standards/std-local.md", "---\nid: std-local\nsource: local\napplyTo: [\"**/*.js\"]\n---\n# Local\n");
  assert.match(dec(ADV(root)).permissionDecisionReason, /verify\.standards/);
});

test("C: merge local sem remoto conclui", () => {
  const root = mkRepo({ cur: "C" });
  sh(root, "switch", "-q", "-c", "feature/x");
  commit(root, "src.txt", "feat: x");
  assert.equal(dec(ADV(root)).permissionDecision, "deny");
  sh(root, "switch", "-q", "main");
  sh(root, "merge", "-q", "--no-ff", "-m", "merge feature/x", "feature/x");
  assert.equal(decide(ADV(root), ENV), "");
});

test("C: feature já contida na base (ff) conclui; branch publicada conclui; squash na base remota também", () => {
  const remote = tmp("phase-gate-remote-");
  sh(remote, "init", "-q", "--bare", "-b", "main");
  const root = mkRepo({ cur: "C" });
  sh(root, "remote", "add", "origin", remote);
  sh(root, "push", "-q", "origin", "main");
  sh(root, "switch", "-q", "-c", "feature/x");
  commit(root, "src.txt", "feat: x");
  sh(root, "push", "-q", "origin", "feature/x");
  assert.equal(decide(ADV(root), ENV), ""); // publicada
  const other = tmp("phase-gate-other-");
  sh(other, "clone", "-q", remote, ".");
  commit(other, "src.txt", "feat: x (squash)");
  sh(other, "push", "-q", "origin", "main");
  sh(other, "push", "-q", "origin", "--delete", "feature/x");
  sh(root, "fetch", "-q", "--prune", "origin");
  assert.equal(decide(ADV(root), ENV), ""); // fallback do squash: base remota com commit posterior a E
});

test("raiz: CLAUDE_PROJECT_DIR é avaliado mesmo com o cwd numa subpasta sem workflow", () => {
  const root = mkRepo();
  const sub = path.join(root, "pkg");
  fs.mkdirSync(sub);
  const elsewhere = tmp("phase-gate-wt-"); // como uma worktree sem .context/runtime
  sh(elsewhere, "init", "-q", "-b", "feature/x");
  assert.equal(decision(decide(ADV(elsewhere), { CLAUDE_PROJECT_DIR: root })).permissionDecision, "deny");
});

test("repo com log.showSignature + gpg.program no config local não executa o programa", () => {
  const root = mkRepo({ cur: "E", phases: { E: { status: "in_progress", started_at: T0 } } });
  const marker = path.join(tmp("phase-gate-mark-"), "ran");
  const prog = path.join(root, "evil.sh");
  fs.writeFileSync(prog, `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 });
  sh(root, "config", "log.showSignature", "true");
  sh(root, "config", "gpg.program", prog);
  decide(ADV(root), ENV);
  assert.equal(fs.existsSync(marker), false);
});

test("git ausente (PATH vazio) → passa com aviso, nunca deny", () => {
  const root = mkRepo({ cur: "C" });
  const saved = process.env.PATH;
  process.env.PATH = "";
  try {
    const d = dec(ADV(root));
    assert.equal(d.permissionDecision, undefined);
    assert.match(d.additionalContext, /não foi possível conferir/);
  } finally {
    process.env.PATH = saved;
  }
});
