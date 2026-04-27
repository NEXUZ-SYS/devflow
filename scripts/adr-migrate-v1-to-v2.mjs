#!/usr/bin/env node
// adr-migrate-v1-to-v2 — one-shot migration from DevFlow v1 ADR template to v2.1.0
// Usage:
//   node scripts/adr-migrate-v1-to-v2.mjs <file> --dry-run    (preview only)
//   node scripts/adr-migrate-v1-to-v2.mjs <file> --confirmed  (apply changes)
//
// P12: runs with --no-fix-auto semantics by default. Each transformation is
// FIX-INTERVIEW-classified and requires --confirmed flag. Without --confirmed,
// the script refuses to modify approved history.

import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parse, stringify } from './lib/adr-frontmatter.mjs';

const file = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const confirmed = process.argv.includes('--confirmed');

if (!file) {
  console.error('Usage: adr-migrate-v1-to-v2.mjs <file> [--dry-run | --confirmed]');
  process.exit(2);
}

const content = await readFile(file, 'utf-8');
const { frontmatter, body: oldBody } = parse(content);

// V1 schema lacks: version, supersedes, refines, protocol_contract, decision_kind
const v2Defaults = {
  version: '1.0.0', // assume already-approved decision is at 1.0.0
  supersedes: [],
  refines: [],
  protocol_contract: null,
  decision_kind: 'firm',
};
const additions = [];
for (const [k, v] of Object.entries(v2Defaults)) {
  if (!(k in frontmatter)) {
    frontmatter[k] = v;
    additions.push(k);
  }
}

// Body transformations
let newBody = oldBody;
const removed = [];
const evidenceAdditions = [];

// 1. Detect "## Relacionamentos" / "## Relationships" / "## Related ADRs" section (line-based to avoid regex quirks)
const relHeadingRe = /^##\s+(Relacionamentos|Relationships|Related ADRs)\b/;
const lines = newBody.split('\n');
const startIdx = lines.findIndex((l) => relHeadingRe.test(l));
if (startIdx !== -1) {
  let endIdx = lines.findIndex((l, i) => i > startIdx && /^##\s/.test(l));
  if (endIdx === -1) endIdx = lines.length;
  const sectionLines = lines.slice(startIdx, endIdx);
  const sectionText = sectionLines.join('\n');
  const urls = sectionText.match(/https?:\/\/[^\s)\]|]+/g) || [];
  for (const url of urls) evidenceAdditions.push(url);
  // Remove section
  lines.splice(startIdx, endIdx - startIdx);
  newBody = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  removed.push(`## Relacionamentos section (${urls.length} URL(s) migrated)`);
}

// 2. Inject URLs into Evidências section if any were extracted
if (evidenceAdditions.length > 0) {
  const evidRe = /^(##\s+Evid[êe]ncias[^\n]*\n)/m;
  if (evidRe.test(newBody)) {
    const sourcesLine = `\n**Fontes oficiais:** ${evidenceAdditions.map((u) => `[${new URL(u).hostname}](${u})`).join(' · ')}\n`;
    newBody = newBody.replace(evidRe, `$1${sourcesLine}`);
  } else {
    newBody += `\n## Evidências / Anexos\n\n**Fontes oficiais:** ${evidenceAdditions.map((u) => `[${new URL(u).hostname}](${u})`).join(' · ')}\n`;
  }
}

// New filename
const newFile = file.replace(/\.md$/, '-v1.0.0.md');

console.log(`Migration plan for ${file} → ${newFile}`);
console.log(`  Frontmatter additions: ${additions.length ? additions.join(', ') : 'none'}`);
console.log(`  Body transformations: ${removed.length ? removed.join('; ') : 'none'}`);
if (evidenceAdditions.length > 0) {
  console.log(`  URL migrations: ${evidenceAdditions.join(', ')}`);
}

if (dryRun) {
  console.log('Dry-run only — no files modified.');
  process.exit(0);
}

if (!confirmed) {
  console.error('\nP12: Migration of approved ADRs requires explicit --confirmed flag.');
  console.error('Run with --dry-run to preview, then --confirmed to apply.');
  process.exit(1);
}

// Apply: S5 atomic write-then-rename
const newContent = stringify(frontmatter, newBody);
await writeFile(file, newContent);
try {
  execFileSync('git', ['mv', file, newFile], { stdio: 'inherit' });
  console.log(`\n✓ Migrated ${file} → ${newFile}`);
} catch (err) {
  await writeFile(file, content);
  console.error(`\nError: git mv failed; rolled back content. ${err.message}`);
  process.exit(1);
}
