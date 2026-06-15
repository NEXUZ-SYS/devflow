// scripts/reversa-import/parsers/soul.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function parseSoul(sourceDir) {
  try {
    const text = readFileSync(join(sourceDir, ".reversa", "soul.md"), "utf-8");
    return { present: true, text };
  } catch {
    return { present: false, text: "" };
  }
}
