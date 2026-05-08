// scripts/lib/standard-audit.mjs — auditor for .context/standards/<id>.md.
//
// Per roadmap-futuro-validacao-pipeline.md Item 2, extended to standards:
// catches placeholder/scaffold content + frontmatter integrity + linter
// existence + cross-reference correctness.
//
// 5 checks (deterministic, fail-loud, exit code via CLI):
//   S1. Frontmatter complete (id, applyTo, version, enforcement.linter)
//   S2. Body has no scaffold placeholders (TODO markers, <...>, scaffolded:true)
//   S3. Linter file exists at enforcement.linter path AND is valid JS
//   S4. relatedAdrs reference real ADR files in .context/adrs/
//   S5. applyTo passes SI-5 validateSubset (no extglob/negation)

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { validateSubset } from "./glob.mjs";
import { resolveAdrPath } from "./path-resolver.mjs";

const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/,
  /<Em prosa, descreva/,
  /<padrão errado>/,
  /<padrão correto/,
  /<one-line description>/,
  /<a definir>/i,
  /SCAFFOLD INCOMPLETO/,
];

function hasPlaceholder(text) {
  if (typeof text !== "string") return false;
  return PLACEHOLDER_PATTERNS.some(re => re.test(text));
}

function findAdrSlugs(projectRoot) {
  const info = resolveAdrPath(projectRoot);
  const slugs = new Set();
  for (const dir of info.readPaths) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter(f => /^\d{3}-.*\.md$/.test(f) && f !== "README.md");
    for (const f of files) {
      // Extract slug: 001-adr-typescript-frontend-v1.0.0.md → adr-typescript-frontend
      const m = f.match(/^\d{3}-(.+?)-v\d+\.\d+\.\d+\.md$/);
      if (m) slugs.add(m[1]);
    }
  }
  return slugs;
}

export function auditStandard(stdPath, projectRoot) {
  const checks = [];

  if (!existsSync(stdPath)) {
    return {
      file: stdPath,
      checks: [{ id: "S0", name: "File exists", status: "FAIL", diagnosis: `not found: ${stdPath}` }],
      summary: { pass: 0, fail: 1, warn: 0 },
      gate: "BLOCKED",
    };
  }

  const content = readFileSync(stdPath, "utf-8");
  const { data: fm, body } = parseFrontmatter(content);

  // S1 — Frontmatter complete
  {
    const required = ["id", "applyTo", "version", "enforcement"];
    const missing = required.filter(k => !fm[k]);
    if (fm.enforcement && !fm.enforcement.linter && !fm.weakStandardWarning) {
      missing.push("enforcement.linter (or weakStandardWarning:true)");
    }
    checks.push({
      id: "S1",
      name: "Frontmatter complete",
      status: missing.length === 0 ? "PASS" : "FAIL",
      diagnosis: missing.length === 0 ? "all required fields present" : `missing: ${missing.join(", ")}`,
    });
  }

  // S2 — No scaffold placeholders
  {
    const isScaffolded = fm.scaffolded === true;
    const bodyHasPlaceholder = hasPlaceholder(body);
    let status = "PASS";
    let diagnosis = "no placeholders";
    if (isScaffolded || bodyHasPlaceholder) {
      status = "FAIL";
      const reasons = [];
      if (isScaffolded) reasons.push("frontmatter has 'scaffolded: true' (remove after filling)");
      if (bodyHasPlaceholder) reasons.push("body contains TODO/placeholder markers");
      diagnosis = reasons.join("; ");
    }
    checks.push({ id: "S2", name: "No scaffold placeholders", status, diagnosis });
  }

  // S3 — Linter file exists + valid JS
  {
    const linter = fm.enforcement?.linter;
    if (!linter) {
      // No linter declared — only OK if weakStandardWarning:true
      checks.push({
        id: "S3",
        name: "Linter file exists",
        status: fm.weakStandardWarning === true ? "PASS" : "WARN",
        diagnosis: fm.weakStandardWarning === true
          ? "no linter (weakStandardWarning:true acknowledged)"
          : "no linter declared and no weakStandardWarning opt-out",
      });
    } else {
      const linterPath = resolve(projectRoot, ".context", linter);
      if (!existsSync(linterPath)) {
        checks.push({
          id: "S3",
          name: "Linter file exists",
          status: "FAIL",
          diagnosis: `linter file not found: ${linterPath}`,
        });
      } else {
        // Verify file exists + detect ESM vs CJS heuristically.
        // Function constructor only parses CommonJS — `import` syntax
        // requires the dynamic import or a separate AST tool. For a
        // pragmatic syntax check: parse only if file is clearly CJS.
        const linterContent = readFileSync(linterPath, "utf-8");
        const stripped = linterContent.replace(/^#!.*\n/, "");
        const isEsm = /^\s*import\s+/m.test(stripped) || /^\s*export\s+/m.test(stripped);
        if (isEsm) {
          // ESM — accept presence; deeper parse needs spawn `node --check`
          checks.push({
            id: "S3",
            name: "Linter file exists",
            status: "PASS",
            diagnosis: `${linterPath} present (ESM, syntax check via node --check on execution)`,
          });
        } else {
          try {
            new Function(stripped);
            checks.push({
              id: "S3",
              name: "Linter file exists",
              status: "PASS",
              diagnosis: `${linterPath} present + parses`,
            });
          } catch (err) {
            checks.push({
              id: "S3",
              name: "Linter file exists",
              status: "FAIL",
              diagnosis: `${linterPath} parse error: ${err.message.slice(0, 80)}`,
            });
          }
        }
      }
    }
  }

  // S4 — relatedAdrs reference real ADR files
  {
    const refs = Array.isArray(fm.relatedAdrs) ? fm.relatedAdrs : [];
    if (refs.length === 0) {
      checks.push({
        id: "S4",
        name: "relatedAdrs cross-reference",
        status: "WARN",
        diagnosis: "no relatedAdrs declared (standard not back-linked to any ADR)",
      });
    } else {
      const adrSlugs = findAdrSlugs(projectRoot);
      const orphans = refs.filter(r => !adrSlugs.has(r));
      checks.push({
        id: "S4",
        name: "relatedAdrs cross-reference",
        status: orphans.length === 0 ? "PASS" : "FAIL",
        diagnosis: orphans.length === 0
          ? `${refs.length} ref(s) point to existing ADRs`
          : `orphan refs: ${orphans.join(", ")}`,
      });
    }
  }

  // S5 — applyTo passes SI-5 validateSubset
  {
    const applyTo = Array.isArray(fm.applyTo) ? fm.applyTo : [];
    const errors = [];
    for (const p of applyTo) {
      try {
        validateSubset(p);
      } catch (err) {
        errors.push(`'${p}': ${err.message}`);
      }
    }
    checks.push({
      id: "S5",
      name: "applyTo SI-5 subset",
      status: errors.length === 0 ? "PASS" : "FAIL",
      diagnosis: errors.length === 0 ? `${applyTo.length} pattern(s) valid` : errors.join("; "),
    });
  }

  // Summary
  const summary = {
    pass: checks.filter(c => c.status === "PASS").length,
    fail: checks.filter(c => c.status === "FAIL").length,
    warn: checks.filter(c => c.status === "WARN").length,
  };
  const gate = summary.fail === 0 ? "PASSED" : "BLOCKED";

  return { file: stdPath, checks, summary, gate, frontmatter: fm };
}
