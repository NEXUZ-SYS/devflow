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
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { parseArgs } from "node:util";

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

function readStories() {
  if (!existsSync(STORIES_PATH)) {
    console.error(`stories.yaml not found at ${STORIES_PATH}`);
    process.exit(1);
  }
  const content = readFileSync(STORIES_PATH, "utf-8");

  if (statSync(STORIES_PATH).size > 0 && !content.includes("stories:")) {
    console.error(`Malformed stories.yaml: missing 'stories:' key`);
    process.exit(1);
  }

  // Read escalation config
  const maxRetriesMatch = content.match(/max_retries_per_story:\s*(\d+)/);
  const maxRetries = maxRetriesMatch ? parseInt(maxRetriesMatch[1], 10) : 2;

  // Simple YAML parser for stories (inline arrays only, no multi-line)
  const stories = [];
  let current = null;
  for (const line of content.split("\n")) {
    // Match story entry — strip quotes from ID
    const storyMatch = line.match(/^\s+-\s+id:\s*["']?([^"'\s]+)["']?/);
    if (storyMatch) {
      if (current) stories.push(current);
      current = { id: storyMatch[1] };
      continue;
    }
    if (current) {
      const fieldMatch = line.match(/^\s{4,}(\w+):\s*(.+)/);
      if (fieldMatch) {
        let val = fieldMatch[2].trim().replace(/^["']|["']$/g, "");
        current[fieldMatch[1]] = val;
      }
    }
  }
  if (current) stories.push(current);

  if (stories.length === 0 && content.length > 100) {
    console.warn("Warning: stories.yaml appears non-empty but no stories were parsed");
  }

  return { stories, maxRetries };
}

function getNextStory(stories, maxRetries) {
  const byPriority = (a, b) =>
    parseInt(a.priority, 10) - parseInt(b.priority, 10);

  function isUnblocked(s) {
    const blockers = (s.blocked_by || "")
      .replace(/[\[\]]/g, "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    return blockers.every((bid) => {
      const blocker = stories.find((bs) => bs.id === bid);
      return blocker && blocker.status === "completed";
    });
  }

  // 1. Recover stories stuck in_progress (session died)
  const stuck = stories.filter((s) => s.status === "in_progress");
  if (stuck.length > 0) return stuck.sort(byPriority)[0];

  // 2. Retry failed stories (within retry limit from config)
  const retryable = stories.filter(
    (s) =>
      s.status === "failed" && parseInt(s.attempts || "0", 10) < maxRetries
  );
  if (retryable.length > 0) return retryable.sort(byPriority)[0];

  // 3. Pick next pending story with resolved dependencies
  const pending = stories.filter(
    (s) => s.status === "pending" && isUnblocked(s)
  );
  if (pending.length > 0) return pending.sort(byPriority)[0];

  return null;
}

function buildPrompt(story) {
  return [
    `You are resuming an autonomous DevFlow workflow.`,
    `Current story: ${story.id} — ${story.title}`,
    story.description ? `Description: ${story.description}` : "",
    `Agent: ${story.agent || "feature-developer"}`,
    ``,
    `Instructions:`,
    `1. Invoke the devflow:autonomous-loop skill to continue processing stories`,
    `2. The skill will read stories.yaml and pick up from where it left off`,
    `3. Process stories until complete, escalated, or max iterations reached`,
  ]
    .filter(Boolean)
    .join("\n");
}

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
    const { stories, maxRetries } = readStories();
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
    const { stories: updated } = readStories();
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
  const { stories: final } = readStories();
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
