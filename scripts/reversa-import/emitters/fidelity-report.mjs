// scripts/reversa-import/emitters/fidelity-report.mjs
// Emitter: fidelity-report.md. Confiança como sinal acionável, não decoração.
function pct(n, total) { return total > 0 ? Math.round((n / total) * 100) : 0; }

export function emitFidelityReport(ir) {
  const out = [];
  out.push(`# Relatório de Fidelidade — ${ir.project.name || "projeto"}`);
  out.push("");
  out.push("> 🟦 oficial · 🟢 capturado · 🟡 inferido · 🔴 lacuna");
  out.push("");
  out.push("## Confiança por feature");
  out.push("");
  out.push("| Feature | 🟦 | 🟢 | 🟡 | 🔴 | % confiável |");
  out.push("|---|---|---|---|---|---|");

  let g = { official: 0, captured: 0, inferred: 0, gap: 0, total: 0 };
  for (const f of ir.features) {
    const m = f.markers || { official: 0, captured: 0, inferred: 0, gap: 0, total: 0 };
    const reliable = pct(m.official + m.captured, m.total);
    out.push(`| ${f.slug} | ${m.official} | ${m.captured} | ${m.inferred} | ${m.gap} | ${reliable}% |`);
    for (const k of Object.keys(g)) g[k] += m[k] || 0;
  }
  out.push(`| **global** | ${g.official} | ${g.captured} | ${g.inferred} | ${g.gap} | ${pct(g.official + g.captured, g.total)}% |`);
  out.push("");

  out.push("## 🔴 Lacunas → itens 'resolver lacuna'");
  out.push("");
  if (ir.gaps.length === 0) out.push("_Nenhuma lacuna 🔴 registrada._");
  for (const gap of ir.gaps) {
    out.push(`- [ ] **resolver lacuna** (${gap.feature}): ${gap.text}`);
  }
  out.push("");
  return out.join("\n");
}
