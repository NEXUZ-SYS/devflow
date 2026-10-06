// tests/lib/test-standards-gates.mjs — oferta dos gates de standards ao projeto (spec §3.7, T19).
//
// O que vai para o projeto-cliente: o shim e os arquivos de CI (assets FIXOS, ADR-012), o pin da
// versão do plugin, os trechos de pre-commit e de CODEOWNERS e a entrada `verify.standards`. O
// CLI só imprime — quem escreve é a skill, depois do consentimento.
// Os scripts dos assets são executados de verdade em tests/integration/test-standards-gates-ci.mjs.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import {
  SHIM_TARGET, PIN_TARGET, PIN_RE, GITHUB_WORKFLOW_TARGET, GITLAB_CI_TARGET,
  detectHookManager, preCommitSnippet, githubActionsSnippet, gitlabSnippet, pluginPin, codeownersSnippet,
  verifyEntry, pluginVersion, shimSource, gatesOffer,
} from "../../scripts/lib/standards-gates.mjs";
import { codeownersRules, codeownersPatternRegex, ratchetOwners } from "../../scripts/lib/standards-label-approval.mjs";
import { readVerify } from "../../scripts/lib/devflow-config.mjs";
import { runStandardsCommand } from "../../scripts/lib/standards-check-cli.mjs";
import { scaffoldFiles, genFromWorkingTree } from "../../scripts/lib/gen-known-hashes.mjs";
import { demoProject, isolateFromDefaults } from "../helpers/standards-fixture.mjs";
import { stripComments, childLines, triggers, mapOf, steps, gitlabScript } from "../helpers/workflow-yaml.mjs";

const PLUGIN = process.cwd();
const CLI = join(PLUGIN, "scripts/lib/standards-gates.mjs");
const SHIM_CMD = "node .context/bin/devflow-standards.mjs check --staged";
const TEMPS = [];
const tmp = (prefix = "g-") => { const d = mkdtempSync(join(tmpdir(), prefix)); TEMPS.push(d); return d; };
after(() => { for (const d of TEMPS) rmSync(d, { recursive: true, force: true }); });
const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function project({ remote = "git@github.com:acme/app.git" } = {}) {
  const root = demoProject(); TEMPS.push(root);
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  if (remote) git(root, "remote", "add", "origin", remote);
  return root;
}

// Tudo o que há sob `dir` (inclusive o .git): caminho → tipo, tamanho, mtime e hash.
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n), st = lstatSync(p), rel = relative(dir, p);
      if (st.isDirectory()) { out[`${rel}/`] = "dir"; walk(p); }
      else out[rel] = st.isFile() ? `${st.size}:${st.mtimeMs}:${sha256(readFileSync(p))}` : "outro";
    }
  };
  walk(dir);
  return out;
}

const GH = githubActionsSnippet();
const GL = gitlabSnippet();
const VERBATIM = {
  shim: { asset: "assets/standards/bin/devflow-standards.mjs", to: ".context/bin/devflow-standards.mjs" },
  githubActions: { asset: "assets/standards/ci/github-actions.yml", to: ".github/workflows/devflow-standards.yml" },
  gitlab: { asset: "assets/standards/ci/gitlab-ci.yml", to: ".gitlab/ci/devflow-standards.yml" },
};

// ── pre-commit ──────────────────────────────────────────────────────────────────────

test("detecta lefthook, husky e pre-commit", () => {
  const a = tmp(); writeFileSync(join(a, "lefthook.yml"), "");
  const b = tmp(); mkdirSync(join(b, ".husky"));
  const c = tmp(); writeFileSync(join(c, ".pre-commit-config.yaml"), "");
  assert.deepEqual([detectHookManager(a), detectHookManager(b), detectHookManager(c)], ["lefthook", "husky", "pre-commit"]);
  assert.equal(detectHookManager(tmp()), null);
  const d = tmp(); writeFileSync(join(d, ".lefthook.yaml"), "");
  assert.equal(detectHookManager(d), "lefthook");
});

test("pre-commit chama o shim do projeto, não claude plugin path", () => {
  for (const m of ["lefthook", "husky", "pre-commit", null]) {
    const s = preCommitSnippet(m).content;
    assert.match(s, /node \.context\/bin\/devflow-standards\.mjs check --staged/);
    assert.doesNotMatch(s, /claude plugin path|CLAUDE_PLUGIN_ROOT/);
  }
  assert.equal(preCommitSnippet("husky").file, ".husky/pre-commit");
  assert.equal(preCommitSnippet("pre-commit").file, ".pre-commit-config.yaml");
  assert.equal(preCommitSnippet("lefthook").file, "lefthook.yml");
  assert.equal(preCommitSnippet(null).file, "lefthook.yml", "sem gerenciador, a oferta é o lefthook");
  assert.throws(() => preCommitSnippet("outro"), /gerenciador/);
});

