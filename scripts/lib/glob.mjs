// scripts/lib/glob.mjs — micromatch substitute (subset only)
//
// Supported: **, *, ?, brace {a,b,c}
// Rejected: ! (negation), +(...) / @(...) / *(...) / ?(...) / !(...) (extglob)
//
// Per Dependency Policy + SI-5: this is the ONLY glob implementation used by
// devflow hooks/scripts. Standards/permissions/stacks all import from here.
// Schema validators MUST call validateSubset() to reject forbidden patterns
// at load time, not runtime.

const NEGATION_RE = /^\s*!(?!\()/;          // ! NOT followed by ( = negation
const EXTGLOB_RE = /[!+@*?]\([^)]*\)/;       // <char>(...) = extglob

export function validateSubset(pattern) {
  if (typeof pattern !== "string") {
    throw new TypeError(`Glob pattern must be a string, got ${typeof pattern}`);
  }
  // Check extglob FIRST so !(...) is correctly classified as extglob, not negation
  if (EXTGLOB_RE.test(pattern)) {
    throw new Error(`Extglob syntax not supported in devflow subset: ${pattern}`);
  }
  if (NEGATION_RE.test(pattern)) {
    throw new Error(`Glob negation (!) not supported in devflow subset: ${pattern}`);
  }
  return true;
}

function expandBraces(pattern) {
  // Recursive brace expansion: src/{a,b}.ts → [src/a.ts, src/b.ts]
  // Only handles non-nested braces; nested braces would need bracket-counting parser.
  const m = pattern.match(/\{([^{}]+)\}/);
  if (!m) return [pattern];
  const [whole, inner] = [m[0], m[1]];
  const options = inner.split(",");
  return options.flatMap(opt => expandBraces(pattern.replace(whole, opt)));
}

function globToRegex(pattern) {
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      // ** matches any depth (including zero segments)
      re += ".*";
      i += 2;
      // Skip optional trailing /
      if (pattern[i] === "/") i++;
    } else if (c === "*") {
      // * matches any chars except / (single segment)
      re += "[^/]*";
      i++;
    } else if (c === "?") {
      // ? matches single non-/ char
      re += "[^/]";
      i++;
    } else if (".+^$()|[]\\".includes(c)) {
      // Regex special chars must be escaped
      re += "\\" + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  return new RegExp("^" + re + "$");
}

export function matchGlob(pattern, filePath) {
  validateSubset(pattern);
  const expanded = expandBraces(pattern);
  return expanded.some(p => globToRegex(p).test(filePath));
}
