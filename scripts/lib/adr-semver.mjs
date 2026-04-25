// adr-semver — bump/compare/parse helpers used by adr-update-index, adr-evolve.
// Extracted to avoid duplication (C5). Zero deps — Node stdlib only.

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(v) {
  const m = String(v).match(SEMVER_RE);
  if (!m) throw new Error(`invalid semver: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

export function bumpSemver(v, kind) {
  const { major, minor, patch } = parseSemver(v);
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'major') return `${major + 1}.0.0`;
  throw new Error(`unknown bump kind: ${kind}`);
}

export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}
