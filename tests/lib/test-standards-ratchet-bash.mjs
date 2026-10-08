// tests/lib/test-standards-ratchet-bash.mjs — decisor heurístico da catraca no Bash, NotebookEdit
// e MCP (ADR-015 D6, T17). A tabela de casos é a mesma do teste do hook real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  decideRatchet, isReadOnlyMcpTool, ratchetOutput, RATCHET_MARKERS,
} from "../../scripts/lib/standards-ratchet-bash.mjs";
import { EVENT_CASES, RAW_CASES, MCP_NAMES, S } from "../helpers/standards-ratchet-cases.mjs";

const CLI = "scripts/lib/standards-ratchet-bash-cli.mjs";
const label = (ev) => `${ev.tool_name ?? "(sem tool_name)"} ${JSON.stringify(ev.tool_input).slice(0, 140)} cwd=${ev.cwd}`;

// Caracteres que não podem aparecer na razão: controle, DEL, separador de linha, bidi, zero-width, <>.
const UNSAFE = /[\x00-\x1f\x7f\x85\u2028\u2029\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff<>]/;

/** P0: a saída é vazia ou UM JSON `ask` de formato fixo. Devolve "ask" ou "". */
function decisionOf(out) {
  assert.ok(!out.includes('"allow"'), `"allow" na saída: ${out}`);
  if (out === "") return "";
  assert.ok(out.endsWith("\n") && out.indexOf("\n") === out.length - 1, `não é uma linha só: ${JSON.stringify(out)}`);
  const parsed = JSON.parse(out);
  assert.deepEqual(Object.keys(parsed), ["hookSpecificOutput"]);
  const h = parsed.hookSpecificOutput;
  assert.deepEqual(Object.keys(h), ["hookEventName", "permissionDecision", "permissionDecisionReason"]);
  assert.equal(h.hookEventName, "PreToolUse");
  assert.equal(h.permissionDecision, "ask");
  const r = h.permissionDecisionReason;
  assert.ok(r.startsWith("[devflow standards] ") && r.endsWith(" (ADR-015 D6)"), r);
  assert.ok(r.length <= 600 && !UNSAFE.test(r), `razão não sanitizada: ${JSON.stringify(r)}`);
  return "ask";
}

test("tabela de eventos: ask só quando a chamada mexe na catraca", () => {
  for (const { ev, want } of EVENT_CASES) {
    assert.equal(decideRatchet(ev) ? "ask" : "", want, label(ev));
    assert.equal(decisionOf(ratchetOutput(Buffer.from(JSON.stringify(ev)))), want, label(ev));
  }
});

test("todo evento que pede ask tem um marcador que o caminho rápido do hook enxerga", () => {
  for (const { ev, want } of EVENT_CASES) {
    if (want === "ask") assert.match(JSON.stringify(ev), RATCHET_MARKERS, label(ev));
  }
});

// O caminho rápido do hook só chama o decisor quando o evento tem marcador: uma regra que pedisse
// ask sem marcador nunca rodaria. Comandos montados ao acaso com os pedaços que as regras leem.
test("propriedade: o decisor só pede ask para evento com marcador (semente fixa)", () => {
  const PIECES = [
    "rm", "cp", "mv", "tee", ">", ">>", "2>", "&>", "sed", "-i", "git", "checkout", "restore", "node", "-e", "-p",
    "python3", "-c", "bash", "sh", "<<", "EOF", "cat", "ls", "cd", ".context", "engineering", "standards", "machine",
    "bin", "baseline", ".json", "baseline.json", "standards.local", ".yaml", "devflow-standards", ".mjs", "enforce",
    "/", "\\", " ", " ", "'", "\"", ";", "|", "&&", "\n", "-", ".", "std-a.md", "--project=", "x",
  ];
  let seed = 20261005;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const text = () => Array.from({ length: 2 + rnd(14) }, () => PIECES[rnd(PIECES.length)]).join(rnd(3) ? "" : " ");
  let asks = 0;
  for (let i = 0; i < 30000; i++) {
    const s = text();
    for (const ev of [
      { tool_name: "Bash", cwd: rnd(4) ? "/p" : `/p/${text()}`, tool_input: { command: s } },
      { tool_name: "NotebookEdit", cwd: "/p", tool_input: { notebook_path: s } },
      { tool_name: "mcp__fs__write_file", cwd: "/p", tool_input: { [rnd(2) ? "path" : s]: rnd(2) ? s : [s, { k: s }] } },
    ]) {
      if (!decideRatchet(ev)) continue;
      asks++;
      assert.match(JSON.stringify(ev), RATCHET_MARKERS, `ask sem marcador: ${JSON.stringify(ev)}`);
    }
  }
  assert.ok(asks > 1000, `o gerador quase não produz ask (${asks}): a propriedade não está sendo exercitada`);
});

