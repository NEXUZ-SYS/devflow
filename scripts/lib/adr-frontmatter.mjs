// adr-frontmatter — minimal YAML frontmatter parser/stringifier (zero deps, stdlib only)
// Subset supported: scalar key:value, inline [], inline [a, b], null/~, ISO dates,
// quoted strings, booleans, comments. Multi-line lists / anchors / >| NOT supported.
// S2 — rejects __proto__/constructor/prototype keys; uses Object.create(null) to avoid pollution.

const DELIMITER_RE = /^---\s*$/;
const KEY_RE = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/;
const DENYLIST_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function parse(content) {
  if (!content.startsWith('---')) {
    throw new Error('frontmatter delimiter missing at start');
  }
  const lines = content.split('\n');
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (DELIMITER_RE.test(lines[i])) { endIdx = i; break; }
  }
  if (endIdx === -1) throw new Error('frontmatter delimiter missing at end');

  const fm = Object.create(null);
  const order = [];
  for (const line of lines.slice(1, endIdx)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const m = trimmed.match(KEY_RE);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (DENYLIST_KEYS.has(key)) {
      throw new Error(`forbidden key in frontmatter: ${key}`);
    }
    fm[key] = parseValue(rawVal.trim());
    order.push(key);
  }
  Object.defineProperty(fm, '__order__', {
    value: order,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  const body = lines.slice(endIdx + 1).join('\n');
  return { frontmatter: fm, body };
}

function parseValue(v) {
  if (v === '') return '';
  if (v === '~' || v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === '[]') return [];
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
  }
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  return v;
}

export function stringify(frontmatter, body) {
  const lines = ['---'];
  // Preserve insertion order if present; otherwise iterate own keys
  const keys = frontmatter.__order__ ?? Object.keys(frontmatter);
  for (const k of keys) {
    if (DENYLIST_KEYS.has(k)) continue;
    if (!(k in frontmatter)) continue;
    lines.push(`${k}: ${formatValue(frontmatter[k])}`);
  }
  lines.push('---');
  return lines.join('\n') + '\n' + body;
}

function formatValue(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return '[' + v.join(', ') + ']';
  }
  if (typeof v === 'string') {
    // Quote when value contains characters that would change parsing
    if (v === '' || v === 'null' || v === 'true' || v === 'false' || v === '~') return `"${v}"`;
    if (/[:#"']/.test(v)) return `"${v.replace(/"/g, '\\"')}"`;
    return v;
  }
  return String(v);
}
