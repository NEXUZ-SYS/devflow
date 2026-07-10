// tests/assets/test-release-scaffold-guards.test.mjs
// Task B do plano config-release-scaffold: guard-tests sobre os assets v1.
//
// Os assets são copiados VERBATIM para o repo do usuário e rodam na CI DELE.
// Estes guards travam as invariantes que o ADR-012 v1.1.0 exige:
//   - a CI não alcança o plugin (sem CLAUDE_PLUGIN_ROOT)
//   - nenhum hardcode específico do plugin devflow (anti-hardcode, N1)
//   - superfície de gatilho mínima (sem pull_request_target)
//   - nada de ${{ }} interpolado dentro de `run:` (indireção por env:)
//   - a versão vem do bump-version.sh, nunca de um grep de manifest
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ASSET_DIR = join(ROOT, "assets", "release-scaffold");
const RELEASE_YML = join(ASSET_DIR, "release.yml");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const read = (p) => readFileSync(p, "utf8");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/**
 * Remove linhas de comentário. O guard tem que avaliar o COMPORTAMENTO do
 * workflow, não a prosa: um comentário que diz "nada de pull_request_target"
 * não é um uso de pull_request_target.
 */
const stripComments = (yml) =>
  yml
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

/** Remove a indentação comum, como o YAML faz com um escalar de bloco. */
function dedent(lines) {
  const meaningful = lines.filter((l) => l.trim() !== "");
  if (meaningful.length === 0) return lines;
  const min = Math.min(...meaningful.map((l) => l.match(/^(\s*)/)[1].length));
  return lines.map((l) => l.slice(min));
}

/**
 * Extrai o corpo de cada bloco `run:` do workflow, DEDENTADO — que é o script
 * que o runner realmente executa. Sem dedentar, um terminador de heredoc
 * indentado (`  EOF`) pareceria válido aqui e quebraria só na CI do usuário.
 * Suporta `run: |`, `run: >` (escalares literais/folded) e `run: <comando>` inline.
 */
function runBlocks(yml) {
  const lines = yml.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)run:\s*[|>][-+]?\s*$/);
    if (m) {
      const indent = m[1].length;
      const body = [];
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (l.trim() === "") {
          body.push(l);
          continue;
        }
        if (l.match(/^(\s*)/)[1].length <= indent) break;
        body.push(l);
      }
      blocks.push(dedent(body).join("\n"));
      continue;
    }
    const inline = lines[i].match(/^\s*run:\s+(?![|>])(.+)$/);
    if (inline) blocks.push(inline[1]);
  }
  return blocks;
}

/** Chaves imediatas do bloco `on:` do workflow. */
function onTriggers(yml) {
  const lines = yml.split("\n");
  const start = lines.findIndex((l) => /^on:\s*$/.test(l));
  assert.ok(start !== -1, "workflow não tem um bloco `on:` em bloco");
  const triggers = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === "" || l.trim().startsWith("#")) continue;
    const m = l.match(/^(\s+)([A-Za-z_]+):/);
    if (!m) break;
    if (m[1].length === 2) triggers.push(m[2]);
  }
  return triggers;
}

test("B.1a nenhum arquivo do scaffold referencia CLAUDE_PLUGIN_ROOT", () => {
  const files = walk(ASSET_DIR);
  assert.ok(files.length > 0, "assets/release-scaffold/ está vazio");
  for (const f of files) {
    assert.ok(
      !read(f).includes("CLAUDE_PLUGIN_ROOT"),
      `${f} referencia CLAUDE_PLUGIN_ROOT — a CI do usuário não alcança o plugin`,
    );
  }
});

test("B.1b o staging cobre o CHANGELOG.md cortado (fix #71)", () => {
  const blocks = runBlocks(read(RELEASE_YML)).join("\n");
  const stagesEverything = /git add -A\b/.test(blocks);
  const stagesFilesList = /git add\b[^\n]*\$\{?FILES\}?/.test(blocks);
  assert.ok(
    stagesEverything || stagesFilesList,
    "o release PR precisa stagear o corte do CHANGELOG (git add -A ou a lista $FILES); " +
      "senão o bump sobe com o CHANGELOG intacto (drift — bug #71)",
  );
});

test("B.1c sem pull_request_target e sem pull_request", () => {
  const yml = read(RELEASE_YML);
  assert.ok(
    !stripComments(yml).includes("pull_request_target"),
    "pull_request_target dá acesso a secrets com código de fork — proibido",
  );
  const triggers = onTriggers(yml);
  assert.deepEqual(
    triggers,
    ["workflow_dispatch"],
    `superfície de gatilho deve ser só workflow_dispatch, veio: ${triggers.join(", ")}`,
  );
});

