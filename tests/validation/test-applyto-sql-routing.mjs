import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { findApplicableStandards, loadStandardsMerged } from "../../scripts/lib/standards-loader.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const emptyProject = mkdtempSync(tmpdir() + "/applyto-");
const stds = loadStandardsMerged(emptyProject, REPO);

describe("applyTo routing — .sql alcança os linters SQL", () => {
  for (const id of ["std-data-modeling", "std-migration", "std-performance"]) {
    it(`${id} casa um arquivo .sql`, () => {
      const applicable = findApplicableStandards("db/migrations/001_init.sql", stds);
      assert.ok(applicable.some(s => s.id === id), `${id} deve aplicar a .sql`);
    });
  }
});
