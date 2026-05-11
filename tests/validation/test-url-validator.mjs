#!/usr/bin/env node
// tests/validation/test-url-validator.mjs
// Unit tests for scripts/lib/url-validator.mjs — SI-3 URL allowlist (SSRF defense).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUrl } from "../../scripts/lib/url-validator.mjs";

test("validateUrl: allows https public", async () => {
  await assert.doesNotReject(validateUrl("https://example.com/docs"));
});

test("validateUrl: rejects http (non-localhost)", async () => {
  await assert.rejects(validateUrl("http://example.com"), /scheme/i);
});

test("validateUrl: rejects file://", async () => {
  await assert.rejects(validateUrl("file:///etc/passwd"), /scheme/i);
});

test("validateUrl: rejects gopher://", async () => {
  await assert.rejects(validateUrl("gopher://example.com/"), /scheme/i);
});

test("validateUrl: rejects AWS metadata IP", async () => {
  await assert.rejects(
    validateUrl("https://169.254.169.254/latest/meta-data/"),
    /metadata|denied|private/i
  );
});

test("validateUrl: rejects RFC1918 (10/8)", async () => {
  await assert.rejects(validateUrl("https://10.0.0.1/admin"), /private|denied/i);
});

test("validateUrl: rejects RFC1918 (192.168/16)", async () => {
  await assert.rejects(validateUrl("https://192.168.1.1/"), /private|denied/i);
});

test("validateUrl: rejects RFC1918 (172.16-31)", async () => {
  await assert.rejects(validateUrl("https://172.16.0.1/"), /private|denied/i);
});

test("validateUrl: rejects 127.0.0.0/8 loopback", async () => {
  await assert.rejects(validateUrl("https://127.0.0.1/"), /private|denied|loopback/i);
});

test("validateUrl: rejects localhost without DEVFLOW_DEV", async () => {
  delete process.env.DEVFLOW_DEV;
  await assert.rejects(validateUrl("http://localhost:8080/"), /denied|scheme/i);
});

test("validateUrl: allows http://localhost when DEVFLOW_DEV=1", async () => {
  process.env.DEVFLOW_DEV = "1";
  await assert.doesNotReject(validateUrl("http://localhost:8080/"));
  delete process.env.DEVFLOW_DEV;
});

test("validateUrl: rejects malformed URLs", async () => {
  await assert.rejects(validateUrl("not-a-url"), /invalid|parse/i);
  await assert.rejects(validateUrl(""), /invalid|empty/i);
});
