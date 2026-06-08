import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
for (const [skill, role] of [["skills/prevc-planning/SKILL.md","pi/plan"],["skills/prevc-review/SKILL.md","pi/slow"],["skills/prevc-execution/SKILL.md","pi/smol"]]) {
  test(`${skill} cita omp-roles e ${role}`, () => {
    const s = readFileSync(skill, "utf-8");
    assert.match(s, /omp-roles\.yaml/);
    assert.match(s, new RegExp(role.replace("/", "\\/")));
  });
}
