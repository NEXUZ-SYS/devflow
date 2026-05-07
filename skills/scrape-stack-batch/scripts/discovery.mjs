// skills/scrape-stack-batch/scripts/discovery.mjs — Fase B (source discovery).
//
// For each <library@version>, probes 3 strategies in sequence:
//   1. Registry lookup (npm | PyPI | crates.io | Go proxy) — extracts repo + homepage
//   2. llms.txt probe (HEAD <homepage>/llms.txt or /.well-known/llms.txt)
//   3. Web search via Claude (fallback for ambiguous cases — skipped in offline mode)
//
// All HTTP goes through `fetch` (node:fetch). Per SI-3, downstream URLs MUST
// pass validateUrl() before being handed to fetch-url in the pipeline.
//
// Returns { url, type, confidence, reasoning, signals } per stack.

import { validateUrl } from "../../../scripts/lib/url-validator.mjs";
import { scoreSignals } from "./confidence.mjs";

// HTTP helper — wraps fetch with timeout + minimal options
async function tryFetchJSON(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "devflow/1.0" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function tryFetchHead(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 3000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, method: "HEAD", redirect: "manual" });
    return res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Registry probes ───────────────────────────────────────────────────────

async function probeNpm(library) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(library)}`;
  const data = await tryFetchJSON(url);
  if (!data) return null;
  return {
    homepage: data.homepage || null,
    repository: typeof data.repository === "string" ? data.repository : data.repository?.url || null,
  };
}

async function probePyPI(library) {
  const url = `https://pypi.org/pypi/${encodeURIComponent(library)}/json`;
  const data = await tryFetchJSON(url);
  if (!data) return null;
  const urls = data.info?.project_urls || {};
  return {
    homepage: urls.Documentation || urls.Homepage || data.info?.home_page || null,
    repository: urls.Source || urls.Repository || null,
  };
}

async function probeCratesIo(library) {
  const url = `https://crates.io/api/v1/crates/${encodeURIComponent(library)}`;
  const data = await tryFetchJSON(url);
  if (!data) return null;
  return {
    homepage: data.crate?.documentation || data.crate?.homepage || null,
    repository: data.crate?.repository || null,
  };
}

// Try registries in order; returns first non-null result with the registry kind tagged
async function probeRegistry(library) {
  for (const [kind, fn] of [["npm", probeNpm], ["pypi", probePyPI], ["crates", probeCratesIo]]) {
    const r = await fn(library);
    if (r && (r.homepage || r.repository)) return { kind, ...r };
  }
  return null;
}

// ─── llms.txt probe ────────────────────────────────────────────────────────

async function probeLlmsTxt(homepage) {
  if (!homepage) return false;
  let base;
  try {
    base = new URL(homepage);
  } catch {
    return false;
  }
  for (const path of ["/llms.txt", "/.well-known/llms.txt"]) {
    const probeUrl = new URL(path, base.origin).toString();
    try {
      await validateUrl(probeUrl);
    } catch {
      return false;  // SSRF guard rejected it
    }
    const status = await tryFetchHead(probeUrl);
    if (status === 200) return probeUrl;
  }
  return false;
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function discoverSource(library, version, opts = {}) {
  const signals = [];
  let suggestedUrl = null;
  let suggestedType = null;
  let reasoning = [];

  // Strategy 1 — registry lookup
  const reg = await probeRegistry(library);
  if (reg && reg.homepage) {
    signals.push({ kind: "registry_homepage" });
    reasoning.push(`Registry (${reg.kind}) homepage: ${reg.homepage}`);
    if (reg.repository) {
      try {
        const homeOrigin = new URL(reg.homepage).hostname;
        const repoOrigin = new URL(reg.repository.replace(/^git\+/, "")).hostname;
        if (homeOrigin === repoOrigin || repoOrigin.includes(homeOrigin) || homeOrigin.includes(repoOrigin)) {
          signals.push({ kind: "registry_homepage", boost: 0.05 });
          reasoning.push(`Registry homepage and repository match domain`);
        }
      } catch { /* parse error — ignore boost */ }
    }
    suggestedUrl = reg.homepage;
    suggestedType = "docs-site";

    // Strategy 2 — llms.txt probe (can run only if we have a homepage)
    const llmsUrl = await probeLlmsTxt(reg.homepage);
    if (llmsUrl) {
      signals.push({ kind: "llms_txt_200" });
      reasoning.push(`llms.txt found at ${llmsUrl}`);
      suggestedUrl = llmsUrl;
      suggestedType = "llms-txt";
    }
  }

  // Strategy 3 — fallback for ambiguous cases (offline-safe stub)
  // Production version would invoke web_search via Claude. In tests we skip
  // and surface as INCERTA when registry yielded nothing.
  if (!suggestedUrl && opts.allowWebSearch && opts.webSearchFn) {
    const ws = await opts.webSearchFn(library, version);
    if (ws) {
      signals.push({ kind: ws.confidence > 0.6 ? "web_search_high" : "web_search_low" });
      reasoning.push(`Web search: ${ws.url} (confidence ${ws.confidence})`);
      suggestedUrl = ws.url;
      suggestedType = ws.type || "docs-site";
    }
  }

  // Validate the suggested URL via SI-3 before returning
  let validated = false;
  if (suggestedUrl) {
    try {
      await validateUrl(suggestedUrl);
      validated = true;
    } catch (err) {
      reasoning.push(`URL rejected by SI-3: ${err.message}`);
      suggestedUrl = null;
    }
  }

  const confidence = signals.length > 0 ? scoreSignals(signals) : 0;

  return {
    library,
    version,
    url: validated ? suggestedUrl : null,
    type: validated ? suggestedType : null,
    confidence,
    reasoning,
    signals,
  };
}
