/**
 * Structural validation tests for the ADR (Architectural Decision Records) system.
 * Validates templates, directory structure, frontmatter, and skill integration.
 * Run: node --test tests/validation/test-adr-structural.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, basename, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf-8");

const ADRS_DIR = ".context/templates/adrs";
const VALID_CATEGORIES = [
  "principios-codigo",
  "qualidade-testes",
  "arquitetura",
  "seguranca",
  "infraestrutura",
];
const REQUIRED_FRONTMATTER_FIELDS = [
  "name",
  "description",
  "scope",
  "stack",
  "category",
  "status",
  "created",
];

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Recursively finds .md files in a directory, excluding README.md.
 */
function findMarkdownFiles(dir) {
  const absDir = resolve(ROOT, dir);
  const results = [];

  function walk(current) {
    const entries = readdirSync(current);
    for (const entry of entries) {
      const fullPath = join(current, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (
        entry.endsWith(".md") &&
        entry.toUpperCase() !== "README.MD"
      ) {
        results.push(fullPath);
      }
    }
  }

  walk(absDir);
  return results;
}

/**
 * Extracts YAML frontmatter key-value pairs from a markdown file content.
 * Returns an object with string keys and string values.
 */
function parseFrontmatter(content) {
  const fm = {};
  if (!content.startsWith("---\n")) return fm;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return fm;
  const block = content.substring(4, end);
  for (const line of block.split("\n")) {
    const match = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (match) {
      fm[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return fm;
}

// ─── 1. Directory Structure ──────────────────────────────────────

describe("ADR directory structure", () => {
  it("should have .context/templates/adrs/ directory", () => {
    const dir = resolve(ROOT, ADRS_DIR);
    assert.ok(existsSync(dir), `${ADRS_DIR} directory must exist`);
    assert.ok(
      statSync(dir).isDirectory(),
      `${ADRS_DIR} must be a directory`
    );
  });

  it("should have README.md index", () => {
    const readme = resolve(ROOT, ADRS_DIR, "README.md");
    assert.ok(existsSync(readme), `${ADRS_DIR}/README.md must exist`);
  });

  for (const category of VALID_CATEGORIES) {
    it(`should have category subdirectory: ${category}`, () => {
      const catDir = resolve(ROOT, ADRS_DIR, category);
      assert.ok(
        existsSync(catDir),
        `${ADRS_DIR}/${category} directory must exist`
      );
      assert.ok(
        statSync(catDir).isDirectory(),
        `${ADRS_DIR}/${category} must be a directory`
      );
    });
  }
});

// ─── 2. Template Frontmatter Validation ──────────────────────────

describe("ADR template frontmatter", () => {
  const adrsAbsDir = resolve(ROOT, ADRS_DIR);
  const templates = existsSync(adrsAbsDir) ? findMarkdownFiles(ADRS_DIR) : [];

  if (templates.length === 0) {
    it("should find at least one template file (no templates found yet)", () => {
      assert.fail(
        "No ADR template files found in " + ADRS_DIR + " (expected at least 6)"
      );
    });
  }

  for (const tplPath of templates) {
    const relPath = tplPath.replace(resolve(ROOT) + "/", "");

    describe(relPath, () => {
      const content = readFileSync(tplPath, "utf-8");
      const fm = parseFrontmatter(content);

      it("should have YAML frontmatter delimiters", () => {
        assert.ok(content.startsWith("---\n"), "must start with ---");
        const secondDelim = content.indexOf("\n---", 4);
        assert.ok(secondDelim > 4, "must have closing ---");
      });

      it("should have type: adr", () => {
        assert.equal(fm.type, "adr", `type must be "adr", got "${fm.type}"`);
      });

      for (const field of REQUIRED_FRONTMATTER_FIELDS) {
        it(`should have required field: ${field}`, () => {
          assert.ok(
            fm[field] !== undefined && fm[field].length > 0,
            `missing or empty frontmatter field: ${field}`
          );
        });
      }

      it("should have scope: organizational", () => {
        assert.equal(
          fm.scope,
          "organizational",
          `scope must be "organizational", got "${fm.scope}"`
        );
      });

      it("should have a valid category", () => {
        assert.ok(
          VALID_CATEGORIES.includes(fm.category),
          `category "${fm.category}" must be one of: ${VALID_CATEGORIES.join(", ")}`
        );
      });

      it("should have ## Guardrails section with at least one rule keyword", () => {
        const guardrailsMatch = content.match(/## Guardrails[\s\S]*?(?=## |$)/);
        assert.ok(guardrailsMatch, "must have ## Guardrails section");
        const section = guardrailsMatch[0];
        const hasRule =
          section.includes("SEMPRE") ||
          section.includes("NUNCA") ||
          section.includes("QUANDO");
        assert.ok(
          hasRule,
          "## Guardrails must contain at least one SEMPRE, NUNCA, or QUANDO rule"
        );
      });

      it("should have ## Enforcement section", () => {
        assert.ok(
          content.includes("## Enforcement"),
          "must have ## Enforcement section"
        );
      });
    });
  }
});

// ─── 3. README Index Validation ──────────────────────────────────

describe("ADR README index", () => {
  const adrsAbsDir = resolve(ROOT, ADRS_DIR);

  it("should list all template file names", () => {
    assert.ok(
      existsSync(resolve(adrsAbsDir, "README.md")),
      "README.md must exist"
    );

    const readme = read(join(ADRS_DIR, "README.md"));
    const templates = existsSync(adrsAbsDir)
      ? findMarkdownFiles(ADRS_DIR)
      : [];

    assert.ok(
      templates.length > 0,
      "must have at least one template to validate against"
    );

    for (const tplPath of templates) {
      const name = basename(tplPath, ".md");
      assert.ok(
        readme.includes(name),
        `README.md must reference template "${name}"`
      );
    }
  });
});

// ─── 4. Skill Integration ────────────────────────────────────────

describe("Skill integration for ADR system", () => {
  describe("skills/prd-generation/SKILL.md", () => {
    it('should contain "Entrevista STACK" section', () => {
      const content = read("skills/prd-generation/SKILL.md");
      assert.ok(
        content.includes("Entrevista STACK"),
        'prd-generation must contain "Entrevista STACK"'
      );
    });

    it('should contain "Entrevista ADR" section', () => {
      const content = read("skills/prd-generation/SKILL.md");
      assert.ok(
        content.includes("Entrevista ADR"),
        'prd-generation must contain "Entrevista ADR"'
      );
    });
  });

  describe("skills/prevc-planning/SKILL.md", () => {
    it('should reference ".context/docs/adrs"', () => {
      const content = read("skills/prevc-planning/SKILL.md");
      assert.ok(
        content.includes(".context/docs/adrs"),
        'prevc-planning must reference ".context/docs/adrs"'
      );
    });
  });

  describe("skills/prevc-validation/SKILL.md", () => {
    it("should reference ADR compliance checking", () => {
      const content = read("skills/prevc-validation/SKILL.md");
      assert.ok(
        content.includes("ADR Guardrails Compliance") ||
          content.includes("ADR compliance"),
        'prevc-validation must contain "ADR Guardrails Compliance" or "ADR compliance"'
      );
    });
  });

  describe("skills/context-awareness/SKILL.md", () => {
    it('should reference ".context/docs/adrs"', () => {
      const content = read("skills/context-awareness/SKILL.md");
      assert.ok(
        content.includes(".context/docs/adrs"),
        'context-awareness must reference ".context/docs/adrs"'
      );
    });
  });

  describe("skills/context-sync/SKILL.md", () => {
    it("should reference ADR syncing", () => {
      const content = read("skills/context-sync/SKILL.md");
      assert.ok(
        content.includes("Sync ADR") || content.includes("adrs/README.md"),
        'context-sync must contain "Sync ADR" or "adrs/README.md"'
      );
    });
  });
});

// ─── 5. Template Count ───────────────────────────────────────────

describe("ADR template count", () => {
  it("should have at least 6 templates (v1 kit)", () => {
    const adrsAbsDir = resolve(ROOT, ADRS_DIR);
    const templates = existsSync(adrsAbsDir)
      ? findMarkdownFiles(ADRS_DIR)
      : [];
    assert.ok(
      templates.length >= 6,
      `expected at least 6 ADR templates, found ${templates.length}`
    );
  });
});