test("o comando instalado é o mesmo nos três gerenciadores", () => {
  const husky = preCommitSnippet("husky").content.trim();
  const lefthook = preCommitSnippet("lefthook").content.match(/^\s+run: (.+)$/m)[1];
  const preCommit = preCommitSnippet("pre-commit").content.match(/^\s+entry: (.+)$/m)[1];
  assert.deepEqual([husky, lefthook, preCommit], [SHIM_CMD, SHIM_CMD, SHIM_CMD]);
  assert.match(preCommitSnippet("pre-commit").content, /pass_filenames: false/, "o check lê o índice; não recebe nomes de arquivo");
});

// ── GitHub Actions ──────────────────────────────────────────────────────────────────

test("GitHub: roda no PR e de novo quando o rótulo ou o review mudam", () => {
  assert.deepEqual(triggers(GH), {
    pull_request: ["opened", "synchronize", "reopened", "labeled", "unlabeled"],
    pull_request_review: ["submitted", "dismissed"],
  });
  assert.doesNotMatch(stripComments(GH), /pull_request_target/, "pull_request_target daria segredo a código de fork");
});

test("GitHub: permissões mínimas, declaradas uma vez; checkout do plugin sem token", () => {
  assert.deepEqual(mapOf(GH, "permissions"), { contents: "read", "pull-requests": "read" });
  assert.equal((stripComments(GH).match(/^\s*permissions:/gm) || []).length, 1, "nenhum job amplia as permissões");
  assert.doesNotMatch(GH, /token:/, "repositório público: checkout sem token");
  assert.doesNotMatch(stripComments(GH), /\bwrite\b/);
});

test("GitHub: job próprio — merge do PR com histórico completo e plugin fixado, em diretórios separados", () => {
  const jobs = childLines(GH, "jobs").filter(l => /^ {2}\S/.test(l)).map(l => l.trim().replace(/:.*$/, ""));
  assert.deepEqual(jobs, ["gate"], "um job só, dedicado ao gate");
  const S = steps(GH, "gate");
  assert.deepEqual(S.map(s => s.uses || "run"), ["actions/checkout@v4", "run", "actions/checkout@v4", "actions/setup-node@v4", "run"]);
  const [checkout, pin, plugin] = S;
  assert.deepEqual(checkout.with, {
    ref: "refs/pull/${{ github.event.pull_request.number }}/merge", "fetch-depth": "0", "persist-credentials": "false", path: "project",
  });
  assert.equal(pin.id, "pin");
  assert.deepEqual(plugin.with, {
    repository: "NEXUZ-SYS/devflow", ref: "${{ steps.pin.outputs.ref }}", "persist-credentials": "false", path: "devflow-plugin",
  });
  assert.notEqual(checkout.with.path, plugin.with.path);
});