test("o hook e o decisor usam a mesma lista de marcadores", () => {
  const hook = readFileSync("hooks/pre-tool-use-ratchet", "utf8");
  const ere = (hook.match(/^MARKERS='(.*)'$/m) || [])[1];
  assert.ok(ere, "MARKERS='…' não encontrado no hook");
  // Mesma expressão nas duas sintaxes: ERE do bash × regex do JS (grupo sem captura e ordem na classe).
  const asJs = ere.replace("(engineering|", "(?:engineering|").replace("[/\\\\]", "[\\\\/]");
  assert.equal(asJs, RATCHET_MARKERS.source);
  assert.ok(RATCHET_MARKERS.ignoreCase && !RATCHET_MARKERS.global);
});

test("stdin que não é evento: ask só se cita a catraca (na dúvida, com marcador → ask)", () => {
  for (const { name, b64, want } of RAW_CASES) {
    assert.equal(decisionOf(ratchetOutput(Buffer.from(b64, "base64"))), want, name);
  }
});

test("ferramenta MCP claramente de leitura, pelo nome", () => {
  for (const [name, readOnly] of MCP_NAMES) assert.equal(isReadOnlyMcpTool(name), readOnly, name);
});

// Decisão do controller pós-entrega: no MCP só pede ask o valor com cara de caminho ou de comando
// (até 300 caracteres e sem "\n") e a chave de objeto; prosa longa ou multilinha não.
test("MCP: valor curto de uma linha e chave pedem ask; prosa longa ou multilinha não", () => {
  const mcpAsk = (tool_input, tool = "mcp__fs__write_file") => (decideRatchet({ tool_name: tool, cwd: "/p", tool_input }) ? "ask" : "");
  const path = `${S}/baseline.json`;
  const pad = (n) => `${"x".repeat(n - path.length - 1)} ${path}`;
  assert.equal(pad(300).length, 300);
  assert.equal(mcpAsk({ text: pad(300) }), "ask", "300 caracteres numa linha");
  assert.equal(mcpAsk({ text: pad(301) }), "", "301 caracteres");
  assert.equal(mcpAsk({ text: `ver\n${path}` }), "", "duas linhas");
  assert.equal(mcpAsk({ text: `${path}\n` }), "", "quebra de linha no fim");
  assert.equal(mcpAsk({ text: `ver\r${path}` }), "ask", "só \\n conta como quebra de linha");
  // chave: sempre, mesmo longa ou com quebra de linha, e com qualquer valor
  assert.equal(mcpAsk({ [pad(400)]: 1 }), "ask");
  assert.equal(mcpAsk({ files: [{ [`a\n${path}`]: "x\ny" }] }), "ask");
  // o CLI dentro de um valor segue a mesma regra
  assert.equal(mcpAsk({ command: "node scripts/devflow-standards.mjs enforce std-a --level warn" }, "mcp__shell__run"), "ask");
  assert.equal(mcpAsk({ command: "cd /p\nnode scripts/devflow-standards.mjs enforce std-a --level warn" }, "mcp__shell__run"), "");
  // a exceção de leitura continua valendo, inclusive para chave
  assert.equal(mcpAsk({ [path]: 1, path }, "mcp__fs__read_file"), "");
});

