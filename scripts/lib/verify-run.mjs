// scripts/lib/verify-run.mjs — executor de um sinal. Nunca decide o gate (D8).
// Valida o contrato (via parser único), roda via execFile (sem sh -c),
// faz append do resultado no ledger com o treeDigest da árvore ANTES da execução.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { readVerifyFromPath } from "./devflow-config.mjs";
import { appendEntry } from "./verify-ledger.mjs";
import { treeDigest } from "./verify-tree-digest.mjs";
import { trustedPluginRoot } from "./standards-engine.mjs";
import { isCI } from "./standards-check-cli.mjs";
import { DEFAULT_BASE_REF } from "./standards-git.mjs";
import { isValidPr, isValidRepo } from "./standards-label-approval.mjs";

const CONFIG_REL = ".context/.devflow.yaml";

// ADR-013 v1.1.0: o sinal `standards` tem argv reservado; o comando real sai da raiz
// confiável do plugin (D5: import.meta.url + verifyPluginRoot, nunca CLAUDE_PLUGIN_ROOT).
// O argv recebido é ignorado para esse sinal: um comando do projeto nunca roda no lugar dele.
// A expansão é o `gate` (T18): a catraca contra o merge-base e depois o `check --all`.
// `ci` vem do MESMO isCI() do CLI — `CI=1` conta como CI aqui e lá (antes só `CI=true` contava
// aqui, e o `--ci` deixava de ser passado num runner que exporta `CI=1`).
// A base padrão vai na forma completa (`refs/remotes/origin/main`): um nome curto pode ser
// tomado por uma tag homônima. Um `BASE_REF` curto vindo do ambiente é resolvido pelo gate só
// em `refs/remotes/`.
// Override (T19): no CI, quando o ambiente traz o PR e o repositório, a expansão leva
// `--allow-weakening --pr --repo` e o gate confere a aprovação pela API — sem isso, um PR com o
// override aprovado ficava vermelho neste sinal. O gate só consulta a API se a catraca foi
// enfraquecida; a flag sempre presente não afrouxa nada.
export function resolveArgv(name, argv, { ci = isCI(), baseRef = process.env.BASE_REF || DEFAULT_BASE_REF, env = process.env } = {}) {
  if (name !== "standards") return argv;
  const root = trustedPluginRoot();
  if (!root) throw new Error("sinal standards: raiz do plugin não verificada — fail-closed");
  return [process.execPath, join(root, "scripts", "devflow-standards.mjs"), "gate", `--base-ref=${baseRef}`, ...(ci ? ["--ci", ...overrideArgs(env)] : [])];
}

/**
 * Argumentos do override a partir do ambiente do CI: `DEVFLOW_PR_NUMBER` (só dígitos) e
 * `DEVFLOW_REPO` (`owner/nome`), validados pelas mesmas regras do `--pr` e do `--repo` do CLI.
 * Variável ausente ou fora do formato → sem override (lista vazia): o gate segue fechado e
 * nunca recebe um argumento malformado, que seria uso incorreto (exit 2).
 */
export function overrideArgs(env = process.env) {
  const pr = env.DEVFLOW_PR_NUMBER, repo = env.DEVFLOW_REPO;
  if (typeof pr !== "string" || typeof repo !== "string" || !isValidPr(pr) || !isValidRepo(repo)) return [];
  return ["--allow-weakening", `--pr=${pr}`, `--repo=${repo}`];
}

// Código de produção (não workflow script) → new Date() é permitido para o `at`.
export function runSignal(name, { root, phase = "" } = {}) {
  const { signals } = readVerifyFromPath(join(root, CONFIG_REL));
  const argv = signals[name];
  if (!argv) throw new Error(`sinal '${name}' não declarado em verify:`);
  const digest = treeDigest(root);
  const t0 = process.hrtime.bigint();
  let exit = 0;
  let cmd = null;
  try { cmd = resolveArgv(name, argv); } catch (e) { process.stderr.write(`[verify] ${e.message}\n`); }
  if (!cmd) {
    exit = 3; // erro de execução: argv não resolvido (fail-closed, nunca verde)
  } else {
    try {
      execFileSync(cmd[0], cmd.slice(1), { cwd: root, stdio: "inherit" });
    } catch (e) {
      exit = typeof e.status === "number" ? e.status : 1;
    }
  }
  const durationMs = Number((process.hrtime.bigint() - t0) / 1000000n);
  const entry = { signal: name, exit, durationMs, treeDigest: digest, at: new Date().toISOString(), phase };
  appendEntry(root, entry);
  return entry;
}

function main(argv) {
  const name = argv[0];
  const root = argv[1] || process.cwd();
  const phase = argv[2] || "";
  if (!name) { console.error("uso: verify-run <signal> [root] [phase]"); process.exit(2); }
  const r = runSignal(name, { root, phase });
  process.stderr.write(`[verify] ${name}: exit ${r.exit} (${r.durationMs}ms)\n`);
  process.exit(r.exit);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
