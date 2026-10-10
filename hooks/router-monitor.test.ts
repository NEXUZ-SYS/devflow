// hooks/router-monitor.test.ts — roda com `claude plugin test .`. Prova no engine que a faixa do monitor
// desenha a linha de um despacho (terminal e desktop). Comportamento fino: tests/integration/test-router-monitor-mod.mjs.
// No kit: `mock.clock` é obrigatório para $.clock.every; Text não guarda `key` (buscar por texto).
import { test, expect, mock } from "claude-code/testing";

const BAND = { plugin: "devflow", component: "AbovePrompt", props: { hasSurvey: false, maxRows: 20 } } as const;

test("despacho do SDD aparece na faixa com tipo, task e papel", async ($, on) => {
  mock.clock(on);
  on("agent.spawn", async () => ({ model: "claude-haiku-5-5", agentId: "a1" }));
  await $.agent.spawn({ prompt: "x", description: "Implement Task 3: parser", subagentType: "general-purpose" });
  for (const surface of ["terminal", "desktop"] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as any);
    expect(await ui.find({ text: /general-purpose · Task 3 · implement/ })).toBeDefined();
    expect(await ui.find({ text: /Retentativas: 0/ })).toBeDefined();
  }
});
