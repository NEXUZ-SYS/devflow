#!/usr/bin/env node
// scripts/lib/edit-nudge-cli.mjs — CLI wrapper for buildNudge.
// Used by hooks/post-tool-use to enrich Read/Edit/Write events with a
// reminder of applicable standards + derived stack refs. Stdin: JSON
// {"tool":"Read|Edit|Write","path":"src/foo.ts"}. Stdout: textual nudge
// (empty if no std applies or already cached) — appended to additionalContext.
//
// Usage:
//   echo '{"tool":"Read","path":"src/foo.ts"}' \
//     | node scripts/lib/edit-nudge-cli.mjs [--project=<path>] [--record]
//
// Flags:
//   --record      Persists matched std-ids to .context/cache/session-injected.json
//   --project=    Project root (defaults to cwd)
//   --max-chars=  Espaço que sobra no campo additionalContext para este texto (o hook desconta
//                 o que mais põe lá). Sem a flag, o teto é o do campo (9000). Valor que não é
//                 número vale 0: nada sai.

import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { buildNudge, recordInjection, renderNudgeText, clearCache } from "./edit-nudge.mjs";

function parseArgs(argv) {
  const opts = { project: null, record: false, clear: false, maxChars: undefined };
  for (const a of argv) {
    if (a === "--record") opts.record = true;
    else if (a === "--clear") opts.clear = true;
    else if (a.startsWith("--project=")) opts.project = a.slice("--project=".length);
    else if (a.startsWith("--max-chars=")) {
      const n = Number(a.slice("--max-chars=".length));
      opts.maxChars = Number.isFinite(n) ? n : 0;
    }
  }
  return opts;
}

function readStdinSync() {
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const projectRoot = opts.project ? resolve(opts.project) : process.cwd();

  if (opts.clear) {
    clearCache(projectRoot);
    process.exit(0);
  }

  const raw = readStdinSync();
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    // Malformed input — silent (don't break the hook)
    process.exit(0);
  }
  if (!event || typeof event !== "object") process.exit(0);

  const nudge = buildNudge({
    tool: event.tool,
    path: event.path,
    projectRoot,
  });
  if (!nudge) process.exit(0);

  const text = renderNudgeText(nudge, opts.maxChars === undefined ? undefined : { maxChars: opts.maxChars });
  // Sem espaço no campo: nada sai e nada é marcado como entregue (volta na próxima edição).
  if (!text) process.exit(0);

  if (opts.record) {
    for (const id of nudge.matchedStandards) {
      recordInjection(projectRoot, id);
    }
  }

  process.stdout.write(text);
  process.stdout.write("\n");
  process.exit(0);
}

main();
