import { test } from "node:test";
import assert from "node:assert/strict";
import { readBlockField, readField } from "../../scripts/lib/devflow-config.mjs";

const YAML = `git:
  strategy: branch-flow
  prCli: gh
  versioning: pipeline

grounding:
  mode: docs-only        # docs-first | docs-only
  docsMcpServer: docs-mcp-server  # server canônico de documentação
  blockWeb: true

instincts:
  enabled: true
`;

test("o bug: comentário inline não vaza para o valor", () => {
  assert.equal(readBlockField(YAML, "grounding", "docsMcpServer"), "docs-mcp-server");
  assert.equal(readBlockField(YAML, "grounding", "mode"), "docs-only");
});

test("lê campo de bloco aninhado (readField só sabe ler git:)", () => {
  assert.equal(readField(YAML, "docsMcpServer"), null, "readField não deve encontrar fora de git:");
  assert.equal(readBlockField(YAML, "grounding", "docsMcpServer"), "docs-mcp-server");
  assert.equal(readBlockField(YAML, "instincts", "enabled"), "true");
});

test("bloco inexistente → null", () => {
  assert.equal(readBlockField(YAML, "naoexiste", "mode"), null);
});

test("campo inexistente no bloco → null", () => {
  assert.equal(readBlockField(YAML, "grounding", "naoexiste"), null);
});

test("não vaza entre blocos", () => {
  assert.equal(readBlockField(YAML, "grounding", "strategy"), null, "strategy é de git:, não de grounding:");
  assert.equal(readBlockField(YAML, "git", "docsMcpServer"), null, "docsMcpServer é de grounding:, não de git:");
});

test("ancoragem por ':' — prefixo não casa", () => {
  const y = "grounding:\n  modeExtra: x\n";
  assert.equal(readBlockField(y, "grounding", "mode"), null, "'mode' não pode casar com 'modeExtra'");
});

test("não-regressão: readField segue lendo git:", () => {
  assert.equal(readField(YAML, "prCli"), "gh");
  assert.equal(readField(YAML, "strategy"), "branch-flow");
});

test("entrada suja não lança", () => {
  assert.doesNotThrow(() => readBlockField("", "grounding", "mode"));
  assert.equal(readBlockField("", "grounding", "mode"), null);
});
