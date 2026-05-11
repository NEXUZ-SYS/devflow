// scripts/lib/repro-token.mjs — reproducibility token for OTel spans.
//
// Per ADR-005: token = sha256(model + canonicalJSON(params) + lockHash +
// toolDefinitionsHash). Deterministic, one-way (no PII leaks), allows
// replay of past LLM turns by resolving the same context layer state.
//
// Used by:
//   - hooks/session-start (Task 4.3) — root span attribute
//   - hooks/pre-tool-use (Task 4.3) — per-tool span attribute
//   - scripts/devflow-context.mjs replay (X.5.h, future)
//
// Pure node:* — uses node:crypto only.

import { createHash } from "node:crypto";

// Canonical JSON: keys sorted recursively. Ensures hash stability across
// different object construction orders.
function canonicalize(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  const sorted = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = canonicalize(obj[k]);
  }
  return sorted;
}

function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

export function computeReproToken({ model = "", params = {}, lockHash = "", toolDefinitionsHash = "" } = {}) {
  const payload = JSON.stringify({
    model: String(model),
    params: canonicalize(params),
    lockHash: String(lockHash),
    toolDefinitionsHash: String(toolDefinitionsHash),
  });
  return sha256Hex(payload);
}

export function hashToolDefinitions(tools) {
  if (!Array.isArray(tools)) return sha256Hex("[]");
  // Sort by name (or full canonical JSON when name absent — LOW fix from
  // Semana 4 audit: prevents collision when multiple anonymous tools exist).
  const sorted = [...tools]
    .filter(t => t && typeof t === "object")
    .map(canonicalize)
    .sort((a, b) => {
      const ka = a.name ? String(a.name) : JSON.stringify(a);
      const kb = b.name ? String(b.name) : JSON.stringify(b);
      return ka.localeCompare(kb);
    });
  return sha256Hex(JSON.stringify(sorted));
}
