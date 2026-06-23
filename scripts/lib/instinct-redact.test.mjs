// scripts/lib/instinct-redact.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from './instinct-redact.mjs';

test('redige email, IPv4 e sequências longas', () => {
  assert.equal(redact('mail joe@acme.com'), 'mail [EMAIL]');
  assert.equal(redact('host 192.168.0.42'), 'host [IP]');
  assert.equal(redact('id 1234567890'), 'id [NUM]');
});

test('nunca vaza credenciais — uma classe por asserção (sec C1)', () => {
  const cases = [
    'AKIAIOSFODNN7EXAMPLE',                                  // AWS access key
    'token ghp_abcdEFGH1234567890abcdEFGH1234567890',        // GitHub classic
    'gho_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345',                  // GitHub oauth
    'github_pat_11ABCDE_abcdefghijklmnop',                   // GitHub fine-grained
    'key sk-ant-api03-XYZ123456',                            // Anthropic
    'stripe sk_live_abcd1234efgh5678',                       // Stripe secret
    'Authorization: Bearer eyJhbGci.eyJzdWIi.SflKxwRJ',      // JWT
  ];
  for (const c of cases) {
    const out = redact(c);
    assert.match(out, /\[TOKEN\]/, `deveria redigir: ${c}`);
  }
  assert.doesNotMatch(redact('token ghp_abcdEFGH1234567890'), /ghp_/);
});

test('redige par chave=valor e credencial em URL (sec C1)', () => {
  assert.match(redact('mysql --password=hunter2'), /password=\[REDACTED\]/i);
  assert.match(redact('export PGPASSWORD=s3cr3t'), /PGPASSWORD=\[REDACTED\]/i);
  assert.match(redact('postgres://user:senha@host/db'), /:\/\/\[REDACTED\]@/);
  assert.doesNotMatch(redact('postgres://user:senha@host/db'), /senha/);
});

test('redação é best-effort: NÃO cobre PII com separadores (caveat ADR-005)', () => {
  // documenta o limite — cartão/CPF formatados passam (best-effort, não PCI/PHI-grade)
  assert.equal(redact('cpf 123.456.789-09'), 'cpf 123.456.789-09');
});

test('preserva SHA git e paths (allowlist N4)', () => {
  assert.match(redact('commit 06a530a feat'), /06a530a/);
  assert.match(redact('path src/lib/foo.mjs'), /src\/lib\/foo\.mjs/);
});