test("a razão diz o que casou e não carrega texto do comando", () => {
  const why = decideRatchet({ tool_name: "Bash", cwd: "/p", tool_input: { command: `sed -i s/a/SEGREDO/ ${S}/std-a.md` } });
  assert.match(why, /Casou: sed -i \+ engineering\/standards\.$/);
  assert.ok(!why.includes("SEGREDO"));
  const cli = decideRatchet({ tool_name: "Bash", cwd: "/p", tool_input: { command: "node x/devflow-standards.mjs ENFORCE std-a --level warn" } });
  assert.match(cli, /baseline\/enforce\/eject/);
  assert.match(cli, /Casou: devflow-standards enforce\.$/);
  const eject = decideRatchet({ tool_name: "Bash", cwd: "/p", tool_input: { command: "node x/devflow-standards.mjs eject security" } });
  assert.match(eject, /Casou: devflow-standards eject\.$/);
  const reinit = decideRatchet({ tool_name: "Bash", cwd: "/p", tool_input: { command: 'node x/devflow-standards.mjs baseline reinit std-a --reason "x"' } });
  assert.match(reinit, /Casou: devflow-standards baseline\.$/);
  // separadores sem fim no caminho não estouram a razão
  const long = ratchetOutput(Buffer.from(JSON.stringify({ tool_name: "Bash", cwd: "/p", tool_input: { command: `rm .context/engineering${"/".repeat(5000)}standards/x` } })));
  assert.equal(decisionOf(long), "ask");
});

test("evento com tool_input fora do formato não derruba o decisor", () => {
  for (const ti of [null, 7, "rm .context/engineering/standards/baseline.json", [], { command: 42 }, { command: null }]) {
    assert.equal(typeof decideRatchet({ tool_name: "Bash", cwd: "/p", tool_input: ti }), "string");
  }
  // command que não é string: vale o conjunto dos valores string do tool_input
  assert.notEqual(decideRatchet({ tool_name: "Bash", tool_input: { command: [`rm ${S}/baseline.json`] } }), "");
  assert.equal(decideRatchet(null), "");
  assert.equal(decideRatchet({ tool_name: "mcp__fs__write_file", tool_input: null }), "");
  // aninhamento profundo num MCP: sem estouro de pilha
  let deep = `${S}/baseline.json`;
  for (let i = 0; i < 5000; i++) deep = [deep];
  assert.equal(decideRatchet({ tool_name: "mcp__fs__write_file", tool_input: { a: deep } }) ? "ask" : "", "ask");
});

test("custo: comandos adversariais de ~1 MiB não travam as expressões", () => {
  const big = (unit) => unit.repeat(Math.ceil((1 << 20) / unit.length));
  const units = [
    "sed ", "git ", "perl ", "curl ", "node --a ", "python3 -x ", "bash -x ", "> ", ">>", "<a@b", "<a@b>",
    "engineering/", "engineering\\", ".context/", ".context/standard", "a".repeat(300) + " ", "tee", "rm",
    " -delete", "\n", "|", "/", "<<", "- ", "sed -", "curl -", "perl -", "python3 -", "node ", "node -", "node --",
    "node -a-", "node --a=b x", "git --", "x devflow-standards", "devflow-standards --",
    // cadeias em que o valor de uma opção é outro início de casamento: sem limite no laço de
    // opções o custo é quadrático (48 s medidos em "devflow-standards --a="); com `--?[\w-]+`
    // cada opção tinha duas leituras (3,9 s em "node --a=")
    "devflow-standards --a=", "devflow-standards --a=\"x\" ", "devflow-standards --a='", "node --a=", "node --a=\"",
    "git --a=", "git -C ", "git -C -C", "python3 -=", "bash -=", "sh -c=",
  ];
  const t0 = process.hrtime.bigint();
  for (const u of units) {
    // cita a catraca sem escrever: todas as expressões rodam até o fim
    assert.equal(typeof decideRatchet({ tool_name: "Bash", cwd: "/p", tool_input: { command: `${big(u)} cat ${S}/baseline.json` } }), "string");
    assert.equal(typeof decideRatchet({ tool_name: "mcp__fs__write_file", cwd: "/p", tool_input: { a: big(u) } }), "string");
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 8000, `decisor levou ${ms.toFixed(0)} ms em ${units.length} entradas de 1 MiB (medido: ~1000 ms)`);
});

test("CLI: stdin evento → stdout com um JSON ask ou nada; exit 0", () => {
  const run = (input) => spawnSync("node", [CLI], { input, encoding: "utf8" });
  const ask = run(JSON.stringify({ tool_name: "Bash", cwd: "/p", tool_input: { command: `rm ${S}/baseline.json` } }));
  assert.equal(ask.status, 0, ask.stderr);
  assert.equal(decisionOf(ask.stdout), "ask");
  for (const input of [JSON.stringify({ tool_name: "Bash", cwd: "/p", tool_input: { command: `cat ${S}/baseline.json` } }), "", "lixo"]) {
    const r = run(input);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "");
  }
});
