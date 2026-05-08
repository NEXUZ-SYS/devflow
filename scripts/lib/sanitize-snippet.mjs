// scripts/lib/sanitize-snippet.mjs — SI-6 prompt-injection stripper for scraped docs.
//
// Used by skills/scrape-stack-batch pipeline.mjs (Task 2.3.D) BEFORE consolidating
// fetched snippets into .context/stacks/refs/<lib>@<version>.md. Strips known
// injection patterns and wraps the output in a fenced delimiter using the file
// hash as a per-file canary.
//
// The prompt template that injects <STACK_FOR_TASK> can verify the canary to
// detect tampering between scrape time and runtime injection.

const ROLE_MARKER_RE = /^\s*(SYSTEM|ASSISTANT|USER|HUMAN)\s*:\s*/i;
const IGNORE_INSTRUCTIONS_RE = /ignore (the )?(previous|above|all) (instructions|context|rules)/i;

export function sanitizeSnippet(input, hash) {
  if (typeof input !== "string") input = "";
  if (typeof hash !== "string" || hash.length === 0) {
    throw new Error("sanitizeSnippet: hash argument is required (canary)");
  }

  let hits = 0;
  const cleanedLines = [];
  const lines = input.split(/\r?\n/);

  for (const line of lines) {
    if (ROLE_MARKER_RE.test(line)) {
      hits++;
      continue;  // drop the line
    }
    if (IGNORE_INSTRUCTIONS_RE.test(line)) {
      hits++;
      continue;
    }
    cleanedLines.push(line);
  }

  const cleaned = cleanedLines.join("\n");
  const text =
    `<<<DEVFLOW_STACK_REF_START_${hash}>>>\n` +
    cleaned +
    (cleaned.endsWith("\n") ? "" : "\n") +
    `<<<DEVFLOW_STACK_REF_END>>>\n`;

  return { text, hits };
}
