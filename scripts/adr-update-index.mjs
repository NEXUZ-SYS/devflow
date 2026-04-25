#!/usr/bin/env node
// adr-update-index — regenerates .context/docs/adrs/README.md with 14-column schema.
// Subcommands: --next-number | --resolve=<query> | (default: regenerate)
// Security: S4 (advisory lock with pid/ts liveness), S6 (path traversal mitigation).

import { readdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { resolve, join, basename, extname } from 'node:path';
import { parse } from './lib/adr-frontmatter.mjs';
import { compareSemver } from './lib/adr-semver.mjs';

const args = process.argv.slice(2);
const rawProject = args.find((a) => a.startsWith('--project='))?.slice(10) || '.';

// S6 — path traversal mitigation
const project = resolve(rawProject);
if (!project.startsWith(process.cwd())) {
  console.error(`Error: --project must resolve within cwd (got: ${project}, cwd: ${process.cwd()})`);
  process.exit(2);
}
const adrsDir = join(project, '.context/docs/adrs/');

// Subcommand dispatch
const isNextNumber = args.includes('--next-number');
const resolveArg = args.find((a) => a.startsWith('--resolve='))?.slice(10);

try {
  await withLock(adrsDir, async () => {
    if (isNextNumber) {
      const adrs = await loadAdrs(adrsDir);
      const max = Math.max(0, ...adrs.map((a) => parseInt(a.number, 10) || 0));
      console.log(String(max + 1).padStart(3, '0'));
      return;
    }
    if (resolveArg) {
      const adrs = await loadAdrs(adrsDir);
      const matches = adrs.filter(
        (a) => a.file.startsWith(resolveArg) || a.file.includes(resolveArg),
      );
      if (matches.length === 0) {
        console.error(`No match for ${resolveArg}`);
        process.exit(1);
      }
      matches.sort((a, b) => -compareSemver(a.frontmatter.version || '0.0.0', b.frontmatter.version || '0.0.0'));
      console.log(matches[0].file);
      return;
    }
    // Default: regenerate README
    const adrs = await loadAdrs(adrsDir);
    adrs.sort((a, b) => {
      const numCmp = a.number.localeCompare(b.number);
      if (numCmp !== 0) return numCmp;
      return -compareSemver(a.frontmatter.version || '0.0.0', b.frontmatter.version || '0.0.0');
    });
    const md = renderReadme(adrs);
    await writeFile(join(adrsDir, 'README.md'), md);
  });
  process.exit(0);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(2);
}

// ─── Lock with S4 liveness recovery ───────────────────────────────────────

const LOCK_EXPIRY_MS = 30000;

async function withLock(dir, fn, retries = 5) {
  const lockFile = join(dir, '.lock');
  for (let attempt = 0; attempt < retries; attempt++) {
    let handle;
    try {
      handle = await open(lockFile, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, ts: Date.now() }));
      try {
        await fn();
      } finally {
        await handle.close();
        await unlink(lockFile).catch(() => {});
      }
      return;
    } catch (err) {
      if (handle) await handle.close().catch(() => {});
      if (err.code !== 'EEXIST') throw err;
      // Lock exists — check liveness
      const stale = await isLockStale(lockFile);
      if (stale) {
        await unlink(lockFile).catch(() => {});
        continue;
      }
      // Backoff with jitter
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100 * (attempt + 1)));
    }
  }
  throw new Error(`could not acquire lock on ${lockFile} after ${retries} retries`);
}

async function isLockStale(lockFile) {
  try {
    const content = await readFile(lockFile, 'utf-8');
    const { pid, ts } = JSON.parse(content);
    if (Date.now() - ts > LOCK_EXPIRY_MS) return true;
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      return true;
    }
  } catch {
    return true;
  }
}

// ─── Load ADRs ─────────────────────────────────────────────────────────────

async function loadAdrs(dir) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => /^\d{3}-.*\.md$/.test(f) && f !== 'README.md');
  } catch {
    return [];
  }
  return Promise.all(
    files.map(async (f) => {
      const content = await readFile(join(dir, f), 'utf-8');
      const { frontmatter, body } = parse(content);
      return { file: f, number: f.slice(0, 3), frontmatter, body };
    }),
  );
}

// ─── Render README ────────────────────────────────────────────────────────

function renderReadme(adrs) {
  const header = `# ADRs do Projeto

> Índice gerado por \`scripts/adr-update-index.mjs\` — não editar à mão.
> A IA consulta este índice durante o context gathering do PREVC Planning.

## ADRs

`;
  const cols = [
    '#',
    'Título',
    'Versão',
    'Categoria',
    'Stack',
    'Escopo',
    'Status',
    'Kind',
    'Contrato',
    'Refines',
    'Supersedes',
    'Criada',
    'Guardrails',
    'Arquivo',
  ];
  const headRow = `| ${cols.join(' | ')} |`;
  const sep = `| ${cols.map(() => '---').join(' | ')} |`;
  const rows = adrs.map((a) => {
    const fm = a.frontmatter;
    const guardrails = countGuardrails(a.body);
    return `| ${a.number} | ${fm.description ?? ''} | v${fm.version ?? '0.1.0'} | ${fm.category ?? ''} | ${fm.stack ?? ''} | ${capitalize(fm.scope ?? '')} | ${fm.status ?? ''} | ${fm.decision_kind ?? 'firm'} | ${fm.protocol_contract ?? '—'} | ${formatList(fm.refines)} | ${formatList(fm.supersedes)} | ${fm.created ?? ''} | ${guardrails} | [${a.file}](${a.file}) |`;
  });
  return header + headRow + '\n' + sep + '\n' + rows.join('\n') + '\n';
}

function countGuardrails(body) {
  // Line-based scan — the regex-with-lookahead approach is unreliable here because
  // /m flag makes $ match end-of-line, terminating the multi-line capture early.
  const lines = body.split('\n');
  const startIdx = lines.findIndex((l) => /^##\s+Guardrails\b/.test(l));
  if (startIdx === -1) return 0;
  let endIdx = lines.findIndex((l, i) => i > startIdx && /^##\s/.test(l));
  if (endIdx === -1) endIdx = lines.length;
  return lines
    .slice(startIdx + 1, endIdx)
    .filter((l) => /^[-*]\s+(SEMPRE|NUNCA|QUANDO)/.test(l.trim()))
    .length;
}

function formatList(arr) {
  if (!arr || arr.length === 0) return '—';
  return arr.join(', ');
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
