// scripts/lib/known-doc-urls.mjs — curated table of canonical doc URLs.
//
// Populated empirically from the 2026-05-08 E2E run (commit d79f446) where
// 13/13 libs scraped successfully after careful URL choice. URLs that worked
// are recorded here so future ADRs can reference them in ## Evidências
// without trial-and-error.
//
// CONSUMERS:
//   - skills/adr-builder/assets/KNOWN-DOC-URLS.md (mirrors this data, the
//     adr-builder skill consults the markdown asset when generating ADRs)
//   - scrape --auto-fallback (uses discoveryHints from manifest, which are
//     hydrated from ADR ## Evidências; this table is the source for those)
//
// MAINTENANCE:
//   - URLs go stale within months as docs sites restructure. When a scrape
//     fails for a lib in this table, check the doc site → update entry → bump
//     `verified` date. The date stamp helps future-you decide whether to
//     suspect the table or the scrape pipeline.
//
//   - To add a lib: scrape it manually, confirm > 100 lines of useful output,
//     add the URL + today's date.

export const KNOWN_DOC_URLS = {
  // verified 2026-05-08
  typescript: {
    primary: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html",
    fallbacks: [
      "https://www.typescriptlang.org/docs/handbook/intro.html",
    ],
    verified: "2026-05-08",
  },
  python: {
    primary: "https://docs.python.org/3.13/whatsnew/3.13.html",
    fallbacks: ["https://docs.python.org/3/tutorial/index.html"],
    verified: "2026-05-08",
  },
  react: {
    primary: "https://react.dev/learn",
    // react.dev/reference/* failed empirically — pure link lists, no prose.
    fallbacks: ["https://github.com/facebook/react"],
    verified: "2026-05-08",
  },
  next: {
    primary: "https://nextjs.org/docs/app/building-your-application/routing/route-handlers",
    fallbacks: ["https://nextjs.org/docs/app"],
    verified: "2026-05-08",
  },
  nextjs: {
    primary: "https://nextjs.org/docs/app/building-your-application/routing/route-handlers",
    fallbacks: ["https://nextjs.org/docs/app"],
    verified: "2026-05-08",
  },
  tauri: {
    primary: "https://v2.tauri.app/develop/calling-rust/",
    fallbacks: ["https://v2.tauri.app/start/"],
    verified: "2026-05-08",
  },
  fastapi: {
    primary: "https://fastapi.tiangolo.com/tutorial/first-steps/",
    fallbacks: ["https://fastapi.tiangolo.com/"],
    verified: "2026-05-08",
  },
  zustand: {
    // zustand.docs.pmnd.rs failed (JS-heavy SPA); github landing works
    primary: "https://github.com/pmndrs/zustand",
    fallbacks: [],
    verified: "2026-05-08",
  },
  zod: {
    // zod.dev/ is a thin landing page (intro + install only); the real docs
    // live in /basics, /api, /v4 sub-routes. md2llm doesn't navigate sidebars
    // — pointing at /basics gets prose-rich content (8+ snippets vs 3).
    primary: "https://zod.dev/basics",
    fallbacks: ["https://zod.dev/v4", "https://github.com/colinhacks/zod"],
    verified: "2026-05-08",
  },
  pydantic: {
    primary: "https://docs.pydantic.dev/2.10/concepts/models/",
    fallbacks: ["https://docs.pydantic.dev/latest/"],
    verified: "2026-05-08",
  },
  vitest: {
    primary: "https://vitest.dev/guide/",
    fallbacks: ["https://github.com/vitest-dev/vitest"],
    verified: "2026-05-08",
  },
  pytest: {
    primary: "https://docs.pytest.org/en/stable/getting-started.html",
    fallbacks: ["https://docs.pytest.org/en/stable/"],
    verified: "2026-05-08",
  },
  biome: {
    primary: "https://biomejs.dev/guides/getting-started/",
    fallbacks: ["https://biomejs.dev/"],
    verified: "2026-05-08",
  },
  ruff: {
    primary: "https://docs.astral.sh/ruff/configuration/",
    fallbacks: ["https://docs.astral.sh/ruff/"],
    verified: "2026-05-08",
  },
};

// Returns ordered list of URLs to try for a given lib (primary first, then
// fallbacks). Returns empty array when lib is not in the table — caller
// should fall back to ADR ## Evidências URLs.
export function getKnownUrls(lib) {
  const entry = KNOWN_DOC_URLS[String(lib).toLowerCase()];
  if (!entry) return [];
  return [entry.primary, ...(entry.fallbacks || [])];
}

// True when the table has any entry for this lib.
export function hasKnownUrls(lib) {
  return Object.prototype.hasOwnProperty.call(KNOWN_DOC_URLS, String(lib).toLowerCase());
}
