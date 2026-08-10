// Unit da lib provenance-sync. Run: node --test tests/integration/test-provenance-sync.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import {
  hashFile, decideArtifact, loadManifest, saveManifest, applySync, resolveArtifacts,
  detectRetired,
} from "../../scripts/lib/provenance-sync.mjs";

const REPO = resolve(import.meta.dirname, "../..");
function mk() {
  return { plug: mkdtempSync(join(tmpdir(), "prov-plug-")), proj: mkdtempSync(join(tmpdir(), "prov-proj-")) };
}

describe("decideArtifact — 7 linhas", () => {
  const reg = new Set(["HIST"]);
  const d = (o) => decideArtifact(o).action;
  it("pluginHash null → skip", () => assert.equal(d({ projHash: "A", pluginHash: null, recorded: null, registry: reg }), "skip"));
  it("ausente → add", () => assert.equal(d({ projHash: null, pluginHash: "P", recorded: null, registry: reg }), "add"));
  it("igual plugin → current", () => assert.equal(d({ projHash: "P", pluginHash: "P", recorded: "X", registry: reg }), "current"));
  it("recorded==proj → untouched", () => assert.equal(d({ projHash: "A", pluginHash: "P", recorded: "A", registry: reg }), "untouched"));
  it("recorded!=proj → edited", () => assert.equal(d({ projHash: "A", pluginHash: "P", recorded: "B", registry: reg }), "edited"));
  it("sem recorded & registry hit → untouched", () => assert.equal(d({ projHash: "HIST", pluginHash: "P", recorded: null, registry: reg }), "untouched"));
  it("sem recorded & registry miss → edited", () => assert.equal(d({ projHash: "Z", pluginHash: "P", recorded: null, registry: reg }), "edited"));
});

describe("hashFile + manifesto roundtrip", () => {
  it("hashFile estável e null em erro", () => {
    const dir = mkdtempSync(join(tmpdir(), "prov-h-"));
    const f = join(dir, "a"); writeFileSync(f, "abc");
    assert.match(hashFile(f), /^[0-9a-f]{64}$/);
    assert.equal(hashFile(join(dir, "nope")), null);
  });
  it("load default + roundtrip", () => {
    const proj = mkdtempSync(join(tmpdir(), "prov-m-"));
    assert.deepEqual(loadManifest(proj), { schema: 1, artifacts: [] });
    const m = { schema: 1, artifacts: [{ path: ".context/x.md", hash: "H", sourceVersion: "1.0.0", framework: "odoo" }] };
    saveManifest(proj, m);
    assert.ok(existsSync(join(proj, ".context", ".provenance.json")));
    assert.deepEqual(loadManifest(proj), m);
  });
});

describe("applySync — efeitos", () => {
  it("add / untouched(registry) / edited(preserva); report relativo", () => {
    const { plug, proj } = mk();
    for (const n of ["new", "stale", "edited"]) { mkdirSync(join(plug, n), { recursive: true }); writeFileSync(join(plug, n, "S.md"), `PLUG-${n}-v2`); }
    mkdirSync(join(proj, ".context", "stale"), { recursive: true }); writeFileSync(join(proj, ".context", "stale", "S.md"), "ANTIGO");
    mkdirSync(join(proj, ".context", "edited"), { recursive: true }); writeFileSync(join(proj, ".context", "edited", "S.md"), "USER");
    const registry = new Set([hashFile(join(proj, ".context", "stale", "S.md"))]);
    const artifacts = ["new", "stale", "edited"].map((n) => ({ src: join(plug, n, "S.md"), dest: join(proj, ".context", n, "S.md"), framework: "odoo" }));
    const r = applySync({ projectRoot: proj, pluginRoot: plug, artifacts, registry, sourceVersion: "2.0.0" });
    assert.ok(r.added.some((p) => p.endsWith("new/S.md")));
    assert.ok(r.updated.some((p) => p.endsWith("stale/S.md")));
    assert.ok(r.preserved.some((p) => p.endsWith("edited/S.md")));
    assert.ok([...r.added, ...r.updated].every((p) => !p.startsWith("/")), "report relativo");
    assert.equal(readFileSync(join(proj, ".context", "stale", "S.md"), "utf-8"), "PLUG-stale-v2");
    assert.equal(readFileSync(join(proj, ".context", "edited", "S.md"), "utf-8"), "USER");
  });
});

