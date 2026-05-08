// skills/scrape-stack-batch/scripts/confidence.mjs — Fase B scoring (pure function).
//
// Per spec §3.4.4: confidence aggregated by max() across signal types.
// Below 0.6 → INCERTA (human must resolve). 0.6-0.8 → present with ⚠.
// >= 0.8 → recommended.

const SIGNAL_BASE = {
  registry_homepage: 0.85,
  registry_repo_match: 0.05,        // boost when homepage and repo are same domain/org
  llms_txt_200: 0.95,
  llms_txt_version_match: 0.03,     // boost when llms.txt declares the exact version
  github_docs_dir: 0.90,
  github_readme_links_docs: 0.05,
  docs_site_sitemap: 0.75,
  docs_site_version_in_sitemap: 0.05,
  web_search_low: 0.40,
  web_search_high: 0.85,
  convention_heuristic: 0.50,
};

export function scoreSignals(signals) {
  // signals is an array of { kind, boost? } where kind is a key of SIGNAL_BASE.
  // Final score = max(base + boosts) capped at 1.0.
  let best = 0;
  for (const sig of signals) {
    const base = SIGNAL_BASE[sig.kind];
    if (base === undefined) continue;
    let score = base;
    if (sig.boost) score += sig.boost;
    if (score > 1) score = 1;
    if (score > best) best = score;
  }
  return best;
}

export function classify(confidence) {
  if (confidence >= 0.8) return { tier: "recommended", marker: "✓" };
  if (confidence >= 0.6) return { tier: "review", marker: "⚠" };
  return { tier: "uncertain", marker: "✗" };
}
