// scripts/lib/otel.mjs — opt-in OpenTelemetry GenAI telemetry.
//
// Per ADR-005: telemetry is gated by `enabled: true` in
// .context/observability.yaml. When disabled, this module is a no-op
// (zero overhead, no SDK loaded). When enabled, the OTel SDK is lazy-
// loaded once and spans emit gen_ai.* + devflow.* attributes.
//
// OTel deps (`@opentelemetry/sdk-trace-node`,
// `@opentelemetry/exporter-trace-otlp-http`) are the SINGLE exception
// to the no-deps policy — they only load when enabled.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";

const EMPTY_CONFIG = Object.freeze({
  spec: "devflow-observability/v0",
  enabled: false,
  exporter: { type: "otlp", endpoint: "", protocol: "http/protobuf" },
  semanticConventions: { genAi: true, devflow: true },
  sampling: { default: 1.0, errors: 1.0 },
  attributes: {
    capture: [],
    redact: ["gen_ai.prompt", "gen_ai.completion"],
  },
  contentCapture: {
    envVar: "OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT",
    redactPii: true,
  },
});

// ─── Config ────────────────────────────────────────────────────────────────

export function loadObservabilityConfig(projectRoot) {
  const path = join(projectRoot, ".context", "observability.yaml");
  if (!existsSync(path)) return { ...EMPTY_CONFIG };
  let parsed;
  try {
    const wrapped = `---\n${readFileSync(path, "utf-8")}\n---\n`;
    parsed = parseFrontmatter(wrapped).data || {};
  } catch (err) {
    console.error(`[otel] parse error: ${err.message}`);
    return { ...EMPTY_CONFIG };
  }
  return {
    spec: parsed.spec || EMPTY_CONFIG.spec,
    enabled: parsed.enabled === true,
    exporter: parsed.exporter || EMPTY_CONFIG.exporter,
    semanticConventions: parsed.semanticConventions || EMPTY_CONFIG.semanticConventions,
    sampling: parsed.sampling || EMPTY_CONFIG.sampling,
    attributes: parsed.attributes || EMPTY_CONFIG.attributes,
    contentCapture: parsed.contentCapture || EMPTY_CONFIG.contentCapture,
  };
}

export function validateObservabilityConfig(cfg) {
  const errors = [];
  if (cfg.spec && cfg.spec !== "devflow-observability/v0") {
    errors.push(`spec must be 'devflow-observability/v0', got '${cfg.spec}'`);
  }
  if (cfg.enabled === true) {
    if (!cfg.exporter?.endpoint || typeof cfg.exporter.endpoint !== "string") {
      errors.push(`enabled:true requires exporter.endpoint (string)`);
    }
  }
  return errors;
}

// ─── Span creation (no-op when disabled, lazy SDK when enabled) ────────────

let _sdkInitialized = false;
let _tracer = null;

async function ensureSdkInitialized(cfg) {
  if (_sdkInitialized) return _tracer;
  if (!cfg.enabled || !cfg.exporter?.endpoint) return null;

  // Lazy-load OTel deps. Wrapped in try/catch so missing deps degrade
  // gracefully to no-op (operator sees stderr warning).
  try {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
    const { trace } = await import("@opentelemetry/api");

    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({ url: cfg.exporter.endpoint }),
    });
    sdk.start();
    _tracer = trace.getTracer("devflow", "1.0.0");
    _sdkInitialized = true;
    return _tracer;
  } catch (err) {
    console.error(
      `[otel] SDK lazy-load failed (deps not installed?): ${err.message}\n` +
      `       Install: npm install @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/api\n` +
      `       Or set observability.enabled=false to disable telemetry.`
    );
    return null;
  }
}

// Returns a span object. When disabled OR deps missing, returns a no-op
// stub with `noop: true` marker. The same interface (setAttributes,
// setStatus, end) works in both cases — callers don't need to branch.
export function createSpan(cfg, name, parentContext = null) {
  if (!cfg.enabled) {
    return {
      noop: true,
      setAttributes: () => {},
      setAttribute: () => {},
      setStatus: () => {},
      addEvent: () => {},
      end: () => {},
    };
  }
  // Lazy-load is async but createSpan is sync — kick off init in background
  // and return a queueing wrapper that flushes when ready. Simpler approach
  // for v1.0: defer real span emission to async wrapper functions; for now,
  // return same no-op stub if SDK isn't ready yet (operator sees warning).
  if (!_sdkInitialized) {
    ensureSdkInitialized(cfg).catch(() => {});  // fire-and-forget init
    return {
      noop: true,
      setAttributes: () => {},
      setAttribute: () => {},
      setStatus: () => {},
      addEvent: () => {},
      end: () => {},
    };
  }
  if (!_tracer) {
    return { noop: true, setAttributes: () => {}, setAttribute: () => {}, setStatus: () => {}, addEvent: () => {}, end: () => {} };
  }
  const span = _tracer.startSpan(name, { kind: 1 });  // SpanKind.INTERNAL
  return {
    noop: false,
    setAttributes: (attrs) => span.setAttributes(attrs),
    setAttribute: (k, v) => span.setAttribute(k, v),
    setStatus: (s) => span.setStatus(s),
    addEvent: (n, a) => span.addEvent(n, a),
    end: () => span.end(),
  };
}

// ─── Attribute redaction ───────────────────────────────────────────────────

const PII_PATTERNS = [
  { re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: "[REDACTED-EMAIL]" },
  { re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: "[REDACTED-IP]" },
  // Long digit sequences (likely phone, SSN, credit card)
  { re: /\b\d{9,}\b/g, replacement: "[REDACTED-NUM]" },
];

function scrubPii(value) {
  if (typeof value !== "string") return value;
  let out = value;
  for (const { re, replacement } of PII_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

export function redactAttribute(name, value, cfg) {
  const redactList = cfg.attributes?.redact || [];
  if (redactList.includes(name)) return null;  // drop entirely

  if (cfg.contentCapture?.redactPii) {
    return scrubPii(value);
  }
  return value;
}

// ─── Content capture gating ────────────────────────────────────────────────

export function isContentCaptureEnabled(cfg) {
  const envVar = cfg.contentCapture?.envVar || "OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT";
  return process.env[envVar] === "1" || process.env[envVar] === "true";
}
