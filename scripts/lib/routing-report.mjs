// scripts/lib/routing-report.mjs — agregação do relatório (spec §8). PURO.
// Map em vez de objeto: agentType/model vêm de fora e não podem tocar o protótipo (segurança 8).
const ZERO = () => ({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, n: 0 });

function add(bucket, usage) {
  for (const k of Object.keys(bucket)) if (k !== "n" && typeof usage?.[k] === "number") bucket[k] += usage[k];
  bucket.n += 1;
}
const sub = (map, key) => { if (!map.has(key)) map.set(key, new Map()); return map.get(key); };
const zeroIn = (map, key) => { if (!map.has(key)) map.set(key, ZERO()); return map.get(key); };
const esc = (map, key) => { if (!map.has(key)) map.set(key, { dispatches: 0, escalated: 0 }); return map.get(key); };

export function aggregate(entries) {
  const agg = { subagents: new Map(), session: new Map(), escalations: new Map(), midRunSwitches: 0, phaseSwitches: [] };
  for (const e of entries ?? []) {
    const agent = String(e?.agentType ?? "?");
    if (e?.escalation) {
      if (e.escalation.action === "escalate") {
        esc(agg.escalations, agent).escalated += 1;
        if (e.escalation.at === "midRun") agg.midRunSwitches += 1;
      }
      continue;
    }
    if (!e?.usage || typeof e.model !== "string") continue;
    if (e.scope === "subagent") {
      add(zeroIn(sub(agg.subagents, agent), e.model), e.usage);
      esc(agg.escalations, agent).dispatches += 1;
    } else if (e.scope === "session") {
      const phase = String(e.phase ?? "-");
      add(zeroIn(sub(agg.session, phase), e.model), e.usage);
      if (e.switched) agg.phaseSwitches.push({ phase, cacheReadRatio: e.cacheReadRatio ?? null });
    }
  }
  return agg;
}

const k = (n) => (n / 1000).toFixed(1) + "k";

export function renderMarkdown(agg) {
  const lines = ["## Subagentes", "", "| Agente | Modelo | Despachos | Entrada | Saída | Cache lido |", "|---|---|---|---|---|---|"];
  for (const [a, models] of agg.subagents)
    for (const [m, u] of models)
      lines.push(`| ${a} | ${m} | ${u.n} | ${k(u.input_tokens)} | ${k(u.output_tokens)} | ${k(u.cache_read_input_tokens)} |`);
  lines.push("", "## Sessão por fase", "", "| Fase | Modelo | Turnos | Entrada | Saída |", "|---|---|---|---|---|");
  for (const [p, models] of agg.session)
    for (const [m, u] of models) lines.push(`| ${p} | ${m} | ${u.n} | ${k(u.input_tokens)} | ${k(u.output_tokens)} |`);
  lines.push("", "## Escaladas", "", "| Agente | Despachos | Escaladas |", "|---|---|---|");
  for (const [a, s] of agg.escalations) lines.push(`| ${a} | ${s.dispatches} | ${s.escalated} |`);
  lines.push("", `Trocas no meio da execução: ${agg.midRunSwitches}`);
  lines.push(`Trocas de fase da sessão: ${agg.phaseSwitches.length} (cache lido no passo seguinte: ${agg.phaseSwitches.map((s) => s.cacheReadRatio ?? "?").join(", ") || "—"})`);
  lines.push("", "_Tokens por modelo. O peso de cada modelo na cota do plano não é público._");
  return lines.join("\n");
}
