// scripts/reversa-import/emitters/plans.mjs
// Emitter: features → plans.json registry + esqueletos plan.md (1 por feature).
// Shape do item conforme .context/workflow/plans.json real.
export function emitPlans(ir, { now = "1970-01-01T00:00:00.000Z" } = {}) {
  const active = ir.features.map((f) => ({
    slug: f.slug,
    path: `plans/${f.slug}.md`,
    title: f.slug,
    summary: `Plano esqueleto importado do Reversa para ${f.slug}.`,
    linkedAt: now,
    status: "active",
    approval_status: "pending",
  }));
  const plansJson = JSON.stringify(
    { active, completed: [], primary: active[0]?.slug ?? null },
    null,
    2,
  );

  const planSkeletons = ir.features.map((f) => {
    const body = [
      `# Plano — ${f.slug}`,
      "",
      "> Esqueleto importado do Reversa (fiel). Critérios de aceitação derivados de requirements.md.",
      "",
      "## Critérios de aceitação (da origem Reversa)",
      "",
      f.requirements.trim() || "_(requirements não capturados)_",
      "",
      "## Decomposição em stories",
      "",
      "_A decomposição atômica é responsabilidade da máquina nativa DevFlow_ (`/devflow auto --from-prd`)_, não do importador._",
      "",
    ].join("\n");
    return { feature: f.slug, body };
  });

  return { plansJson, planSkeletons };
}
