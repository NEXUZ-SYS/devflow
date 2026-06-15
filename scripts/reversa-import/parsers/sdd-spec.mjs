// scripts/reversa-import/parsers/sdd-spec.mjs
// Parser de _reversa_sdd/<feature>/ → spec + screens + interfaces + detecção de stub.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scanMarkers } from "../markers.mjs";

const STUB_LINE_THRESHOLD = 10;

function readSafe(p) { try { return readFileSync(p, "utf-8"); } catch { return ""; } }

export function parseSddSpec(featureDir) {
  const spec = readSafe(join(featureDir, "spec.md"));
  const screens = readSafe(join(featureDir, "screens.md"));
  const usefulLines = spec.split("\n").filter((l) => l.trim()).length;
  return {
    specPath: join(featureDir, "spec.md"),
    spec,
    screens,
    specLineCount: usefulLines,
    hasSdd: spec !== "",
    hasScreens: screens !== "",
    hasInterfaces: existsSync(join(featureDir, "interfaces")),
    isStub: spec === "" || usefulLines < STUB_LINE_THRESHOLD,
    markers: scanMarkers(spec),
  };
}