test("GitHub: nenhum código do PR roda antes do gate", () => {
  const S = steps(GH, "gate");
  for (const s of S) if (s.uses) assert.match(s.uses, /^actions\/(checkout|setup-node)@v\d+$/, "só actions oficiais; nenhuma action local do repositório");
  const runs = S.filter(s => s.run).map(s => s.run);
  assert.equal(runs.length, 2);
  for (const r of runs) {
    assert.doesNotMatch(r, /\b(npm|pnpm|yarn|npx|pip|pip3|make|composer|bundle)\b/, "nada de instalar dependências nem rodar scripts do projeto");
    assert.doesNotMatch(r, /(^|[\s;&|])(bash|sh|source|\.)\s+["']?(\.\/|project\/)/m, "nenhum script do repositório é executado");
  }
  const [pin, gate] = runs;
  assert.doesNotMatch(pin, /\bnode\b/, "o passo do pin só lê com git");
  const nodeCalls = gate.match(/\bnode\b[^\n]*/g) || [];
  assert.equal(nodeCalls.length, 1);
  assert.match(nodeCalls[0], /^node "\$GITHUB_WORKSPACE\/devflow-plugin\/scripts\/devflow-standards\.mjs" gate\b/, "o script do PLUGIN, nunca o shim do projeto");
  assert.doesNotMatch(gate, /\.context\/bin/);
});

test("GitHub: o gate recebe a base pelo ref completo, --ci e o override sempre presente", () => {
  const gate = steps(GH, "gate").at(-1);
  assert.equal(gate["working-directory"], "project");
  assert.deepEqual(gate.env, {
    GH_TOKEN: "${{ github.token }}",
    BASE_BRANCH: "${{ github.event.pull_request.base.ref }}",
    PR_NUMBER: "${{ github.event.pull_request.number }}",
    REPO: "${{ github.repository }}",
  });
  const cmd = gate.run.replace(/\\\n\s*/g, "");
  assert.match(cmd, /devflow-standards\.mjs" gate --base-ref="refs\/remotes\/origin\/\$\{BASE_BRANCH\}" --ci --allow-weakening --pr="\$PR_NUMBER" --repo="\$REPO"\n/);
  // github.base_ref só existe em pull_request: no pull_request_review a base viria vazia.
  assert.doesNotMatch(stripComments(GH), /github\.base_ref/);
});

test("GitHub: nenhum ${{ }} dentro de run: (indireção por env:) e todo run: é bash válido", () => {
  for (const s of steps(GH, "gate").filter(x => x.run)) {
    assert.ok(!s.run.includes("${{"), `expressão interpolada num run:\n${s.run}`);
    const r = spawnSync("bash", ["-n"], { input: s.run, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  }
});

test("GitHub: explica o override, avisa do read:org e não remove rótulo", () => {
  assert.match(GH, /standards-ratchet-approved/);
  assert.match(GH, /read:org/, "dono do tipo @org/time exige token com read:org");
  assert.match(GH, /Require review from Code Owners/);
  assert.doesNotMatch(GH, /remove-label|removeLabel|--remove|DELETE/, "a aprovação é presa ao commit; não há passo que remova o rótulo");
  assert.doesNotMatch(GH, /CLAUDE_PLUGIN_ROOT/, "o CI não alcança o plugin instalado na máquina de ninguém");
});

// ── GitLab ──────────────────────────────────────────────────────────────────────────

test("GitLab: roda o gate contra o SHA da ponta do destino, sem override", () => {
  assert.doesNotMatch(GL, /allow-weakening/, "GitLab não tem override por rótulo");
  assert.match(GL, /SEM OVERRIDE/);
  assert.match(GL, /\$CI_PIPELINE_SOURCE == "merge_request_event"/);
  assert.match(GL, /GIT_DEPTH: "0"/, "a base tem de estar no clone");
  const script = gitlabScript(GL, "devflow-standards");
  // A base é a ponta do destino: a variável de merged results ou, sem ela, o commit buscado do
  // origin. A base do diff do merge request (o ponto em que a branch saiu) não entra no script.
  assert.match(script, /^base="\$\{CI_MERGE_REQUEST_TARGET_BRANCH_SHA:-\}"$/m);
  assert.doesNotMatch(script, /CI_MERGE_REQUEST_DIFF_BASE_SHA/, "a base do diff julgaria o merge request por regras antigas");
  assert.match(script, /devflow-standards\.mjs" gate --base-ref="\$base" --ci\n/);
  // O nome da branch de destino é lido uma vez, validado, e só serve ao fetch — entre aspas e
  // como refspec completo. Sob --ci a base é SHA ou ref completo, nunca o nome curto.
  assert.equal((stripComments(script).match(/\$\{?CI_MERGE_REQUEST_TARGET_BRANCH_NAME/g) || []).length, 1);
  assert.match(script, /^ *target="\$\{CI_MERGE_REQUEST_TARGET_BRANCH_NAME:-\}"$/m);
  assert.match(script, /git check-ref-format --branch "\$target"/);
  assert.match(script, /git fetch --quiet --no-tags origin "refs\/heads\/\$\{target\}"/);
  assert.match(script, /git merge-base --is-ancestor "\$base" HEAD \|\| fail /, "merge request atrás do destino fecha antes do plugin");
  assert.doesNotMatch(script, /--base-ref="?\$\{?(target|CI_MERGE_REQUEST_TARGET_BRANCH_NAME)/, "sob --ci a base é SHA ou ref completo, nunca o nome curto");
  assert.doesNotMatch(script, /\b(npm|pnpm|yarn|npx|pip|make)\b|\.context\/bin\/devflow-standards/);
  assert.match(script, /https:\/\/github\.com\/NEXUZ-SYS\/devflow\.git/);
  assert.equal(spawnSync("sh", ["-n"], { input: script, encoding: "utf8" }).status, 0, "o script é sh válido");
  assert.doesNotMatch(GL, /CLAUDE_PLUGIN_ROOT/);
});

// ── ADR-012: verbatim ───────────────────────────────────────────────────────────────

test("ADR-012: shim e arquivos de CI são assets fixos; a versão do plugin sai do pin, em runtime", () => {
  assert.equal(GH, readFileSync(join(PLUGIN, VERBATIM.githubActions.asset), "utf8"));
  assert.equal(GL, readFileSync(join(PLUGIN, VERBATIM.gitlab.asset), "utf8"));
  assert.equal(shimSource(), join(PLUGIN, VERBATIM.shim.asset));
  // Pedir "com a versão X" não muda um byte: nada é preenchido por projeto.
  assert.equal(githubActionsSnippet({ version: "9.9.9" }), GH);
  assert.equal(gitlabSnippet({ version: "9.9.9" }), GL);
  const version = pluginVersion();
  for (const text of [GH, GL, readFileSync(shimSource(), "utf8")]) {
    assert.ok(!text.includes(version), "a versão do plugin não pode estar escrita no asset");
    assert.doesNotMatch(text, /\{\{\s*[A-Z_]+\s*\}\}|__[A-Z_]{3,}__|<%/, "sem marcador de template");
  }
  for (const text of [GH, GL]) assert.ok(text.includes(PIN_TARGET), "o CI lê a versão do pin do projeto");
  assert.deepEqual([SHIM_TARGET, GITHUB_WORKFLOW_TARGET, GITLAB_CI_TARGET], [VERBATIM.shim.to, VERBATIM.githubActions.to, VERBATIM.gitlab.to]);
});

// O mesmo guard dos assets de release-scaffold (B.1h): o que roda no CI do projeto não conhece
// os arquivos internos do plugin. (O shim fica de fora: existe para achar o plugin na máquina.)
test("ADR-012: os arquivos de CI não trazem caminho interno do plugin", () => {
  for (const text of [GH, GL]) {
    for (const needle of [".claude-plugin", ".cursor-plugin", "marketplace.json", "known-hashes", "installed_plugins"]) {
      assert.ok(!text.includes(needle), `arquivo de CI contém ${needle}`);
    }
  }
});

test("os assets novos entram no registro de proveniência (drift por hash)", () => {
  const files = scaffoldFiles(PLUGIN);
  const known = genFromWorkingTree(PLUGIN);
  for (const { asset } of Object.values(VERBATIM)) {
    assert.ok(files.includes(asset), `${asset} não é indexado; veio: ${files.join(", ")}`);
    assert.ok(known.has(sha256(readFileSync(join(PLUGIN, asset)))), `hash de ${asset} fora do registro`);
  }
});

test("pin: v<versão do plugin> numa linha; só vX.Y.Z ou SHA de 40 dígitos valem", () => {
  assert.deepEqual(pluginPin({ version: "3.4.0" }), { file: ".context/bin/devflow-plugin.ref", content: "v3.4.0\n" });
  assert.equal(pluginPin().content, `v${pluginVersion()}\n`);
  assert.equal(PIN_TARGET, ".context/bin/devflow-plugin.ref");
  for (const bad of ["3.4", "v3.4.0", "3.4.0\n", "3.4.0; rm -rf x", "3.4.0-rc1", "", null, 3]) {
    assert.throws(() => pluginPin({ version: bad }), /versão/, JSON.stringify(bad));
  }
  for (const ok of ["v3.4.0", "v10.20.30", "0123456789abcdef0123456789abcdef01234567"]) assert.ok(PIN_RE.test(ok), ok);
  for (const bad of ["3.4.0", "v3.4", "main", "v3.4.0\n", "v3.4.0 ", "refs/tags/v3.4.0", "0123456789abcdef0123456789abcdef0123456", "0123456789ABCDEF0123456789abcdef01234567", "v1.2.3\nref=x"]) {
    assert.ok(!PIN_RE.test(bad), JSON.stringify(bad));
  }
});

// ── CODEOWNERS ──────────────────────────────────────────────────────────────────────

const RATCHET = [
  ".context/engineering/standards/baseline.json", ".context/engineering/standards/std-demo.md",
  ".context/engineering/standards/machine/std-demo.js", ".context/standards.local.yaml", ".context/.devflow.yaml",
  ".context/bin/devflow-standards.mjs", ".context/bin/devflow-plugin.ref",
];

test("CODEOWNERS: a catraca fica por último, em caminhos ancorados que o gate entende", () => {
  const s = codeownersSnippet("@time");
  assert.match(s, /\.context\/engineering\/standards\/ @time/);
  const rules = codeownersRules(s);
  // Os dois layouts de standards (canônico e legado) têm dono: o gate trata os dois como catraca.
  assert.deepEqual(rules.slice(-5).map(r => r.pattern), [
    "/.context/engineering/standards/", "/.context/standards/", "/.context/standards.local.yaml", "/.context/.devflow.yaml", "/.context/bin/",
  ]);
  assert.deepEqual(rules.slice(0, -5).map(r => r.pattern), ["/.github/workflows/devflow-standards.yml"], "o workflow que julga o PR também tem dono");
  for (const r of rules) {
    assert.ok(codeownersPatternRegex(r.pattern), `${r.pattern} fora do subconjunto que o gate entende`);
    assert.deepEqual(r.owners, ["@time"]);
    assert.equal(r.odd, false);
  }
  assert.match(s, /^#.*(fim|últim)/im, "o trecho diz que tem de ficar no fim do arquivo");
  // Acrescentado no FIM de um CODEOWNERS existente: quem aprova é o dono das normas.
  const existing = "* @todos\n/docs/ @redacao\n";
  assert.deepEqual([...ratchetOwners(existing + s, RATCHET).owners], ["@time"]);
  // Antes de uma regra genérica, a posse volta para ela — por isso vai por último.
  assert.deepEqual([...ratchetOwners(s + existing, RATCHET).owners], ["@todos"]);
});

test("CODEOWNERS: mais de um dono; dono fora do formato é recusado; o marcador de exemplo não dá posse", () => {
  assert.deepEqual([...ratchetOwners(codeownersSnippet("@ana @acme/normas"), RATCHET).owners].sort(), ["@acme/normas", "@ana"]);
  for (const bad of ["time", "ana@acme.com", "@a,@b", "@a\n* @intruso", "@", "@a #x", "@a/b/c", "", "   "]) {
    assert.throws(() => codeownersSnippet(bad), /dono/, JSON.stringify(bad));
  }
  const sample = codeownersSnippet();
  assert.match(sample, /<@dono-das-normas>/);
  const r = ratchetOwners(sample, RATCHET);
  assert.equal(r.owners.size, 0, "o trecho de exemplo, se for versionado como está, não libera override nenhum");
});

test("CODEOWNERS: projeto num subdiretório do repositório leva o prefixo", () => {
  const s = codeownersSnippet("@time", { prefix: "apps/x/" });
  assert.deepEqual(codeownersRules(s).slice(-5).map(r => r.pattern), [
    "/apps/x/.context/engineering/standards/", "/apps/x/.context/standards/", "/apps/x/.context/standards.local.yaml", "/apps/x/.context/.devflow.yaml", "/apps/x/.context/bin/",
  ]);
  assert.deepEqual([...ratchetOwners(s, RATCHET.map(p => `apps/x/${p}`)).owners], ["@time"]);
  assert.throws(() => codeownersSnippet("@time", { prefix: "a b/" }), /prefixo/);
});

// ── verify ──────────────────────────────────────────────────────────────────────────

test("verify: a entrada é o argv reservado, e a linha oferecida é aceita pelo parser único", () => {
  assert.deepEqual(verifyEntry(), ["devflow-standards", "gate"]);
  const o = gatesOffer(project());
  assert.deepEqual(o.verify.entry, ["devflow-standards", "gate"]);
  assert.deepEqual(readVerify(`verify:\n  ${o.verify.yaml}\n`).signals.standards, ["devflow-standards", "gate"]);
});

// ── CLI: só imprime ─────────────────────────────────────────────────────────────────

test("o CLI só imprime: JSON com a oferta inteira e nenhum arquivo criado ou alterado", () => {
  const root = project();
  const cwd = tmp("cwd-"), home = tmp("home-");
  const before = [snapshot(root), snapshot(cwd), snapshot(home)];
  const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, ".claude") };
  delete env.CLAUDE_PLUGIN_ROOT;
  const r = spawnSync("node", [CLI, root, "--owner=@dona"], { cwd, encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  const version = pluginVersion();
  assert.equal(o.pluginVersion, version);
  assert.deepEqual(o.repo, { git: true, github: true, gitlab: false, prefix: "" });
  assert.equal(o.autonomy, "supervised");
  assert.deepEqual(o.warnings, []);
  assert.equal(o.baseline.exists, false);
  assert.equal(o.baseline.initCommand, `node "${PLUGIN}/scripts/devflow-standards.mjs" baseline init`);
  for (const [key, { asset, to }] of Object.entries(VERBATIM)) {
    assert.equal(o[key].from, join(PLUGIN, asset));
    assert.equal(o[key].to, to);
    assert.equal(o[key].sha256, sha256(readFileSync(join(PLUGIN, asset))));
    assert.equal(o[key].state, "absent");
  }
  assert.equal(o.githubActions.applicable, true);
  assert.equal(o.gitlab.applicable, false);
  assert.equal(o.gitlab.include, "include:\n  - local: /.gitlab/ci/devflow-standards.yml\n");
  assert.ok(GL.includes("#     - local: /.gitlab/ci/devflow-standards.yml"), "o asset ensina o mesmo include");
  assert.equal(o.manager, null);
  assert.deepEqual({ file: o.preCommit.file, command: o.preCommit.command, exists: o.preCommit.exists, installed: o.preCommit.installed },
    { file: "lefthook.yml", command: SHIM_CMD, exists: false, installed: false });
  assert.match(o.preCommit.content, /run: node \.context\/bin\/devflow-standards\.mjs check --staged/);
  assert.deepEqual(o.pin, { file: PIN_TARGET, content: `v${version}\n`, state: "absent" });
  assert.equal(o.codeowners.file, ".github/CODEOWNERS");
  assert.equal(o.codeowners.exists, false);
  assert.equal(o.codeowners.covered, false);
  assert.equal(o.codeowners.content, codeownersSnippet("@dona"));
  assert.deepEqual(o.verify, { file: ".context/.devflow.yaml", entry: ["devflow-standards", "gate"], yaml: 'standards: ["devflow-standards", "gate"]', declared: false });
  assert.deepEqual(o.gitignore, { file: ".gitignore", line: ".context/runtime/", ignored: false });
  assert.deepEqual(o.standards.local, [{ id: "std-demo", level: "block", maxLevel: "block", linter: true }]);
  assert.deepEqual(o.standards.defaults, [], "o fixture desligou os defaults do plugin");
  assert.deepEqual([snapshot(root), snapshot(cwd), snapshot(home)], before, "o CLI não pode criar nem alterar arquivo");
});

test("o CLI não escreve nem quando tudo já está instalado ou quando o destino está editado", () => {
  const root = project();
  const first = gatesOffer(root);
  for (const key of Object.keys(VERBATIM)) {
    mkdirSync(dirname(join(root, first[key].to)), { recursive: true });
    copyFileSync(first[key].from, join(root, first[key].to));
  }
  writeFileSync(join(root, PIN_TARGET), "v0.0.1\n");
  appendFileSync(join(root, GITHUB_WORKFLOW_TARGET), "# editado\n");
  const before = snapshot(root);
  const r = spawnSync("node", [CLI, root], { cwd: tmp("cwd-"), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  assert.deepEqual([o.shim.state, o.githubActions.state, o.gitlab.state, o.pin.state], ["current", "edited", "current", "differs"]);
  assert.match(o.codeowners.content, /<@dono-das-normas>/, "sem --owner, o trecho leva o marcador de exemplo");
  assert.deepEqual(snapshot(root), before);
});

test("CLI: sem projeto, projeto inexistente, opção desconhecida ou --owner inválido → uso incorreto (2)", () => {
  const root = project();
  for (const args of [[], ["/nao/existe/mesmo"], [root, "--escreve"], [root, "--owner=fulano"], [root, "--owner="], [root, "outro"]]) {
    const r = spawnSync("node", [CLI, ...args], { encoding: "utf8" });
    assert.equal(r.status, 2, `${JSON.stringify(args)} → ${r.status}\n${r.stderr}`);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /uso: /);
  }
});

// ── estado de cada item ─────────────────────────────────────────────────────────────

test("artefato verbatim: ausente → atual; 1 byte a mais é 'edited'; cópia de versão antiga é 'outdated'", () => {
  const root = project();
  const a = gatesOffer(root);
  for (const key of Object.keys(VERBATIM)) {
    assert.equal(a[key].state, "absent");
    mkdirSync(dirname(join(root, a[key].to)), { recursive: true });
    copyFileSync(a[key].from, join(root, a[key].to)); // o papel da skill: copiar byte a byte
  }
  writeFileSync(join(root, a.pin.file), a.pin.content);
  const b = gatesOffer(root);
  for (const key of Object.keys(VERBATIM)) {
    assert.equal(b[key].state, "current");
    assert.equal(sha256(readFileSync(join(root, b[key].to))), b[key].sha256);
    assert.equal(b[key].diff, undefined);
  }
  assert.equal(b.pin.state, "current");

  appendFileSync(join(root, SHIM_TARGET), "// ajuste local\n");
  const c = gatesOffer(root);
  assert.equal(c.shim.state, "edited", "hash desconhecido: edição local, preservar");
  assert.match(c.shim.diff, /ajuste local/);
  // O mesmo conteúdo, mas conhecido do registro: é uma cópia intocada de outra versão do plugin.
  const old = sha256(readFileSync(join(root, SHIM_TARGET)));
  const d = gatesOffer(root, { registry: new Set([old]) });
  assert.equal(d.shim.state, "outdated");
  assert.match(d.shim.diff, /ajuste local/, "a atualização de artefato de CI passa por diff + confirmação");
});

test("pin: de outra versão é 'differs' (com o valor atual); ilegível é 'invalid'", () => {
  const root = project();
  mkdirSync(join(root, ".context/bin"), { recursive: true });
  writeFileSync(join(root, PIN_TARGET), "v0.0.1\n");
  assert.deepEqual(gatesOffer(root).pin, { file: PIN_TARGET, content: `v${pluginVersion()}\n`, state: "differs", current: "v0.0.1" });
  writeFileSync(join(root, PIN_TARGET), "a ponta da main\n");
  assert.equal(gatesOffer(root).pin.state, "invalid");
  writeFileSync(join(root, PIN_TARGET), "x".repeat(5000));
  assert.equal(gatesOffer(root).pin.state, "invalid");
});

test("destino que é link simbólico, diretório ou está atrás de um link não é oferecido (blocked)", () => {
  const outside = tmp("fora-");
  writeFileSync(join(outside, "alvo.mjs"), "x");

  const a = project();
  mkdirSync(join(a, ".context/bin"), { recursive: true });
  symlinkSync(join(outside, "alvo.mjs"), join(a, SHIM_TARGET));
  const oa = gatesOffer(a);
  assert.equal(oa.shim.state, "blocked");
  assert.match(oa.shim.reason, /link simbólico/);

  const b = project();
  mkdirSync(join(b, ".github"));
  symlinkSync(outside, join(b, ".github/workflows"));
  assert.equal(gatesOffer(b).githubActions.state, "blocked", "diretório-pai que aponta para fora do projeto");

  const c = project();
  mkdirSync(join(c, GITLAB_CI_TARGET), { recursive: true });
  assert.equal(gatesOffer(c).gitlab.state, "blocked", "diretório no lugar do arquivo");

  const d = project();
  mkdirSync(join(d, ".context/bin"), { recursive: true });
  symlinkSync(join(outside, "alvo.mjs"), join(d, PIN_TARGET));
  assert.equal(gatesOffer(d).pin.state, "blocked");
});

test("detecta o que já está ligado: verify, .gitignore, baseline, pre-commit e CODEOWNERS", async () => {
  const root = project();
  writeFileSync(join(root, ".context/.devflow.yaml"), 'git:\n  strategy: branch-flow\nverify:\n  standards: ["devflow-standards", "gate"]\n');
  writeFileSync(join(root, ".gitignore"), "node_modules/\n.context/runtime/\n");
  mkdirSync(join(root, ".husky"));
  writeFileSync(join(root, ".husky/pre-commit"), `npm test\n${preCommitSnippet("husky").content}`);
  mkdirSync(join(root, ".github"));
  writeFileSync(join(root, ".github/CODEOWNERS"), `* @todos\n${codeownersSnippet("@dona")}`);
  assert.equal(await runStandardsCommand("baseline", ["init"], root, { isInteractive: () => true }), 0);
  const o = gatesOffer(root);
  assert.equal(o.verify.declared, true);
  assert.equal(o.gitignore.ignored, true);
  assert.equal(o.baseline.exists, true);
  assert.equal(o.manager, "husky");
  assert.deepEqual({ file: o.preCommit.file, exists: o.preCommit.exists, installed: o.preCommit.installed }, { file: ".husky/pre-commit", exists: true, installed: true });
  assert.deepEqual({ exists: o.codeowners.exists, covered: o.codeowners.covered, owners: o.codeowners.owners }, { exists: true, covered: true, owners: ["@dona"] });
});

test("CODEOWNERS existente que não dá dono à catraca: covered=false, com o motivo", () => {
  const root = project();
  writeFileSync(join(root, "CODEOWNERS"), `${codeownersSnippet("@dona")}[abc]* @outro\n`);
  const o = gatesOffer(root);
  assert.equal(o.codeowners.file, "CODEOWNERS", "o primeiro que existe, na ordem do GitHub");
  assert.equal(o.codeowners.covered, false);
  assert.match(o.codeowners.why, /fora do subconjunto/);
});

test("verify: presente mas inválido aparece como erro, nunca como declarado", () => {
  const root = project();
  writeFileSync(join(root, ".context/.devflow.yaml"), 'verify:\n  standards: ["node", "x.js"]\n');
  const o = gatesOffer(root);
  assert.equal(o.verify.declared, false);
  assert.match(o.verify.error, /devflow-standards/);
});

test(".gitignore: só conta o que está versionável no projeto (o exclude local do git não conta)", () => {
  const root = project();
  writeFileSync(join(root, ".git/info/exclude"), ".context/runtime/\n");
  assert.equal(gatesOffer(root).gitignore.ignored, false);
  writeFileSync(join(root, ".gitignore"), "/.context/runtime\n");
  assert.equal(gatesOffer(root).gitignore.ignored, true);
  // Fora de git, vale o texto do .gitignore.
  const plain = demoProject(); TEMPS.push(plain);
  assert.equal(gatesOffer(plain).gitignore.ignored, false);
  writeFileSync(join(plain, ".gitignore"), ".context/runtime/\n");
  assert.equal(gatesOffer(plain).gitignore.ignored, true);
});

test("repositório: GitHub, GitLab (sem vazar credencial do remote) e sem git", () => {
  const gl = gatesOffer(project({ remote: "https://oauth2:segredo-do-remote@gitlab.com/acme/app.git" }));
  assert.deepEqual(gl.repo, { git: true, github: false, gitlab: true, prefix: "" });
  assert.deepEqual([gl.githubActions.applicable, gl.gitlab.applicable], [false, true]);
  assert.ok(!JSON.stringify(gl).includes("segredo-do-remote"), "a URL do remote não entra na saída");

  const selfHosted = gatesOffer(project({ remote: "git@gitlab.acme.dev:acme/app.git" }));
  assert.equal(selfHosted.repo.gitlab, true);

  const noRemote = gatesOffer(project({ remote: null }));
  assert.deepEqual(noRemote.repo, { git: true, github: false, gitlab: false, prefix: "" });
  assert.deepEqual([noRemote.githubActions.applicable, noRemote.gitlab.applicable], [false, false]);

  const plain = demoProject(); TEMPS.push(plain);
  assert.deepEqual(gatesOffer(plain).repo, { git: false, github: false, gitlab: false, prefix: "" });
});

test("GitLab com outro nome de host é reconhecido pelo .gitlab-ci.yml do projeto", () => {
  const root = project({ remote: "git@git.acme.dev:acme/app.git" });
  assert.equal(gatesOffer(root).repo.gitlab, false);
  writeFileSync(join(root, ".gitlab-ci.yml"), "stages: [test]\n");
  const o = gatesOffer(root);
  assert.deepEqual([o.repo.gitlab, o.gitlab.applicable, o.githubActions.applicable], [true, true, false]);
});

// ADR-012: scaffold nunca é escrito fora de `supervised`. O CLI não escreve; ele avisa a skill.
test("autonomia diferente de supervised vira aviso para a skill não escrever", () => {
  const root = project();
  mkdirSync(join(root, ".context/workflow"), { recursive: true });
  writeFileSync(join(root, ".context/workflow/status.yaml"), "autonomy: autonomous\n");
  const o = gatesOffer(root);
  assert.equal(o.autonomy, "autonomous");
  assert.equal(o.warnings.length, 1);
  assert.match(o.warnings[0], /autonomia 'autonomous'.*não escreva/);
});

test("projeto num subdiretório do repositório: aviso, e o CODEOWNERS sai com o prefixo", () => {
  const top = tmp("mono-");
  git(top, "init", "-q", "-b", "main");
  git(top, "remote", "add", "origin", "git@github.com:acme/mono.git");
  const root = join(top, "apps/x");
  mkdirSync(root, { recursive: true });
  isolateFromDefaults(root);
  const o = gatesOffer(root, { owner: "@dona" });
  assert.equal(o.repo.prefix, "apps/x/");
  assert.equal(o.warnings.length, 1);
  assert.match(o.warnings[0], /subdiretório/);
  assert.match(o.codeowners.content, /^\/apps\/x\/\.context\/bin\/ @dona$/m);
  assert.equal(o.githubActions.applicable, false, "o workflow fixo assume o projeto na raiz do repositório");
});