test("B.1d o input `bump` é type: choice", () => {
  const yml = read(RELEASE_YML);
  const bumpBlock = yml.slice(yml.indexOf("bump:"), yml.indexOf("permissions:"));
  assert.match(bumpBlock, /type:\s*choice/, "input `bump` deve ser type: choice (enum fechado)");
  for (const opt of ["patch", "minor", "major"]) {
    assert.ok(bumpBlock.includes(`- ${opt}`), `opção '${opt}' ausente do enum`);
  }
});

test("B.1e nenhum ${{ }} é interpolado dentro de um `run:` — indireção por env:", () => {
  const blocks = runBlocks(read(RELEASE_YML));
  assert.ok(blocks.length > 0, "não encontrei nenhum bloco `run:`");
  for (const b of blocks) {
    assert.ok(
      !b.includes("${{"),
      `expressão \${{ }} interpolada dentro de um run: — use env: e cite "$VAR".\nBloco:\n${b}`,
    );
  }
});

test("B.1e2 o bump é invocado com o valor vindo de env: BUMP", () => {
  const yml = read(RELEASE_YML);
  assert.match(yml, /BUMP:\s*\$\{\{\s*inputs\.bump\s*\}\}/, "env: BUMP deve vir de inputs.bump");
  const blocks = runBlocks(yml).join("\n");
  assert.match(blocks, /bash scripts\/bump-version\.sh "\$BUMP"/, 'run: deve chamar bash scripts/bump-version.sh "$BUMP"');
});

test("B.1f permissions é o mínimo necessário", () => {
  const yml = read(RELEASE_YML);
  const block = yml.slice(yml.indexOf("permissions:"), yml.indexOf("jobs:"));
  const perms = block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l !== "permissions:");
  assert.deepEqual(
    perms.sort(),
    ["contents: write", "pull-requests: write"],
    `permissions deve ser exatamente contents:write + pull-requests:write, veio: ${perms.join(" | ")}`,
  );
});

test("B.1g changelog-cut.mjs do asset é byte-idêntico ao de scripts/lib na criação", () => {
  const assetCut = readFileSync(join(ASSET_DIR, "lib", "changelog-cut.mjs"));
  const libCut = readFileSync(join(ROOT, "scripts", "lib", "changelog-cut.mjs"));
  assert.equal(
    sha256(assetCut),
    sha256(libCut),
    "o asset deve nascer como cópia verbatim de scripts/lib/changelog-cut.mjs " +
      "(garante a origem; não é um contrato de sincronia futura)",
  );
});

test("B.1h [N1] nenhum hardcode específico do plugin nos assets", () => {
  const denylist = [".claude-plugin", ".cursor-plugin", "marketplace.json", "known-hashes"];
  for (const f of walk(ASSET_DIR)) {
    const content = read(f);
    for (const needle of denylist) {
      assert.ok(
        !content.includes(needle),
        `${f} contém '${needle}' — o asset roda no repo do USUÁRIO, não no plugin`,
      );
    }
  }
});

test("B.1h2 [N1] o release.yml não grepa manifest fixo", () => {
  const blocks = runBlocks(read(RELEASE_YML)).join("\n");
  assert.ok(!/grep[^\n]*plugin\.json/.test(blocks), "grep de plugin.json — manifest fixo do plugin");
  assert.ok(
    !/grep[^\n]*version/i.test(blocks),
    "o workflow não pode derivar a versão de um grep; ela vem do bump-version.sh",
  );
});

test("B.1i [N1] a versão nova vem de steps.<id>.outputs.version", () => {
  const yml = read(RELEASE_YML);
  assert.match(
    yml,
    /\$\{\{\s*steps\.[A-Za-z0-9_-]+\.outputs\.version\s*\}\}/,
    "a versão deve ser consumida de steps.<id>.outputs.version (emitida pelo bump-version.sh via $GITHUB_OUTPUT)",
  );
});

test("B.1k cada bloco `run:` é bash sintaticamente válido", () => {
  const blocks = runBlocks(read(RELEASE_YML));
  assert.ok(blocks.length > 0, "não encontrei nenhum bloco `run:`");
  blocks.forEach((b, i) => {
    const r = spawnSync("bash", ["-n"], { input: b, encoding: "utf8" });
    assert.equal(
      r.status,
      0,
      `bloco run: #${i + 1} não é bash válido (heredoc mal terminado?): ${r.stderr}\n---\n${b}`,
    );
  });
});

test("B.1j [N1] o staging é genérico — sem pathspec fixo", () => {
  const blocks = runBlocks(read(RELEASE_YML)).join("\n");
  const addLines = blocks.split("\n").filter((l) => /\bgit add\b/.test(l));
  assert.ok(addLines.length > 0, "nenhum `git add` encontrado");
  for (const l of addLines) {
    assert.ok(
      /git add -A\b/.test(l) || /\$\{?FILES\}?/.test(l),
      `pathspec fixo em '${l.trim()}' — o staging deve ser genérico (git add -A ou $FILES)`,
    );
  }
});
