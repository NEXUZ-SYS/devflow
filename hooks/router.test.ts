// hooks/router.test.ts — roda com `claude plugin test .` (o kit só procura *.test.ts / *.test.tsx).
import { test, expect, mock } from "claude-code/testing";

// Tabela mínima embutida: o ambiente do kit não tem fs e módulos não aceitam import() dinâmico.
const ROUTES = JSON.stringify({
  routable: ["general-purpose"], routablePrefix: "devflow:",
  effortByTier: { cheap: "low", standard: "medium", capable: "high", top: "high" },
  agents: { "documentation-writer": { tier: "cheap", effort: "low" }, architect: { tier: "capable", effort: "high" }, "general-purpose": { tier: "standard" } },
  phases: { E: { "general-purpose": "standard" } }, skills: {},
  session: { phases: { E: "standard" }, skills: {} },
});
const YAML_ON = "models:\n  enabled: true\n";

function stubEnv(on, { yaml = YAML_ON, optIn = "1", phase = "E" } = {}) {
  mock.clock(on); // o monitor abre $.clock.every no session.start
  const files = {
    ".context/.devflow.yaml": yaml,
    ".context/runtime/workflows/prevc.json": JSON.stringify({ status: { project: { name: "x", current_phase: phase } } }),
  };
  const fileOf = (p) => Object.keys(files).find((k) => String(p).endsWith(k)) ?? (String(p).endsWith("routes.json") ? "routes" : null);
  // Chamadas a `$` são "op events": o hook do teste responde com { value } ou recusa com { deny }.
  on("fs.stat", async ($, e) => {
    if (e.path === "/proj") return { value: { kind: "dir", size: 0, mtimeMs: 0, isLink: false, realPath: "/proj" } };
    const f = fileOf(e.path);
    if (!f) return { deny: "ENOENT" };
    return { value: { kind: "file", size: 100, mtimeMs: 0, isLink: false, realPath: f === "routes" ? e.path : `/proj/${f}` } };
  });
  on("fs.read", async ($, e) => {
    const f = fileOf(e.path);
    if (f === "routes") return { value: ROUTES };
    if (f) return { value: files[f] };
    return { deny: "ENOENT" };
  });
  on("fs.write", async () => ({ value: undefined }));
  on("settings.read", async () => ({ value: { enabledPlugins: {} } }));
  on("env.get", async ($, e) => ({ value: ({ HOME: "/home/t", PWD: "/proj", DEVFLOW_MODEL_ROUTING: optIn })[e.name] }));
}

// Sem engine real o kit não preenche parentModel: o teto fica ilegível e o mod NÃO roteia (D5).
// O caminho positivo (alias aplicado no agent.spawn) está coberto pela sonda A2 da fase R,
// pelos testes puros da Task 7 e pela verificação real da fase V.
test("teto ilegível (sem parentModel) → despacho intocado (D5)", async ($, on) => {
  stubEnv(on);
  let seen;
  on("agent.spawn", async ($, e) => { seen = e; return { model: "claude-haiku-5-5", agentId: "a1" }; });
  await $.agent.spawn({ prompt: "doc", subagentType: "devflow:documentation-writer" });
  expect(seen.parentModel).toBeUndefined();
  expect(seen.model).toBeUndefined();
});

test("sem confirmação do usuário (D18) o despacho fica intocado", async ($, on) => {
  stubEnv(on, { optIn: undefined });
  let seen;
  on("agent.spawn", async ($, e) => { seen = e; return { model: "claude-opus-5-5", agentId: "a1" }; });
  await $.agent.spawn({ prompt: "x", subagentType: "devflow:documentation-writer" });
  expect(seen.model).toBeUndefined();
});

test("repo sem models: o despacho fica intocado", async ($, on) => {
  stubEnv(on, { yaml: "git:\n  strategy: x\n" });
  let seen;
  on("agent.spawn", async ($, e) => { seen = e; return { model: "claude-opus-5-5", agentId: "a1" }; });
  await $.agent.spawn({ prompt: "x", subagentType: "devflow:documentation-writer" });
  expect(seen.model).toBeUndefined();
});

test("tipo não roteável (Explore) intocado", async ($, on) => {
  stubEnv(on);
  let seen;
  on("agent.spawn", async ($, e) => { seen = e; return { model: "claude-haiku-5-5", agentId: "a1" }; });
  await $.agent.spawn({ prompt: "x", subagentType: "Explore" });
  expect(seen.model).toBeUndefined();
});

test("model explícito intocado quando o teto é ilegível (nunca rebaixa às cegas)", async ($, on) => {
  stubEnv(on);
  let seen;
  on("agent.spawn", async ($, e) => { seen = e; return { model: "claude-opus-5-5", agentId: "a1" }; });
  await $.agent.spawn({ prompt: "x", subagentType: "general-purpose", model: "opus" });
  expect(seen.model).toBe("opus");
});
