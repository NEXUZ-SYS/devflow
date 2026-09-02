#!/usr/bin/env node
// scripts/routines.mjs — CLI for the DevFlow routines scheduler.
// State-only: lists/snoozes/enables/records runs. It does NOT execute prompts
// (running commands/skills/agents is the LLM skill's job) — this CLI just
// manages the schedule file. `--today YYYY-MM-DD` overrides the date (tests).
import { homedir } from "node:os";
import {
  loadRoutines, dueRoutines, shouldSuggest, shouldRun, classify, resolveCheckIds,
  snooze, setEnabled, markRun, markSuggested, isFirstContact,
} from "./lib/routines.mjs";

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

function todayOf(args) {
  return arg(args, "--today") || process.env.DEVFLOW_TODAY || new Date().toISOString().slice(0, 10);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const cwd = process.cwd();
  const json = args.includes("--json");
  const today = todayOf(args);

  if (cmd === "due") {
    // "due to surface now" → respects snooze + 1x/day (what SessionStart wants).
    const { routines } = loadRoutines(cwd);
    const due = routines.filter(r => shouldSuggest(r, today));
    if (args.includes("--ids")) { console.log(due.map(r => r.id).join("\n")); return process.exit(0); }
    if (json) { console.log(JSON.stringify({ due })); return process.exit(0); }
    if (!due.length) { console.log("Nenhuma routine vencida."); return process.exit(0); }
    for (const r of due) console.log(`• ${r.id} — ${r.description || ""}`);
    return process.exit(0);
  }

  if (cmd === "list") {
    const { routines } = loadRoutines(cwd);
    const dueIds = new Set(dueRoutines(routines, today).map(r => r.id));
    const enriched = routines.map(r => ({ ...r, due: dueIds.has(r.id) }));
    if (json) { console.log(JSON.stringify({ routines: enriched })); return process.exit(0); }
    if (!enriched.length) { console.log("Nenhuma routine configurada."); return process.exit(0); }
    for (const r of enriched) {
      const state = r.enabled === false ? "off" : r.due ? "VENCIDA" : `próxima: ${r.nextRun || "—"}`;
      console.log(`• ${r.id} [${state}] — ${r.description || ""}`);
    }
    return process.exit(0);
  }

  if (cmd === "snooze") {
    const id = args[1], days = args[2];
    if (!id || !days) { console.error("uso: snooze <id> <dias>"); return process.exit(2); }
    process.exit(snooze(cwd, id, days, today) ? 0 : 1);
  }

  if (cmd === "enable" || cmd === "disable") {
    const id = args[1];
    if (!id) { console.error(`uso: ${cmd} <id>`); return process.exit(2); }
    process.exit(setEnabled(cwd, id, cmd === "enable") ? 0 : 1);
  }

  if (cmd === "mark-run") {
    const id = args[1];
    if (!id) { console.error("uso: mark-run <id>"); return process.exit(2); }
    process.exit(markRun(cwd, id, today) ? 0 : 1);
  }

  if (cmd === "mark-suggested") {
    const id = args[1];
    if (!id) { console.error("uso: mark-suggested <id>"); return process.exit(2); }
    process.exit(markSuggested(cwd, id, today) ? 0 : 1);
  }

  if (cmd === "run-checks") {
    // shouldRun, NÃO shouldSuggest: a guarda de 1x/dia vale para surfacing.
    // O bloco de routines roda antes no mesmo hook e chama mark-suggested; com
    // shouldSuggest este executor receberia lista vazia e nunca rodaria.
    const { routines } = loadRoutines(cwd);
    const firstContact = isFirstContact(cwd);
    const eligiveis = routines.filter(r => shouldRun(r, today));

    const ids = [];
    const ran = [];
    for (const r of eligiveis.filter(r => classify(r) === "auto")) {
      const stepIds = (r.prompts || [])
        .filter(p => p?.type === "check")
        .flatMap(p => resolveCheckIds(p.value));
      if (stepIds.length) { ran.push(r.id); ids.push(...stepIds); }
    }

    // Rotinas `confirm` são PROPOSTAS, nunca executadas — e não recebem
    // markRun: nada rodou, e marcar adiaria a próxima proposta.
    const proposed = eligiveis
      .filter(r => classify(r) === "confirm")
      .map(r => ({ id: r.id, commands: (r.prompts || []).map(p => p?.value).filter(Boolean) }));

    let results = [];
    if (ids.length) {
      const { runChecks } = await import("./lib/doctor.mjs");
      const { which } = await import("./lib/which.mjs");
      const ctx = {
        cwd, home: homedir(), today, which,
        // Nenhum check deste conjunto faz exec — rodar processo violaria o
        // orçamento do checkup. O stub existe só para satisfazer a forma do
        // ctx compartilhada com os nove checks originais; `which` NÃO pode ser
        // stub, porque mempalace-env o usa e um false constante daria FAIL
        // falso numa máquina com o binário instalado.
        exec: () => ({ status: 1, stdout: "", stderr: "" }),
      };
      results = await runChecks(ctx, [...new Set(ids)]);
    }
    for (const id of ran) markRun(cwd, id, today);
    console.log(JSON.stringify({ firstContact, ran, proposed, results }));
    return process.exit(0);
  }

  console.error("uso: routines.mjs <due|list|snooze|enable|disable|mark-run|mark-suggested|run-checks> [args] [--json] [--today YYYY-MM-DD]");
  process.exit(2);
}

main();
