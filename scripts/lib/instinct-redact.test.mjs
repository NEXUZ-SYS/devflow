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

test('redige credencial em env-var UPPER_SNAKE com _ antes da keyword (sec F1)', () => {
  assert.match(redact('CLIENT_SECRET=oauthsecretvalue'), /CLIENT_SECRET=\[REDACTED\]/);
  assert.doesNotMatch(redact('CLIENT_SECRET=oauthsecretvalue'), /oauthsecretvalue/);
  assert.doesNotMatch(redact('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIK7MDENGbPxRfiCYEXKEYY'), /wJalrXUtnFEMI/);
  assert.doesNotMatch(redact('OPENAI_API_KEY=sk-rawkey9876543210abcd'), /sk-rawkey|9876543210/);
  assert.doesNotMatch(redact('GITHUB_TOKEN=ghp_abcdEFGH1234567890'), /ghp_/);
  assert.match(redact('mysql --password=hunter2'), /password=\[REDACTED\]/i); // não regride Task 1
});

test('redige AWS secret em var-name sem keyword padrão: ACCESS_KEY=/AWS_ACCESS= (sec F2-residual)', () => {
  const sec = 'wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEYZ'; // 39c base64-ish
  assert.doesNotMatch(redact('ACCESS_KEY=' + sec), /wJalr/, 'ACCESS_KEY=');
  assert.doesNotMatch(redact('AWS_ACCESS=' + sec), /wJalr/, 'AWS_ACCESS=');
  assert.doesNotMatch(redact('aws_secret_access_key: ' + sec), /wJalr/, 'forma snake completa');
  // não regride: path com run longo de [A-Za-z0-9/] NÃO é over-redigido (N4)
  assert.match(redact('/home/u/Documentos/code/devflow/scripts/lib/instinct-redact'), /scripts\/lib\/instinct-redact/);
});

test('redige classes de token adicionais: sk-/xapp-/npm_/AIza/glpat- (sec F2)', () => {
  const cases = [
    'sk-abc123def456ghi789jkl',                  // OpenAI legacy
    'xapp-1-A0B1C2D3E4F5G6H7',                    // Slack app-level
    'npm_abcdefghijklmnopqrstuvwxyz0123456789',  // npm
    'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7',  // Google API
    'glpat-abcdefghij1234567890',                // GitLab PAT
  ];
  for (const c of cases) assert.match(redact('x ' + c), /\[TOKEN\]/, `deveria redigir: ${c}`);
});

test('redação é best-effort: NÃO cobre PII com separadores (caveat ADR-005)', () => {
  // documenta o limite — cartão/CPF formatados passam (best-effort, não PCI/PHI-grade)
  assert.equal(redact('cpf 123.456.789-09'), 'cpf 123.456.789-09');
});

test('preserva SHA git e paths (allowlist N4)', () => {
  assert.match(redact('commit 06a530a feat'), /06a530a/);
  assert.match(redact('path src/lib/foo.mjs'), /src\/lib\/foo\.mjs/);
});
