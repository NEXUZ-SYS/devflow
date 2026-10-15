// hooks/router.test.ts — roda com `claude plugin test .` (o kit só procura *.test.ts / *.test.tsx).
import { test, expect, mock } from "claude-code/testing";

// Tabela mínima embutida: o ambiente do kit não tem fs e módulos não aceitam import() dinâmico.
const ROUTES = JSON.stringify({
  routable: ["general-purpose"], routablePrefix: "devflow:",
  effortByTier: { cheap: "low", standard: "medium", capable: "high", top: "high" },
  agents: { "documentation-writer": { tier: "cheap", effort: "low" }, architect: { tier: "capable", effort: "high" }, "general-purpose": { tier: "standard" } },
  phases: { E: { "general-purpose": "standard" } }, skills: {},
  session: { phases: { E: "standard" }, skills: {} },
  ids: { standard: "claude-sonnet-5-5" },
});
const YAML_ON = "models:\n  enabled: true\n";

const prevcOf = (phase) => JSON.stringify({ status: { project: { name: "x", current_phase: phase } } });

function stubEnv(on, { yaml = YAML_ON, optIn = "1", phase = "E" } = {}) {
  const clock = mock.clock(on); // o monitor abre $.clock.every no session.start
  let prevcVersion = 0;
  const files = {
    ".context/.devflow.yaml": yaml,
    ".context/runtime/workflows/prevc.json": prevcOf(phase),
  };
  const fileOf = (p) => Object.keys(files).find((k) => String(p).endsWith(k)) ?? (String(p).endsWith("routes.json") ? "routes" : null);
  // Chamadas a `$` são "op events": o hook do teste responde com { value } ou recusa com { deny }.
  on("fs.stat", async ($, e) => {
    if (e.path === "/proj") return { value: { kind: "dir", size: 0, mtimeMs: 0, isLink: false, realPath: "/proj" } };
    const f = fileOf(e.path);
    if (!f) return { deny: "ENOENT" };
    return { value: { kind: "file", size: 100, mtimeMs: f.endsWith("prevc.json") ? prevcVersion : 0, isLink: false, realPath: f === "routes" ? e.path : `/proj/${f}` } };
  });
  on("fs.read", async ($, e) => {
    const f = fileOf(e.path);
    if (f === "routes") return { value: ROUTES };
    if (f) return { value: files[f] };
    return { deny: "ENOENT" };
  });
  on("session.cwd", async () => ({ value: "/proj" })); // raiz do repo: sem ela o mod não acha o .devflow.yaml nem o prevc.json
  on("fs.write", async () => ({ value: undefined }));
  on("settings.read", async () => ({ value: { enabledPlugins: {} } }));
  on("env.get", async ($, e) => ({ value: ({ HOME: "/home/t", PWD: "/proj", DEVFLOW_MODEL_ROUTING: optIn })[e.name] }));
  // Troca a fase entre passos: o mod relê o prevc.json quando o mtime muda.
  const setPhase = (ph) => { prevcVersion += 1; files[".context/runtime/workflows/prevc.json"] = prevcOf(ph); };
  return { clock, setPhase };
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

// ─── Sonda antecipada do ID do tier da sessão (INV-SESS, campanha D v3.9.0) ───────────────────────
// O kit roda o mod no engine real com relógio em memória: aqui o prazo de 3 s é o de verdade (a integração o escala).
const OPUS = "claude-opus-5-5";
const SONNET = "claude-sonnet-5-5";

// Registra o fundo do turn.step (o que o mod mandou ao engine) e a sonda: responde após `probeMs` no relógio, ou nunca.
function stubStep(on, clock, { probeMs }) {
  const sent = [];
  const probes = [];
  on("turn.step", async function* ($, e) { sent.push(e); return { turnId: e.turnId, index: e.index, answer: "", toolUses: [] }; });
  on("model.complete", async ($, e) => {
    probes.push(e.model);
    if (probeMs === null) return new Promise(() => {});
    await clock.sleep(probeMs);
    return { value: { isAnswered: true, text: "ok", usage: { model: e.model, input_tokens: 1, output_tokens: 1 } } };
  });
  return { sent, probes };
}
let idx = 0;
// Percorre o stream do turn.step até o fim (o resultado vem de baixo, o que importa está em `sent`).
async function runStep($) {
  const g = $.turn.step({ turnId: "t1", index: idx++, model: OPUS, effort: "xhigh", messageCount: 1 });
  for (;;) { const r = await g.next(); if (r.done) return r.value; }
}

test("kit: fase P sonda o standard no 1o passo; ao mudar para E o 1o passo já sai no ID sondado", async ($, on) => {
  const env = stubEnv(on, { phase: "P" });
  const { sent, probes } = stubStep(on, env.clock, { probeMs: 500 });
  await runStep($);
  await env.clock.settle();
  expect(probes).toEqual([SONNET]); // sondou antes de a fase pedir o tier
  expect(sent[0].model).toBe(OPUS); // fase P fica no teto e não espera
  await env.clock.advance(500); // a sonda responde
  env.setPhase("E");
  await runStep($);
  expect(sent[1].model).toBe(SONNET);
});

test("kit: fase E com sonda dentro do prazo — o passo espera e já sai no ID sondado", async ($, on) => {
  const env = stubEnv(on, { phase: "E" });
  const { sent } = stubStep(on, env.clock, { probeMs: 1000 });
  const pending = runStep($);
  await env.clock.settle();
  expect(sent.length).toBe(0); // o passo está esperando a sonda
  await env.clock.advance(1000);
  await pending;
  expect(sent[0].model).toBe(SONNET);
});

test("kit: sonda acima de 3 s — o passo segue no teto sem o ID e o passo seguinte troca", async ($, on) => {
  const env = stubEnv(on, { phase: "E" });
  const { sent } = stubStep(on, env.clock, { probeMs: 5000 });
  const pending = runStep($);
  await env.clock.advance(2999);
  expect(sent.length).toBe(0); // ainda dentro do prazo
  await env.clock.advance(1); // 3000 ms: o prazo vence
  await pending;
  expect(sent[0].model).toBe(OPUS); // sem ID verificado só o esforço muda
  await env.clock.advance(2000); // a sonda termina
  await runStep($);
  expect(sent[1].model).toBe(SONNET);
});
