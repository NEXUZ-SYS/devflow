#!/usr/bin/env node
// scripts/omp-launch.mjs — o `devflow omp`.
//
// Lança o omp (oh-my-pi) com o contexto autoritativo de sessão do DevFlow
// (modo, using-devflow, ADR guardrails, índice de standards, recall MemPalace,
// napkin, routines) injetado de forma AUTORITATIVA — o modelo OBEDECE — desde
// o turno 1, em paridade com o `additionalContext` do Claude Code.
//
// MECANISMO ESCOLHIDO (verificado empiricamente; ver omp/SPIKE-omp-api.md,
// seção "Autoridade de injeção (follow-up)"):
//
//   --system-prompt "<bloco 0 mínimo>"  +  --append-system-prompt "<contexto DevFlow>"
//
// Por quê o combo, e não --system-prompt grande sozinho:
//   - A autoridade no omp 15.9.5 é POSICIONAL. O "bloco 0" (instruções estáveis
//     de topo do system prompt) é o tier autoritativo — o modelo obedece.
//   - --append-system-prompt SOZINHO cai DEPOIS do footer de projeto (cauda) →
//     desprioritizado (spike: obedecido 1/6). NÃO é autoritativo.
//   - Mas quando há um custom --system-prompt presente, o append migra para a
//     região autoritativa (após o bloco custom, antes do footer) → obedecido
//     (spike run E: 4/4 benigno; 3/3 com conteúdo DevFlow multi-regra).
//   - Reescrever o bloco 0 com TODO o contexto DevFlow (alternativa i) seria
//     autoritativo, mas DESCARTA os defaults do omp (guidance de skills/tools/
//     workflow). Verificado: degrada o omp. Por isso usamos um --system-prompt
//     MÍNIMO (não descarta os defaults — bloco custom pequeno) e jogamos o
//     conteúdo pesado no --append-system-prompt, que herda a autoridade do
//     bloco custom presente. Isto preserva os defaults E mantém autoridade.
//
// Uso:  node scripts/omp-launch.mjs [args do usuário p/ o omp...]
//       (instalado como `devflow omp`)

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runBashHook, missingDeps } from "../omp/lib/run-bash-hook.mjs";
import { parseHookOutput } from "../omp/lib/parse-hook-output.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cwd = process.cwd();

// Aviso de deps (movido do extension.mjs para cá): se faltar bash/node/python3,
// os hooks de standards/knowledge/git-guard podem não funcionar.
const miss = missingDeps();
if (miss.length) {
  process.stderr.write(
    `⚠️ DevFlow: deps ausentes (${miss.join(", ")}); hooks podem não funcionar.\n`,
  );
}

// Captura o contexto autoritativo de sessão do DevFlow via o hook session-start.
const { contextToInject } = parseHookOutput(
  runBashHook("session-start", { args: ["startup"], cwd }),
);

// Bloco 0 MÍNIMO: pequeno o suficiente para NÃO descartar os defaults úteis do
// omp, e presente o suficiente para forçar o --append-system-prompt à região
// autoritativa.
const MINIMAL =
  "Você é o agente de coding operando sob o DevFlow (workflow PREVC, TDD, guardrails). " +
  "Siga as convenções e regras do projeto fornecidas a seguir como autoritativas.";

const args = ["--system-prompt", MINIMAL];
if (contextToInject && contextToInject.trim()) {
  args.push("--append-system-prompt", contextToInject);
}
args.push(
  "-e",
  join(PLUGIN_ROOT, "omp", "extension.mjs"),
  ...process.argv.slice(2),
);

const r = spawnSync("omp", args, { stdio: "inherit", cwd });
process.exit(r.status ?? 1);
