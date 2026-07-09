// tests/e2e/_harness.mjs — fixture git ISOLADO para E2E do hook.
// Cria um repo em tmpdir FORA da árvore do repo real, numa branch de trabalho,
// árvore limpa, com .context/.devflow.yaml. Env higienizado (não lê ~/.gitconfig,
// sem tokens, sem prompt). Roda o hook post-tool-use com um payload TaskUpdate/completed
// e devolve o additionalContext emitido. O hook NÃO chama gh → sem stub/bare necessários.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const HOOK = join(REPO, "hooks", "post-tool-use");

const HOME = mkdtempSync(join(tmpdir(), "e2e-home-"));
const ENV = {
  ...process.env,
  HOME,
  GIT_CONFIG_GLOBAL: join(HOME, ".gitconfig"),
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
};
delete ENV.CLAUDE_PLUGIN_ROOT; // saída via additional_context; PLUGIN_ROOT vem do BASH_SOURCE
delete ENV.GH_TOKEN;
delete ENV.GITHUB_TOKEN;

export function makeFixture({ devflowYaml, autonomy, branch = "feature/x" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "e2e-repo-"));
  const g = (...a) => execFileSync("git", ["-C", dir, ...a], { env: ENV, encoding: "utf8" });
  execFileSync("git", ["init", "-b", "main", dir], { env: ENV });
  writeFileSync(join(dir, "f.txt"), "x\n");
  g("add", "-A"); g("commit", "-m", "init");
  g("checkout", "-b", branch);
  mkdirSync(join(dir, ".context"), { recursive: true });
  if (devflowYaml != null) writeFileSync(join(dir, ".context", ".devflow.yaml"), devflowYaml);
  if (autonomy) {
    mkdirSync(join(dir, ".context", "workflow"), { recursive: true });
    writeFileSync(join(dir, ".context", "workflow", "status.yaml"), `autonomy: ${autonomy}\n`);
  }
  return dir;
}

export function runHook(cwd) {
  const payload = JSON.stringify({ tool_name: "TaskUpdate", tool_input: { status: "completed" }, cwd });
  const out = execFileSync("bash", [HOOK], { input: payload, env: ENV, cwd, encoding: "utf8" });
  const j = JSON.parse(out);
  return j.hookSpecificOutput?.additionalContext ?? j.additional_context ?? "";
}
