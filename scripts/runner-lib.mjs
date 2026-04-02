/**
 * DevFlow Autonomous Runner — Core library.
 * Extracted from devflow-runner.mjs for testability.
 */

import { readFileSync, existsSync, statSync } from "node:fs";

/**
 * Parse stories.yaml content into structured data.
 * @param {string} content - Raw YAML content
 * @returns {{ stories: Array, maxRetries: number }}
 */
export function parseStoriesContent(content) {
  if (!content || (content.length > 0 && !content.includes("stories:"))) {
    throw new Error("Malformed stories.yaml: missing 'stories:' key");
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

  return { stories, maxRetries };
}

/**
 * Read and parse stories.yaml from disk.
 * @param {string} storiesPath - Absolute path to stories.yaml
 * @returns {{ stories: Array, maxRetries: number }}
 */
export function readStories(storiesPath) {
  if (!existsSync(storiesPath)) {
    throw new Error(`stories.yaml not found at ${storiesPath}`);
  }
  const content = readFileSync(storiesPath, "utf-8");

  if (statSync(storiesPath).size > 0 && !content.includes("stories:")) {
    throw new Error("Malformed stories.yaml: missing 'stories:' key");
  }

  return parseStoriesContent(content);
}

/**
 * Select the next story to execute.
 * Priority: in_progress (stuck) > failed (retryable) > pending (unblocked)
 * @param {Array} stories
 * @param {number} maxRetries
 * @returns {object|null}
 */
export function getNextStory(stories, maxRetries) {
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

/**
 * Build the prompt for a Claude Code session.
 * @param {object} story
 * @returns {string}
 */
export function buildPrompt(story) {
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