describe("applySync — segurança (contenção)", () => {
  it("traversal de dest/src → refused, nada escrito fora", () => {
    const { plug, proj } = mk();
    mkdirSync(join(plug, "ok"), { recursive: true }); writeFileSync(join(plug, "ok", "S.md"), "X");
    const artifacts = [
      { src: join(plug, "ok", "S.md"), dest: join(proj, ".context", "..", "escape.md"), framework: "odoo" },
      { src: join(plug, "..", "outside.md"), dest: join(proj, ".context", "z.md"), framework: "odoo" },
    ];
    const r = applySync({ projectRoot: proj, pluginRoot: plug, artifacts, registry: new Set(), sourceVersion: "2.0.0" });
    assert.equal(r.refused.length, 2);
    assert.ok(!existsSync(join(proj, "escape.md")), "não escreveu fora de .context");
  });
  it("src symlink → refused", () => {
    const { plug, proj } = mk();
    writeFileSync(join(plug, "real.md"), "R"); symlinkSync(join(plug, "real.md"), join(plug, "link.md"));
    const artifacts = [{ src: join(plug, "link.md"), dest: join(proj, ".context", "x.md"), framework: "odoo" }];
    const r = applySync({ projectRoot: proj, pluginRoot: plug, artifacts, registry: new Set(), sourceVersion: "2.0.0" });
    assert.equal(r.refused.length, 1);
    assert.ok(!existsSync(join(proj, ".context", "x.md")));
  });
});

// Fixture: projeto que CASA com o perfil odoo (detect.files: __manifest__.py).
// Sem o marcador nenhum perfil fica ativo e as asserções passariam VAZIAS.
function projetoOdoo(prefixo = "prov-res-") {
  const proj = mkdtempSync(join(tmpdir(), prefixo));
  mkdirSync(join(proj, "addons", "x"), { recursive: true });
  writeFileSync(join(proj, "addons", "x", "__manifest__.py"), "{'name':'x'}");
  return proj;
}

describe("resolveArtifacts", () => {
  it("inclui skills e standards de profile; exclui agents; src no plugin", () => {
    const proj = projetoOdoo();
    const arts = resolveArtifacts({ projectRoot: proj, pluginRoot: REPO, baseSkills: [] });
    assert.ok(arts.some((a) => a.dest.includes(`${join(".context", "skills", "odoo-development")}`)));
    assert.ok(arts.some((a) => a.dest.includes(`${join(".context", "engineering", "standards", "std-odoo-naming-conventions.md")}`)));
    assert.ok(arts.every((a) => !a.dest.includes(`${join(".context", "agents")}`)), "agents fora");
    assert.ok(arts.every((a) => a.src.startsWith(REPO)), "src no plugin");
  });
});

