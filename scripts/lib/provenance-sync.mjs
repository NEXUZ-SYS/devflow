/**
 * provenance-sync — sync provenance-aware de artefatos do plugin para .context/.
 *
 * Distingue deploy intocado (auto-update) de edição local (preserva+reporta) via
 * hash, com contenção de segurança (isWithinDir + recusa de symlink). Cobre
 * artefatos VERBATIM (skills + standards de profile) e, via `transform`,
 * artefatos cujo conteúdo é DERIVADO do bundle — os std-*.md raiz
 * materializados, cujo `enforcement.linter` é retargetado na cópia. Agents
 * (preenchidos no deploy) ficam fora.
 *
 * Lib API:
 *   hashFile(path) -> string|null
 *   decideArtifact({projHash, pluginHash, recorded, registry}) -> {action}
 *   loadManifest(projectRoot) / saveManifest(projectRoot, manifest)
 *   resolveArtifacts({projectRoot, pluginRoot, baseSkills}) -> [{src, dest, framework}]
 *   applySync({projectRoot, pluginRoot, artifacts, registry, sourceVersion}) -> report
 *   loadRegistry(pluginRoot) -> Set<string>
 *
 * CLI:
 *   node provenance-sync.mjs apply --project=<root> --plugin=<root> [--base-skills=a,b]
 */
import { createHash } from "node:crypto";
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, lstatSync, readdirSync,
} from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { isWithinDir } from "./path-guard.mjs";
import { frameworkContributions } from "./detect-framework.mjs";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function hashFile(path) {
  try { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
  catch { return null; }
}

// Decisão pura. registry é um Set<string> de hashes históricos.
export function decideArtifact({ projHash, pluginHash, recorded, registry }) {
  if (pluginHash == null) return { action: "skip" };
  if (projHash == null) return { action: "add" };
  if (projHash === pluginHash) return { action: "current" };
  if (recorded != null) return { action: projHash === recorded ? "untouched" : "edited" };
  return { action: registry && registry.has(projHash) ? "untouched" : "edited" };
}

function manifestPath(projectRoot) { return join(projectRoot, ".context", ".provenance.json"); }

export function loadManifest(projectRoot) {
  const p = manifestPath(projectRoot);
  if (!existsSync(p)) return { schema: 1, artifacts: [] };
  try {
    const d = JSON.parse(readFileSync(p, "utf-8"));
    if (!d || !Array.isArray(d.artifacts)) return { schema: 1, artifacts: [] };
    return { schema: d.schema ?? 1, artifacts: d.artifacts };
  } catch { return { schema: 1, artifacts: [] }; }
}

export function saveManifest(projectRoot, manifest) {
  const p = manifestPath(projectRoot);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ schema: 1, artifacts: manifest.artifacts }, null, 2) + "\n");
}

function isSymlink(p) { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } }

function walkFiles(root, sub, out) {
  let entries;
  try { entries = readdirSync(join(root, sub), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const rel = sub ? join(sub, e.name) : e.name;
    if (e.isDirectory()) walkFiles(root, rel, out);
    else if (e.isFile()) out.push(rel);
  }
}

// Resolve a lista de artefatos VERBATIM (skills + standards de profile) a partir
// dos profiles detectados. NÃO inclui agents nem std-*.md raiz.
export function resolveArtifacts({ projectRoot, pluginRoot, baseSkills = [] }) {
  const c = frameworkContributions(projectRoot, pluginRoot);
  const arts = [];

  // Origem por slug: skill base vive em skills/; skill de perfil, em
  // assets/skills/profiles/<fw>/ (ADR-008 v1.1.0 — localizacao e o contrato de
  // registro). O dest NUNCA e derivado do rel do src: derivar produziria
  // .context/assets/skills/profiles/... A origem e o destino sao independentes.
  const sources = new Map(); // slug -> { sub, framework }
  for (const slug of baseSkills) {
    sources.set(slug, { sub: join("skills", slug), framework: "skill" });
  }
  for (const { slug, framework } of c.skillsWithOrigin || []) {
    sources.set(slug, { sub: join("assets", "skills", "profiles", framework, slug), framework });
  }

  for (const [slug, { sub, framework }] of sources) {
    const files = [];
    walkFiles(pluginRoot, sub, files);
    for (const rel of files) {
      const inner = relative(sub, rel); // caminho DENTRO da skill (preserva references/)
      arts.push({
        src: join(pluginRoot, rel),
        dest: join(projectRoot, ".context", "skills", slug, inner),
        framework,
      });
    }
  }
  for (const { id, framework } of c.standardsWithOrigin || []) {
    const md = join("assets", "standards", "profiles", framework, `${id}.md`);
    arts.push({
      src: join(pluginRoot, md),
      dest: join(projectRoot, ".context", "engineering", "standards", `${id}.md`),
      framework,
    });
    const js = join("assets", "standards", "profiles", framework, "machine", `${id}.js`);
    if (existsSync(join(pluginRoot, js))) {
      arts.push({
        src: join(pluginRoot, js),
        dest: join(projectRoot, ".context", "engineering", "standards", "machine", `${id}.js`),
        framework,
      });
    }
  }
  return arts;
}

export function applySync({ projectRoot, pluginRoot, artifacts, registry, sourceVersion }) {
  const contextRoot = join(projectRoot, ".context");
  const manifest = loadManifest(projectRoot);
  const byPath = new Map(manifest.artifacts.map((a) => [a.path, a]));
  const report = { added: [], updated: [], current: [], preserved: [], refused: [] };

  for (const { src, dest, framework, transform } of artifacts) {
    const rel = relative(projectRoot, dest);
    // Contenção (segurança): src no plugin, dest em .context, sem symlink.
    if (!isWithinDir(src, pluginRoot) || !isWithinDir(dest, contextRoot) || isSymlink(src) || isSymlink(dest)) {
      report.refused.push(rel);
      continue;
    }
    // Artefato com `transform` NAO e verbatim: o conteudo escrito difere da
    // origem. O hash de procedencia tem de ser o dos bytes ESCRITOS — usar o
    // hash da origem classificaria todo projeto como "edited" na 1a passada e
    // congelaria o sync para sempre.
    let bytes = null;
    if (typeof transform === "function") {
      try { bytes = Buffer.from(transform(readFileSync(src, "utf-8")), "utf-8"); }
      catch { bytes = null; }   // origem ilegivel: cai no caminho verbatim, que ja trata
    }
    const projHash = hashFile(dest);
    const pluginHash = bytes ? sha256(bytes) : hashFile(src);
    const recorded = byPath.get(rel)?.hash ?? null;
    const { action } = decideArtifact({ projHash, pluginHash, recorded, registry });

    if (action === "skip") {
      report.refused.push(rel);
    } else if (action === "add" || action === "untouched") {
      mkdirSync(dirname(dest), { recursive: true });
      if (bytes) writeFileSync(dest, bytes);
      else copyFileSync(src, dest);
      byPath.set(rel, { path: rel, hash: pluginHash, sourceVersion, framework });
      (action === "add" ? report.added : report.updated).push(rel);
    } else if (action === "current") {
      byPath.set(rel, { path: rel, hash: pluginHash, sourceVersion, framework });
      report.current.push(rel);
    } else {
      report.preserved.push(rel);
    }
  }
  // Orfao: estava no manifesto mas nenhum perfil ativo contribui mais.
  // Preserva e reporta (ADR-012) — remocao so sob confirmacao humana, fora daqui.
  const contribuidos = new Set(artifacts.map((a) => relative(projectRoot, a.dest)));
  report.orphaned = [];
  for (const [rel, rec] of byPath) {
    if (contribuidos.has(rel)) continue;
    const projHash = hashFile(join(projectRoot, rel));
    if (projHash == null) continue;               // ja nao existe em disco
    const intocado = projHash === rec.hash || (registry && registry.has(projHash));
    report.orphaned.push({ path: rel, verdict: intocado ? "untouched" : "diverged" });
  }

  saveManifest(projectRoot, { schema: 1, artifacts: [...byPath.values()] });
  return report;
}

/**
 * Aposentados — artefatos que o plugin JA distribuiu e nao distribui mais.
 *
 * Existe porque o manifesto de proveniencia cobre SO skills e standards de
 * perfil: agents ficam de fora por design (sao preenchidos no deploy). Sem
 * isto, o unico artefato que a revogacao de agents realmente orfana seria
 * invisivel ao sync. NUNCA remove — so reporta (ADR-012).
 *
 * `pristine`: true = hash no registry (copia intocada, remocao segura);
 *             false = hash conhecido e ausente do registry (divergente);
 *             null = nao ha hash (diretorio) — admitir que nao sabe, nao chutar.
 */
export function detectRetired({ projectRoot, pluginRoot, registry }) {
  const p = join(pluginRoot, "assets", "provenance", "retired.json");
  if (!existsSync(p)) return [];
  let lista;
  try { lista = JSON.parse(readFileSync(p, "utf-8")).retired; } catch { return []; }
  if (!Array.isArray(lista)) return [];

  const contextRoot = join(projectRoot, ".context");
  const achados = [];
  for (const item of lista) {
    if (!item || typeof item.path !== "string") continue;
    const abs = join(projectRoot, item.path);
    // Mesma contencao do applySync: nada fora de .context/, nada via symlink.
    if (!isWithinDir(abs, contextRoot) || isSymlink(abs) || !existsSync(abs)) continue;
    const h = hashFile(abs); // null para diretorio
    const pristine = h == null ? null : Boolean(registry && registry.has(h));
    achados.push({ path: item.path, since: item.since, reason: item.reason, pristine });
  }
  return achados;
}

export function loadRegistry(pluginRoot) {
  const p = join(pluginRoot, "assets", "provenance", "known-hashes.json");
  if (!existsSync(p)) return new Set();
  try {
    const d = JSON.parse(readFileSync(p, "utf-8"));
    return new Set(Array.isArray(d.hashes) ? d.hashes : []);
  } catch { return new Set(); }
}

function arg(name) {
  const h = process.argv.find((a) => a.startsWith(`--${name}=`));
  return h ? h.slice(h.indexOf("=") + 1) : null;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === "apply") {
    const projectRoot = resolve(arg("project"));
    const pluginRoot = resolve(arg("plugin"));
    const baseSkills = (arg("base-skills") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const artifacts = resolveArtifacts({ projectRoot, pluginRoot, baseSkills });
    const pkg = JSON.parse(readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf-8"));
    const report = applySync({ projectRoot, pluginRoot, artifacts, registry: loadRegistry(pluginRoot), sourceVersion: pkg.version });
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.error("Usage: provenance-sync.mjs apply --project=<root> --plugin=<root> [--base-skills=a,b]");
    process.exit(1);
  }
}
