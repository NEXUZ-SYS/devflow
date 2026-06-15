// scripts/reversa-import/parsers/forward-feature.mjs
// Parser de _reversa_forward/NNN-<slug>/ → fragmento IR.features[i].
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { toSlug } from "../slug.mjs";

function readSafe(p) { try { return readFileSync(p, "utf-8"); } catch { return ""; } }

export function parseForwardFeature(featureDir) {
  const slug = toSlug(basename(featureDir));
  const requirements = readSafe(join(featureDir, "requirements.md"));
  const roadmap = readSafe(join(featureDir, "roadmap.md"));
  const interfaces = existsSync(join(featureDir, "interfaces"))
    && readdirSync(join(featureDir, "interfaces")).length > 0;
  return {
    slug,
    requirements,
    roadmap,
    interfaces,
    hasForward: requirements !== "" || roadmap !== "",
  };
}
