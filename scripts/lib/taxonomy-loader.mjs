// scripts/lib/taxonomy-loader.mjs
//
// Loads the concern taxonomy distributed by the standards-builder skill,
// optionally merged with a project-local concerns.local.yaml. Local entries
// shadow distributed entries by id; a warning is emitted per shadow.
//
// The frontmatter.mjs parser used elsewhere in DevFlow rejects YAML block
// scalars (|, >), but the taxonomy file uses them for principleTemplate to
// stay readable. We preprocess block scalars into single-line quoted strings
// before handing the YAML to parseYamlSubset (via parseFrontmatter on a
// synthesized document).
//
// Public API:
//   loadTaxonomy({ distributedPath, projectRoot })
//     → { entries: Entry[], warnings: string[] }
//
// Entry shape (validated downstream):
//   { id, summary, category, defaultApplyTo, inverseHints,
//     principleTemplate, antiPatternTemplate, linterHints,
//     relatedAdrCategories }

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";

const LOCAL_FILENAME = "concerns.local.yaml";

// Preprocess a YAML source: convert "key: |" block scalars into
// "key: \"<escaped single-line content>\"". Preserves indentation context.
//
// Algorithm:
//   - Walk lines; when matching /^(\s*)([A-Za-z_][\w-]*):\s*\|\s*$/, capture
//     subsequent lines whose indent > baseIndent until dedent or EOF.
//   - Join captured lines with \n, trim trailing blank lines, escape for
//     a JSON-quoted string ("...").
function preprocessBlockScalars(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^(\s*)([A-Za-z_][\w-]*):\s*\|\s*$/);
    if (!m) {
      out.push(line);
      i++;
      continue;
    }
    const baseIndent = m[1].length;
    const key = m[2];
    // Collect block body
    const body = [];
    let j = i + 1;
    let bodyIndent = -1;
    while (j < lines.length) {
      const ln = lines[j];
      if (ln.trim() === "") {
        body.push("");
        j++;
        continue;
      }
      const indent = ln.match(/^( *)/)[1].length;
      if (indent <= baseIndent) break;
      if (bodyIndent === -1) bodyIndent = indent;
      body.push(ln.slice(bodyIndent));
      j++;
    }
    // Trim trailing empty lines
    while (body.length > 0 && body[body.length - 1] === "") body.pop();
    const joined = body.join("\n");
    // Escape for JSON-style double-quoted string: backslash, double-quote, newline
    const escaped = joined
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    out.push(`${m[1]}${key}: "${escaped}"`);
    i = j;
  }
  return out.join("\n");
}

// Post-process: parseYamlSubset returns strings with literal \n sequences
// when we round-tripped through a quoted string. Convert those back to real
// newlines for fields where we expect multi-line content (principleTemplate).
function unescapeBlockScalarStrings(entry) {
  if (typeof entry.principleTemplate === "string") {
    entry.principleTemplate = decodeEscapes(entry.principleTemplate);
  }
  return entry;
}

function decodeEscapes(s) {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function parseTaxonomyYaml(yamlText) {
  const pre = preprocessBlockScalars(yamlText);
  // parseFrontmatter expects ---\n<yaml>\n---\n; synthesize that wrapper
  const wrapped = `---\n${pre}\n---\n`;
  const { data } = parseFrontmatter(wrapped);
  return data || {};
}

export async function loadTaxonomy({ distributedPath, projectRoot }) {
  const result = { entries: [], warnings: [] };

  if (!distributedPath || !existsSync(distributedPath)) {
    result.warnings.push(`taxonomy file not found: ${distributedPath ?? "(null)"}`);
    return result;
  }

  try {
    const distributed = parseTaxonomyYaml(readFileSync(distributedPath, "utf-8"));
    const distEntries = Array.isArray(distributed?.entries) ? distributed.entries : [];
    result.entries = distEntries.map(unescapeBlockScalarStrings);
  } catch (err) {
    result.warnings.push(`failed to parse distributed taxonomy: ${err.message}`);
    return result;
  }

  if (projectRoot) {
    const localPath = join(projectRoot, ".context/standards", LOCAL_FILENAME);
    if (existsSync(localPath)) {
      try {
        const local = parseTaxonomyYaml(readFileSync(localPath, "utf-8"));
        const localEntries = (Array.isArray(local?.entries) ? local.entries : [])
          .map(unescapeBlockScalarStrings);
        for (const localEntry of localEntries) {
          const idx = result.entries.findIndex(e => e.id === localEntry.id);
          if (idx >= 0) {
            result.warnings.push(
              `local concern '${localEntry.id}' shadowed distributed entry`
            );
            result.entries[idx] = localEntry;
          } else {
            result.entries.push(localEntry);
          }
        }
      } catch (err) {
        result.warnings.push(`failed to parse local taxonomy: ${err.message}`);
      }
    }
  }

  return result;
}
