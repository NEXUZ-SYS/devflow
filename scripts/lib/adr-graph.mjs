// adr-graph — supersedes/refines integrity validator (Check 12 backbone)
// Loads all ADR files in a directory, validates graph rules:
//   - supersedes: [X] → X exists AND X.status ∈ {Substituido, Descontinuado}
//   - refines: [X] → X exists AND X.status === Aprovado
//   - no self-references
//   - no cycles in supersedes/refines edges
// Hard Rule #12 of spec: this validator does NOT load referenced ADRs as context;
// it only checks structural integrity of the graph.

import { readdir, readFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { parse } from './adr-frontmatter.mjs';

export async function validateGraph(dir) {
  const errors = [];
  const adrs = await loadAdrs(dir);

  for (const adr of adrs) {
    const slug = basename(adr.file, extname(adr.file));
    const fm = adr.frontmatter;
    const supersedes = fm.supersedes ?? [];
    const refines = fm.refines ?? [];

    for (const ref of supersedes) {
      if (ref === slug) {
        errors.push(`self-reference in supersedes: ${slug}`);
        continue;
      }
      const target = adrs.find((a) => basename(a.file, extname(a.file)) === ref);
      if (!target) {
        errors.push(`supersedes points to missing file: ${ref} (from ${slug})`);
        continue;
      }
      const tStatus = target.frontmatter.status;
      if (tStatus === 'Proposto' || tStatus === 'Aprovado') {
        errors.push(
          `supersedes points to unapproved-or-active ADR: ${ref} has status ${tStatus} (must be Substituido or Descontinuado)`,
        );
      }
    }

    for (const ref of refines) {
      if (ref === slug) {
        errors.push(`self-reference in refines: ${slug}`);
        continue;
      }
      const target = adrs.find((a) => basename(a.file, extname(a.file)) === ref);
      if (!target) {
        errors.push(`refines points to missing file: ${ref} (from ${slug})`);
        continue;
      }
      const tStatus = target.frontmatter.status;
      if (tStatus !== 'Aprovado') {
        errors.push(
          `refines must point to Aprovado ADR: ${ref} has status ${tStatus}`,
        );
      }
    }
  }

  // Cycle detection across supersedes ∪ refines
  const adjacency = Object.create(null);
  for (const adr of adrs) {
    const slug = basename(adr.file, extname(adr.file));
    adjacency[slug] = (adr.frontmatter.supersedes ?? []).concat(
      adr.frontmatter.refines ?? [],
    );
  }
  const visited = new Set();
  for (const start of Object.keys(adjacency)) {
    if (visited.has(start)) continue;
    if (hasCycle(start, adjacency, new Set(), visited)) {
      errors.push(`cycle detected involving ${start}`);
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

async function loadAdrs(dir) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.match(/^\d{3}-.*\.md$/));
  } catch {
    return [];
  }
  return Promise.all(
    files.map(async (f) => {
      const content = await readFile(join(dir, f), 'utf-8');
      const { frontmatter } = parse(content);
      return { file: f, frontmatter };
    }),
  );
}

function hasCycle(node, adjacency, visiting, visited) {
  if (visited.has(node)) return false;
  if (visiting.has(node)) return true;
  visiting.add(node);
  for (const next of adjacency[node] ?? []) {
    if (hasCycle(next, adjacency, visiting, visited)) return true;
  }
  visiting.delete(node);
  visited.add(node);
  return false;
}
