#!/usr/bin/env node
// adr-evolve — orchestrates patch/minor/major/refine transitions on ADR files.
// Usage: node scripts/adr-evolve.mjs <file> --kind=<patch|minor|major|refine> [--apply]
//                                            [--slug=<new-slug>] [--diff="..."]
// Security:
//   S1 — execFileSync with argv array (no shell interpolation, no injection via filenames)
//   S5 — atomic write-then-rename (write first, git mv after; rollback on failure)

import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, basename, resolve, join } from 'node:path';
import { parse, stringify } from './lib/adr-frontmatter.mjs';
import { bumpSemver } from './lib/adr-semver.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const kind = args.find((a) => a.startsWith('--kind='))?.slice(7);
const apply = args.includes('--apply');
const slug = args.find((a) => a.startsWith('--slug='))?.slice(7);
const diff = args.find((a) => a.startsWith('--diff='))?.slice(7) || '';

if (!file || !kind) {
  console.error('Usage: adr-evolve.mjs <file> --kind=<patch|minor|major|refine> [--apply] [--slug=<slug>]');
  process.exit(2);
}

const handlers = { patch: handlePatch, minor: handleMinor, major: handleMajor, refine: handleRefine };
const handler = handlers[kind];
if (!handler) {
  console.error(`Unknown --kind: ${kind} (must be patch|minor|major|refine)`);
  process.exit(2);
}

