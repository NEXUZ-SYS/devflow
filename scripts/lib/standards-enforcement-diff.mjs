// scripts/lib/standards-enforcement-diff.mjs — o que conta como enfraquecer a catraca (ADR-015 D6).
//
// Compartilhado pelo guard do Edit/Write (T16) e pelo gate do CI contra o merge-base (T18): os
// dois comparam o enforcement EFETIVO calculado pelo mesmo parser do loader, antes e depois.
import { resolveLevel, maxLevel, RANK } from "./standards-level.mjs";
import { versionAllows } from "./standards-loader.mjs";
import { inlineSafe } from "./untrusted-frame.mjs";

/**
 * Enforcement efetivo por id. `ctx = { versions }` vem do `.devflow.yaml` do lado comparado: a
 * aplicabilidade por faixa de versão entra na comparação (appliesFrom/appliesUntil/framework
 * desligam um std em silêncio).
 *
 * @returns {Map<string, {level, max, rules, linter, applyTo, source, origin, active,
 *   appliesFrom, appliesUntil, framework, std}>}
 */
export function effectiveEnforcement(standards, ctx = {}) {
  const m = new Map();
  for (const s of standards || []) {
    const rules = {};
    const r = s.enforcement?.rules;
    if (r && typeof r === "object" && !Array.isArray(r)) for (const k of Object.keys(r)) rules[k] = resolveLevel(s, k);
    m.set(s.id, {
      level: resolveLevel(s, ""), max: maxLevel(s), rules, linter: s.enforcement?.linter || null,
      applyTo: [...(s.applyTo || [])], source: s.source || null, origin: s.origin || null,
      active: versionAllows(s, ctx), appliesFrom: s.appliesFrom ?? null, appliesUntil: s.appliesUntil ?? null,
      framework: s.framework ?? null, std: s,
    });
  }
  return m;
}

// Texto do projeto (id, regra, linter, glob) vai para a razão do ask e para o log do CI: uma
// linha, sem controle, bidi nem <> (inlineSafe), com teto.
const t = (s) => inlineSafe(s, 120);

/** Lista legível (pt-BR) do que enfraqueceu de `before` para `after`; vazia = nada enfraqueceu. */
export function enforcementWeakenings(before, after) {
  const out = [];
  for (const [id, b] of before) {
    const a = after.get(id);
    const sid = t(id);
    if (!a) { out.push(`${sid}: standard removido, desativado ou deprecated`); continue; }
    if (b.active && !a.active) out.push(`${sid}: deixa de valer pela faixa de versão (appliesFrom/appliesUntil/framework ou versões do .devflow.yaml)`);
    if (RANK[a.level] < RANK[b.level]) out.push(`${sid}: nível ${b.level} → ${a.level}`);
    if (RANK[a.max] < RANK[b.max]) out.push(`${sid}: nível máximo ${b.max} → ${a.max}`);
    for (const k of new Set([...Object.keys(b.rules), ...Object.keys(a.rules)])) {
      const lb = b.rules[k] ?? resolveLevel(b.std, k), la = a.rules[k] ?? resolveLevel(a.std, k);
      if (RANK[la] < RANK[lb]) out.push(`${sid}: regra ${t(k)} ${lb} → ${la}`);
    }
    if (b.linter && a.linter !== b.linter) out.push(`${sid}: linter ${t(b.linter)} → ${a.linter ? t(a.linter) : "removido"}`);
    for (const g of b.applyTo) if (!a.applyTo.includes(g)) out.push(`${sid}: applyTo perdeu ${t(g)}`);
  }
  return out;
}