describe("resolveArtifacts é source-aware por slug", () => {
  it("skill de perfil resolve de assets/skills/profiles/<fw>/ com dest em .context/skills/", () => {
    const arts = resolveArtifacts({
      projectRoot: projetoOdoo("prov-src-"), pluginRoot: REPO, baseSkills: [],
    });
    const dev = arts.find((a) => a.src.includes("odoo-development"));
    assert.ok(dev, "odoo-development deveria ser contribuída pelo perfil odoo");
    assert.match(dev.src, /assets[/\\]skills[/\\]profiles[/\\]odoo[/\\]odoo-development[/\\]SKILL\.md$/);
    assert.match(dev.dest, /\.context[/\\]skills[/\\]odoo-development[/\\]SKILL\.md$/);
    assert.equal(dev.framework, "odoo");
    // O dest NUNCA pode carregar o path de ORIGEM: derivá-lo do rel do src
    // produziria .context/assets/skills/profiles/... — o defeito que a T4 corrige.
    // Checar o SEGMENTO, não a substring: um arquivo pode legitimamente se
    // chamar "module-and-assets.md" sem que isso seja vazamento de path.
    const VAZAMENTO = new RegExp(`\\.context[/\\\\]${["assets", "skills", "profiles"].join("[/\\\\]")}`);
    for (const a of arts) {
      assert.ok(!VAZAMENTO.test(a.dest), `dest carregou o path de origem: ${a.dest}`);
    }
  });

  it("preserva a estrutura interna da skill (references/ não achatado)", () => {
    const arts = resolveArtifacts({
      projectRoot: projetoOdoo("prov-nest-"), pluginRoot: REPO, baseSkills: [],
    });
    const ref = arts.find((a) => a.src.includes("odoo-l10n-br") && a.src.includes("references"));
    assert.ok(ref, "as references/ da skill precisam ser resolvidas");
    assert.match(ref.dest, /\.context[/\\]skills[/\\]odoo-l10n-br[/\\]references[/\\]/);
  });

  it("skill base continua resolvendo de skills/", () => {
    const arts = resolveArtifacts({
      projectRoot: projetoOdoo("prov-base-"), pluginRoot: REPO, baseSkills: ["commit-message"],
    });
    const base = arts.find((a) => a.src.includes("commit-message"));
    assert.ok(base, "skill base deveria ser resolvida");
    assert.match(base.src, /[/\\]skills[/\\]commit-message[/\\]/);
    assert.ok(!base.src.includes(join("assets", "skills")), "skill base não vem de assets/");
    assert.match(base.dest, /\.context[/\\]skills[/\\]commit-message[/\\]/);
    assert.equal(base.framework, "skill");
  });
});

describe("CLI apply", () => {
  it("resolve+aplica via CLI e imprime report", () => {
    const proj = mkdtempSync(join(tmpdir(), "prov-cli-"));
    mkdirSync(join(proj, "addons", "x"), { recursive: true });
    writeFileSync(join(proj, "addons", "x", "__manifest__.py"), "{'name':'x'}");
    const CLI = resolve(import.meta.dirname, "../../scripts/lib/provenance-sync.mjs");
    const out = execFileSync("node", [CLI, "apply", `--project=${proj}`, `--plugin=${REPO}`], { encoding: "utf-8" });
    const r = JSON.parse(out);
    assert.ok(Array.isArray(r.added));
    assert.ok(existsSync(join(proj, ".context", "skills", "odoo-development", "SKILL.md")), "skill copiada");
  });
});

const ORFAO = join(".context", "skills", "odoo-nxz-overlay", "SKILL.md");

// Fixture: projeto com manifesto de proveniência E o artefato materializado em
// disco — sem o arquivo real, applySync pula o órfão (projHash == null).
// `recordedHash` permite gravar um hash DIFERENTE do conteúdo, que é como se
// simula um artefato editado localmente.
function projetoComManifesto({ recordedHash = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prov-orf-"));
  const abs = join(root, ORFAO);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, "conteudo do artefato\n");
  const real = createHash("sha256").update(readFileSync(abs)).digest("hex");
  mkdirSync(join(root, ".context"), { recursive: true });
  writeFileSync(
    join(root, ".context", ".provenance.json"),
    JSON.stringify({
      schema: 1,
      artifacts: [{ path: ORFAO, hash: recordedHash ?? real, framework: "nxz" }],
    }, null, 2) + "\n",
  );
  return { root, real };
}

