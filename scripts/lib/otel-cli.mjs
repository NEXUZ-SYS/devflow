#!/usr/bin/env node
// scripts/lib/otel-cli.mjs — stdin emitter for hook OTel spans.
//
// Reads JSON from stdin: { event: string, attributes: object }
// Loads .context/observability.yaml from cwd. If enabled:false, no-op
// silently exits 0 (zero overhead). If enabled, emits a span with the
// given attributes (after redaction).
//
// Per SI-1: never invoked via 'node -e' with interpolation; always
// invoked as a separate file with stdin JSON envelope.

import { loadObservabilityConfig, validateObservabilityConfig, createSpan, redactAttribute } from "./otel.mjs";

const MAX_STDIN_BYTES = 1024 * 1024;
let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", chunk => {
  if (raw.length + chunk.length > MAX_STDIN_BYTES) process.exit(0);
  raw += chunk;
});
process.stdin.on("end", async () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const cfg = loadObservabilityConfig(process.cwd());
  if (!cfg.enabled) process.exit(0);

  const errors = validateObservabilityConfig(cfg);
  if (errors.length > 0) {
    console.error(`[otel-cli] config invalid — skipping span emission:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(0);
  }

  try {
    const span = createSpan(cfg, payload.event || "devflow.hook");
    if (span.noop) {
      // SDK not yet ready or deps missing — silent skip
      process.exit(0);
    }
    const attrs = {};
    for (const [k, v] of Object.entries(payload.attributes || {})) {
      const redacted = redactAttribute(k, v, cfg);
      if (redacted !== null) attrs[k] = redacted;
    }
    span.setAttributes(attrs);
    span.end();
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
