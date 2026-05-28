#!/usr/bin/env node
// scripts/routines.mjs — CLI for the DevFlow routines scheduler.
// State-only: lists/snoozes/enables/records runs. It does NOT execute prompts
// (running commands/skills/agents is the LLM skill's job) — this CLI just
// manages the schedule file. `--today YYYY-MM-DD` overrides the date (tests).
import {
  loadRoutines, dueRoutines, shouldSuggest, snooze, setEnabled, markRun, markSuggested,
} from "./lib/routines.mjs";

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

function todayOf(args) {
  return arg(args, "--today") || process.env.DEVFLOW_TODAY || new Date().toISOString().slice(0, 10);
}

function main() {
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

  console.error("uso: routines.mjs <due|list|snooze|enable|disable|mark-run|mark-suggested> [args] [--json] [--today YYYY-MM-DD]");
  process.exit(2);
}

main();
