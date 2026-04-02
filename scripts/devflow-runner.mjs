#!/usr/bin/env node

/**
 * DevFlow Autonomous Runner — Safety net for long-running autonomous workflows.
 *
 * Reads .context/workflow/stories.yaml and spawns Claude Code sessions
 * to process stories. Re-spawns if a session dies mid-story.
 *
 * Usage:
 *   node scripts/devflow-runner.mjs [options]
 *
 * Options:
 *   --stories <path>      Path to stories.yaml (default: .context/workflow/stories.yaml)
 *   --max-iterations <n>  Max iterations before stopping (default: 20)
 *   --timeout <ms>        Timeout per story in ms (default: 300000 = 5 min)
 *   --dry-run             Show what would be executed without running
 */

import { execFile } from "node:child_process";
import { resolve as resolvePath } from "node:path";
import { parseArgs } from "node:util";
import { readStories, getNextStory, buildPrompt } from "./runner-lib.mjs";

const { values: args } = parseArgs({
  options: {
    stories: { type: "string", default: ".context/workflow/stories.yaml" },
    "max-iterations": { type: "string", default: "20" },
    timeout: { type: "string", default: "300000" },
    "dry-run": { type: "boolean", default: false },
  },
});

const STORIES_PATH = resolvePath(args.stories);
const MAX_ITERATIONS = parseInt(args["max-iterations"], 10) || 20;
const TIMEOUT_MS = parseInt(args.timeout, 10) || 300000;
const DRY_RUN = args["dry-run"];

function spawnClaude(prompt) {
  return new Promise((res, reject) => {
    const child = execFile(
      "claude",
      ["-p", prompt, "--max-turns", "50"],
      { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          if (error.code === "ENOENT") {
            console.error("Error: 'claude' CLI not found on PATH. Install Claude Code first.");
            process.exit(1);
          }
          if (error.killed) {
            reject(new Error(`Claude session timed out after ${TIMEOUT_MS}ms`));
          } else {
            reject(error);
          }
          return;
        }
        res(stdout);
      }
    );
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  });
}

async function main() {
  console.log("DevFlow Autonomous Runner");
  console.log(`Stories: ${STORIES_PATH}`);
  console.log(`Max iterations: ${MAX_ITERATIONS}`);
  console.log(`Timeout per story: ${TIMEOUT_MS}ms`);
  console.log("---");

  let lastStoryId = null;
  let staleCount = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { stories, maxRetries } = readStories(STORIES_PATH);
    const next = getNextStory(stories, maxRetries);

    if (!next) {
      const completed = stories.filter((s) => s.status === "completed").length;
      const total = stories.length;
      console.log(`\nAll processable stories done. ${completed}/${total} completed.`);
      break;
    }

    console.log(
      `\n[Iteration ${i + 1}/${MAX_ITERATIONS}] Story ${next.id}: ${next.title}`
    );

    if (DRY_RUN) {
      console.log("(dry-run) Would spawn Claude Code with prompt:");
      console.log(buildPrompt(next));
      continue;
    }

    try {
      await spawnClaude(buildPrompt(next));
    } catch (err) {
      console.error(`Session failed: ${err.message}`);
      console.log("Will retry on next iteration...");
    }

    // Re-read stories to check if progress was made
    const { stories: updated } = readStories(STORIES_PATH);
    const completedCount = updated.filter(
      (s) => s.status === "completed"
    ).length;
    const totalCount = updated.length;
    console.log(`Progress: ${completedCount}/${totalCount} stories completed`);

    // Stall detection: same story selected N times with no progress
    if (next.id === lastStoryId) {
      staleCount++;
      if (staleCount >= 3) {
        console.error(`Stall detected: story ${next.id} selected 3 times with no progress. Exiting.`);
        break;
      }
    } else {
      lastStoryId = next.id;
      staleCount = 0;
    }
  }

  // Final report
  const { stories: final } = readStories(STORIES_PATH);
  console.log("\n━━━ Final Report ━━━");
  for (const s of final) {
    const icon =
      s.status === "completed" ? "✓" : s.status === "escalated" ? "✗" : "⬚";
    console.log(`${icon} ${s.id} — ${s.title} (${s.status})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
