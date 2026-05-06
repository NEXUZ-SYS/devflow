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

function parseScalar(raw) {
  const v = raw.trim();
  if (v === "") return "";
  if (v === "null" || v === "~") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "[]") return [];
  if (v === "{}") return {};
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

function parseYamlSubset(yaml) {
  const lines = yaml.split(/\r?\n/);
  const data = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Skip blank lines and comments
    if (line.trim() === "" || /^\s*#/.test(line)) {
      i++;
      continue;
    }

    const indent = indentOf(line);
    if (indent !== 0) {
      // Only top-level keys handled at this scope
      i++;
      continue;
    }

    const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const rawValue = m[2];

    if (rawValue === "") {
      // Either a block list or a nested map — peek next line
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j >= lines.length) {
        data[key] = null;
        i = j;
        continue;
      }
      const nextIndent = indentOf(lines[j]);
      if (nextIndent === 0) {
        // No nesting; treat as null
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
          if (indentOf(ln) < nextIndent) break;
          const lm = ln.match(/^\s*-\s+(.*)$/);
          if (!lm) break;
          arr.push(parseScalar(lm[1]));
          j++;
        }
        data[key] = arr;
        i = j;
      } else {
        // One-level nested map
        const sub = {};
        while (j < lines.length) {
          const ln = lines[j];
          if (ln.trim() === "" || /^\s*#/.test(ln)) { j++; continue; }
          if (indentOf(ln) < nextIndent) break;
          const sm = ln.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
          if (!sm) break;
          sub[sm[1]] = parseScalar(sm[2]);
          j++;
        }
        data[key] = sub;
        i = j;
      }
    } else {
      data[key] = parseScalar(rawValue);
      i++;
    }
  }

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