describe("detecção de órfão", () => {
  it("artefato no manifesto que nenhum perfil contribui é reportado e NÃO removido", () => {
    const { root } = projetoComManifesto();          // manifesto grava o hash real
    const report = applySync({
      projectRoot: root, pluginRoot: REPO,
      artifacts: [],                                 // nenhum perfil ativo contribui
      registry: new Set(), sourceVersion: "3.0.0",
    });
    assert.deepEqual(report.orphaned.map((o) => o.path), [ORFAO]);
    assert.equal(report.orphaned[0].verdict, "untouched");
    assert.equal(existsSync(join(root, ORFAO)), true, "órfão NUNCA é removido pelo sync");
  });

  it("órfão com conteúdo divergente é marcado diverged", () => {
    // manifesto guarda hash de uma versão anterior; o disco tem outro conteúdo
    const { root } = projetoComManifesto({ recordedHash: "0".repeat(64) });
    const report = applySync({
      projectRoot: root, pluginRoot: REPO, artifacts: [],
      registry: new Set(), sourceVersion: "3.0.0",   // e o hash real não está no registry
    });
    assert.equal(report.orphaned[0].verdict, "diverged");
    assert.equal(existsSync(join(root, ORFAO)), true, "divergente também é preservado");
  });

  it("artefato ainda contribuído NÃO é órfão", () => {
    const { root, real } = projetoComManifesto();
    const report = applySync({
      projectRoot: root, pluginRoot: REPO,
      artifacts: [{ src: join(REPO, "skills", "commit-message", "SKILL.md"), dest: join(root, ORFAO), framework: "nxz" }],
      registry: new Set([real]), sourceVersion: "3.0.0",
    });
    assert.deepEqual(report.orphaned, [], "o que o perfil contribui não pode ser órfão");
  });
});

describe("aposentados alcançam classes fora do manifesto", () => {
  it("o agente de perfil retirado é detectado, ainda que agents nunca entrem no manifesto", () => {
    const root = mkdtempSync(join(tmpdir(), "prov-ret-"));
    const agente = join(root, ".context", "agents", "odoo-specialist.md");
    mkdirSync(dirname(agente), { recursive: true });
    writeFileSync(agente, "---\ntype: agent\nname: odoo-specialist\n---\n");

    const achados = detectRetired({ projectRoot: root, pluginRoot: REPO, registry: new Set() });
    const alvo = achados.find((r) => r.path.endsWith(join("agents", "odoo-specialist.md")));

    assert.ok(alvo, "o agente aposentado precisa ser detectado sem depender do manifesto");
    assert.equal(alvo.pristine, false, "hash conhecido e ausente do registry → divergente");
    assert.match(alvo.reason, /agents/i);
    assert.equal(existsSync(agente), true, "aposentado NUNCA é removido pela detecção");
  });

  it("deploy intocado é reconhecido como pristine pelo registry", () => {
    const root = mkdtempSync(join(tmpdir(), "prov-ret-ok-"));
    const agente = join(root, ".context", "agents", "odoo-specialist.md");
    mkdirSync(dirname(agente), { recursive: true });
    const corpo = "---\ntype: agent\nname: odoo-specialist\n---\n";
    writeFileSync(agente, corpo);
    const h = createHash("sha256").update(corpo).digest("hex");

    const achados = detectRetired({ projectRoot: root, pluginRoot: REPO, registry: new Set([h]) });
    const alvo = achados.find((r) => r.path.endsWith(join("agents", "odoo-specialist.md")));
    assert.equal(alvo.pristine, true, "hash no registry → cópia intocada, remoção segura");
  });

  it("diretório aposentado é reportado com pristine null (não dá para hashear)", () => {
    const root = mkdtempSync(join(tmpdir(), "prov-ret-dir-"));
    mkdirSync(join(root, ".context", "skills", "nxz-go-test"), { recursive: true });
    const achados = detectRetired({ projectRoot: root, pluginRoot: REPO, registry: new Set() });
    const alvo = achados.find((r) => r.path.endsWith(join("skills", "nxz-go-test")));
    assert.ok(alvo, "diretório aposentado precisa ser detectado");
    assert.equal(alvo.pristine, null, "diretório não é hasheável — admitir que não sabe, não chutar");
  });

  it("não reporta nada quando o projeto não tem artefato aposentado", () => {
    const root = mkdtempSync(join(tmpdir(), "prov-ret-limpo-"));
    mkdirSync(join(root, ".context"), { recursive: true });
    assert.deepEqual(detectRetired({ projectRoot: root, pluginRoot: REPO, registry: new Set() }), []);
  });
});
