import { test } from "node:test";
import assert from "node:assert/strict";
import { detectRuntime } from "../../omp/lib/detect-runtime.mjs";

test("omp via OMP_*", () => assert.equal(detectRuntime({ OMP_SESSION_ID: "x" }), "omp"));
test("omp via PI_*", () => assert.equal(detectRuntime({ PI_AGENT: "1" }), "omp"));
test("claude via CLAUDECODE", () => assert.equal(detectRuntime({ CLAUDECODE: "1" }), "claude"));
test("default conservador = claude", () => assert.equal(detectRuntime({}), "claude"));
