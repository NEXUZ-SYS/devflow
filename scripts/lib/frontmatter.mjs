// scripts/lib/frontmatter.mjs — gray-matter substitute (YAML subset only)
//
// Supported YAML constructs:
//   - top-level scalars: string, number, boolean, null
//   - quoted strings: "double" and 'single'
//   - inline arrays: []
//   - block lists:    - item
//   - one-level nested maps: key:\n  subkey: value
//   - comments: # ... (full-line, NOT mid-line on quoted strings)
//
// Rejected (throw):
//   - anchors (&name)
//   - references (*name when used as a value, not as a glob char)
//   - multi-line block scalars (|, >)
//
// This is sufficient for ADR/standard/manifest frontmatter as defined by
// devflow's templates. Fancier YAML belongs in a real parser.

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function unquote(s) {
  if (s.length >= 2) {
    if ((s[0] === '"' && s[s.length - 1] === '"') ||
        (s[0] === "'" && s[s.length - 1] === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

function parseInlineArray(v) {
  // v is "[item1, item2, ...]" — strip brackets, split on commas, unquote each
  const inner = v.slice(1, -1).trim();
  if (inner === "") return [];
  // Naive split by comma — sufficient for ADR/standard frontmatter use cases
  // (no nested arrays, no quoted commas in standards).
  return inner.split(",").map(s => unquote(s.trim()));
}

function parseScalar(raw) {
  const v = raw.trim();
  if (v === "") return "";
  if (v === "null" || v === "~") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "[]") return [];
  if (v === "{}") return {};
  if (v.startsWith("[") && v.endsWith("]")) return parseInlineArray(v);
  // Detect YAML reference (*name) used as value — reject
  if (/^\*[A-Za-z_]/.test(v)) {
    throw new Error(`YAML reference (*) not supported in devflow subset: ${raw}`);
  }
  // Detect YAML anchor (&name ...) — reject
  if (/^&[A-Za-z_]/.test(v)) {
    throw new Error(`YAML anchor (&) not supported in devflow subset: ${raw}`);
  }
  // Numeric scalars (avoid converting version strings like "1.0.0")
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  return unquote(v);
}

function indentOf(line) {
  const m = line.match(/^( *)/);
  return m ? m[1].length : 0;
}

// Recursive parser: parseBlock(lines, startIdx, baseIndent) returns
// [parsed, nextIdx] where parsed is the map at indent=baseIndent+, and
// nextIdx is the line after the block ends. Supports arbitrary nesting
// of maps and lists.
function parseBlock(lines, startIdx, baseIndent) {
  const data = {};
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || /^\s*#/.test(line)) {
      i++;
      continue;
    }

    const indent = indentOf(line);
    if (indent < baseIndent) break;       // dedent — end of this block
    if (indent > baseIndent) { i++; continue; }  // skip mis-indented (shouldn't happen)

    const m = line.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1];
    const rawValue = m[2];

    if (rawValue !== "") {
      data[key] = parseScalar(rawValue);
      i++;
      continue;
    }

    // Empty value — peek next non-blank line
    let j = i + 1;
    while (j < lines.length && (lines[j].trim() === "" || /^\s*#/.test(lines[j]))) j++;
    if (j >= lines.length) {
      data[key] = null;
      i = j;
      continue;
    }
    const childIndent = indentOf(lines[j]);
    if (childIndent <= baseIndent) {
      data[key] = null;
      i++;
      continue;
    }

    // Detect block list vs nested map
    const isList = /^\s*-\s/.test(lines[j]);
    if (isList) {
      const arr = [];
      while (j < lines.length) {
        const ln = lines[j];
        if (ln.trim() === "" || /^\s*#/.test(ln)) { j++; continue; }
        if (indentOf(ln) < childIndent) break;
        const lm = ln.match(/^\s*-\s+(.*)$/);
        if (!lm) break;
        arr.push(parseScalar(lm[1]));
        j++;
      }
      data[key] = arr;
      i = j;
    } else {
      // Nested map — recurse
      const [sub, nextI] = parseBlock(lines, j, childIndent);
      data[key] = sub;
      i = nextI;
    }
  }
  return [data, i];
}

function parseYamlSubset(yaml) {
  const lines = yaml.split(/\r?\n/);
  const [data] = parseBlock(lines, 0, 0);
  return data;
}

export function parseFrontmatter(source) {
  const m = source.match(FM_RE);
  if (!m) {
    return { data: {}, body: source };
  }
  const yaml = m[1];
  const body = m[2];
  const data = parseYamlSubset(yaml);
  return { data, body };
}
