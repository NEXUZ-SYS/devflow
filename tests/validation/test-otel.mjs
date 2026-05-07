#!/usr/bin/env node
// tests/validation/test-otel.mjs
// Unit tests for scripts/lib/otel.mjs — opt-in OTel GenAI telemetry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  loadObservabilityConfig,
  validateObservabilityConfig,
  createSpan,
  redactAttribute,
  isContentCaptureEnabled,
} from "../../scripts/lib/otel.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "otel-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const DISABLED_YAML = `spec: devflow-observability/v0
enabled: false
`;

const ENABLED_YAML = `spec: devflow-observability/v0
enabled: true
exporter:
  type: otlp
  endpoint: "http://localhost:4318"
  protocol: http/protobuf
sampling:
  default: 1.0
attributes:
  capture:
    - gen_ai.request.model
    - gen_ai.usage.input_tokens
    - devflow.repro.token
  redact:
    - gen_ai.prompt
    - gen_ai.completion
contentCapture:
  envVar: OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT
  redactPii: true
`;

// ─── Config loading ────────────────────────────────────────────────────────

test("loadObservabilityConfig: returns disabled stub when no file", () => {
  const { root, cleanup } = fixture();
  const cfg = loadObservabilityConfig(root);
  assert.equal(cfg.enabled, false);
  cleanup();
});

test("loadObservabilityConfig: parses enabled config", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context"), { recursive: true });
  writeFileSync(join(root, ".context", "observability.yaml"), ENABLED_YAML);
  const cfg = loadObservabilityConfig(root);
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.exporter.endpoint, "http://localhost:4318");
  assert.equal(cfg.contentCapture.redactPii, true);
  cleanup();
});

// ─── Schema validation ─────────────────────────────────────────────────────

test("validateObservabilityConfig: rejects enabled:true without endpoint", () => {
  const errors = validateObservabilityConfig({
    spec: "devflow-observability/v0",
    enabled: true,
    exporter: { type: "otlp" },
  });
  assert.ok(errors.length > 0);
  assert.match(errors.join("\n"), /endpoint/i);
});

test("validateObservabilityConfig: accepts enabled:true with valid endpoint", () => {
  const errors = validateObservabilityConfig({
    spec: "devflow-observability/v0",
    enabled: true,
    exporter: { type: "otlp", endpoint: "http://localhost:4318" },
  });
  assert.deepEqual(errors, []);
});

test("validateObservabilityConfig: accepts enabled:false (no endpoint required)", () => {
  const errors = validateObservabilityConfig({
    spec: "devflow-observability/v0",
    enabled: false,
  });
  assert.deepEqual(errors, []);
});

// ─── Span creation ─────────────────────────────────────────────────────────

test("createSpan: returns no-op span when enabled:false", () => {
  const cfg = { enabled: false };
  const span = createSpan(cfg, "test-span");
  // No-op span has no-op methods; setAttributes/end should not throw
  assert.doesNotThrow(() => {
    span.setAttributes({ "test.key": "value" });
    span.setStatus({ code: 1 });
    span.end();
  });
  // No-op span has noop=true marker
  assert.equal(span.noop, true);
});

// ─── Attribute redaction ───────────────────────────────────────────────────

test("redactAttribute: drops attribute name in redact list", () => {
  const cfg = {
    attributes: { redact: ["gen_ai.prompt", "gen_ai.completion"] },
    contentCapture: { redactPii: true },
  };
  assert.equal(redactAttribute("gen_ai.prompt", "secret prompt", cfg), null);
  assert.equal(redactAttribute("gen_ai.completion", "secret reply", cfg), null);
});

test("redactAttribute: passes through non-redacted attributes", () => {
  const cfg = {
    attributes: { redact: ["gen_ai.prompt"] },
    contentCapture: { redactPii: true },
  };
  assert.equal(redactAttribute("gen_ai.request.model", "claude-opus-4.7", cfg), "claude-opus-4.7");
});

test("redactAttribute: scrubs PII from values when redactPii:true", () => {
  const cfg = {
    attributes: { redact: [] },
    contentCapture: { redactPii: true },
  };
  // Email
  const r1 = redactAttribute("custom.text", "Contact me at user@example.com", cfg);
  assert.match(r1, /\[REDACTED-EMAIL\]/);
  assert.doesNotMatch(r1, /user@example\.com/);
  // IPv4
  const r2 = redactAttribute("custom.text", "Server at 192.168.1.42 down", cfg);
  assert.match(r2, /\[REDACTED-IP\]/);
});

test("redactAttribute: leaves PII when redactPii:false", () => {
  const cfg = {
    attributes: { redact: [] },
    contentCapture: { redactPii: false },
  };
  const r = redactAttribute("custom.text", "user@example.com", cfg);
  assert.equal(r, "user@example.com");
});

// ─── Content capture gating ────────────────────────────────────────────────

test("isContentCaptureEnabled: false when env var unset", () => {
  delete process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
  const cfg = {
    contentCapture: { envVar: "OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT" },
  };
  assert.equal(isContentCaptureEnabled(cfg), false);
});

test("isContentCaptureEnabled: true when env var=1", () => {
  process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = "1";
  const cfg = {
    contentCapture: { envVar: "OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT" },
  };
  assert.equal(isContentCaptureEnabled(cfg), true);
  delete process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
});