try {
  await handler(file, { apply, slug, diff });
  process.exit(0);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function projectRootFromAdrFile(file) {
  // .context/docs/adrs/xxx.md → .context/.. = project
  return resolve(dirname(dirname(dirname(dirname(resolve(file))))));
}

function renameToVersion(file, version) {
  return file.replace(/-v\d+\.\d+\.\d+\.md$/, `-v${version}.md`);
}

async function regenerateIndex(projectRoot) {
  // S1 — execFileSync with argv array
  execFileSync('node', ['scripts/adr-update-index.mjs', `--project=${projectRoot}`], {
    stdio: 'inherit',
  });
}

// ─── Patch handler ────────────────────────────────────────────────────────

async function handlePatch(file, opts) {
  const content = await readFile(file, 'utf-8');
  const { frontmatter, body } = parse(content);
  const newVersion = bumpSemver(frontmatter.version || '0.1.0', 'patch');
  frontmatter.version = newVersion;
  // Patch preserves status: do not modify
  const newFile = renameToVersion(file, newVersion);

  if (opts.apply) {
    // S5 — atomic write-then-rename: write new content first under old name; if write fails, original untouched.
    // Then git mv to new name. If git mv fails, rollback the content change.
    const newContent = stringify(frontmatter, body);
    await writeFile(file, newContent);
    const projectRoot = projectRootFromAdrFile(file);
    const fileAbs = resolve(file);
    const newFileAbs = resolve(newFile);
    const oldRel = fileAbs.startsWith(projectRoot) ? fileAbs.slice(projectRoot.length + 1) : fileAbs;
    const newRel = newFileAbs.startsWith(projectRoot) ? newFileAbs.slice(projectRoot.length + 1) : newFileAbs;
    try {
      execFileSync('git', ['mv', oldRel, newRel], { stdio: 'pipe', cwd: projectRoot });
    } catch (err) {
      await writeFile(file, content);
      throw new Error(`git mv failed; content rolled back: ${err.message}`);
    }
    await regenerateIndex(projectRoot);
  }
  console.log(JSON.stringify({ kind: 'patch', from: file, to: newFile, version: newVersion }));
}

// ─── Minor handler ────────────────────────────────────────────────────────

async function handleMinor(file, opts) {
  const content = await readFile(file, 'utf-8');
  const { frontmatter, body } = parse(content);
  const newVersion = bumpSemver(frontmatter.version || '0.1.0', 'minor');
  frontmatter.version = newVersion;
  frontmatter.status = 'Proposto'; // minor requires re-approval
  const newFile = renameToVersion(file, newVersion);

  if (opts.apply) {
    const newContent = stringify(frontmatter, body);
    await writeFile(file, newContent);
    const projectRoot = projectRootFromAdrFile(file);
    const fileAbs = resolve(file);
    const newFileAbs = resolve(newFile);
    const oldRel = fileAbs.startsWith(projectRoot) ? fileAbs.slice(projectRoot.length + 1) : fileAbs;
    const newRel = newFileAbs.startsWith(projectRoot) ? newFileAbs.slice(projectRoot.length + 1) : newFileAbs;
    try {
      execFileSync('git', ['mv', oldRel, newRel], { stdio: 'pipe', cwd: projectRoot });
    } catch (err) {
      await writeFile(file, content);
      throw new Error(`git mv failed; content rolled back: ${err.message}`);
    }
    await regenerateIndex(projectRoot);
  }
  console.log(JSON.stringify({ kind: 'minor', from: file, to: newFile, version: newVersion }));
}

// ─── Major handler ────────────────────────────────────────────────────────

async function handleMajor(file, opts) {
  const oldContent = await readFile(file, 'utf-8');
  const { frontmatter: oldFm, body: oldBody } = parse(oldContent);
  const oldSlug = basename(file, '.md');

  // New ADR carries supersedes ref to old slug-without-extension (Opção Y)
  const today = new Date().toISOString().slice(0, 10);
  const newFm = Object.create(null);
  Object.assign(newFm, {
    type: 'adr',
    name: oldFm.name,
    description: opts.diff || `${oldFm.description ?? oldFm.name} (v2)`,
    scope: oldFm.scope,
    stack: oldFm.stack,
    category: oldFm.category,
    status: 'Proposto',
    version: '2.0.0',
    created: today,
    supersedes: [oldSlug],
    refines: [],
    protocol_contract: oldFm.protocol_contract ?? null,
    decision_kind: oldFm.decision_kind ?? 'firm',
  });
  const newBody = '\n# ADR — <a definir — major bump>\n\n## Contexto\n\n<a definir>\n\n## Decisão\n\n<a definir>\n';

  // New filename: replace v1.x.y → v2.0.0 in the path
  const newFile = file.replace(/-v\d+\.\d+\.\d+\.md$/, '-v2.0.0.md');

  // Old ADR: mark Substituido in place (filename DOES NOT change)
  oldFm.status = 'Substituido';
  const updatedOldContent = stringify(oldFm, oldBody);

  if (opts.apply) {
    await writeFile(newFile, stringify(newFm, newBody));
    await writeFile(file, updatedOldContent);
    await regenerateIndex(projectRootFromAdrFile(newFile));
  }
  console.log(JSON.stringify({ kind: 'major', new: newFile, supersedes: oldSlug }));
}

// ─── Refine handler ───────────────────────────────────────────────────────

async function handleRefine(file, opts) {
  const parentSlug = basename(file, '.md');
  const dir = dirname(file);
  const projectRoot = projectRootFromAdrFile(file);

  // Resolve next sequential number via update-index
  const nextNumOutput = execFileSync(
    'node',
    ['scripts/adr-update-index.mjs', `--project=${projectRoot}`, '--next-number'],
    { encoding: 'utf-8' },
  );
  const num = nextNumOutput.trim();
  const slug = opts.slug || 'a-definir-refine';
  const newFile = join(dir, `${num}-${slug}-v1.0.0.md`);

  const today = new Date().toISOString().slice(0, 10);
  const newFm = Object.create(null);
  Object.assign(newFm, {
    type: 'adr',
    name: slug,
    description: opts.diff || `Refines ${parentSlug}`,
    scope: 'project',
    stack: 'universal',
    category: 'arquitetura',
    status: 'Proposto',
    version: '1.0.0',
    created: today,
    supersedes: [],
    refines: [parentSlug],
    protocol_contract: null,
    decision_kind: 'firm',
  });
  const newBody = '\n# ADR — <a definir — refine>\n\n## Contexto\n\n<a definir>\n\n## Decisão\n\n<a definir>\n';

  if (opts.apply) {
    await writeFile(newFile, stringify(newFm, newBody));
    await regenerateIndex(projectRoot);
  }
  console.log(JSON.stringify({ kind: 'refine', new: newFile, refines: parentSlug }));
}
