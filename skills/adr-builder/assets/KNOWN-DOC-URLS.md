# Known canonical doc URLs — cache + anti-pattern catalog

This asset is **two things**, not a closed table:

1. **Warm cache** of doc URLs already verified to scrape cleanly through the DevFlow `stacks scrape` pipeline. When the chosen stack appears here, the adr-builder agent uses these URLs and skips WebSearch (saves tokens, avoids flaky search results).

2. **Anti-pattern catalog** — the bottom of this file lists URL shapes that empirically fail (raw GitHub READMEs, API-reference-only pages, JS-heavy SPAs, registry pages). These rules **always apply**, even when WebSearch surfaces such a URL as the top result.

Mirrors `scripts/lib/known-doc-urls.mjs` — keep both in sync. Date stamps tell you when the URL was last verified; pages restructure and entries go stale within months.

**Maintenance:** Append-only by humans through PR. The adr-builder skill MUST NOT write into this file mid-run.

## How the adr-builder agent uses this file

1. **Check the cache table below.** If the lib is listed, use those URLs and skip web search.
2. **If not listed, WebSearch** for the lib's canonical docs.
3. **Apply the anti-patterns at the bottom** to filter out bad shapes — even if they appear in WebSearch results.
4. **Write 2-3 URLs** into `## Evidências` (primary first, alternates after) so `scrape --auto-fallback` has real options downstream.

## Table

| Lib            | Primary URL                                                                  | Fallbacks                                       | Verified   |
|----------------|------------------------------------------------------------------------------|-------------------------------------------------|------------|
| typescript     | https://www.typescriptlang.org/docs/handbook/2/everyday-types.html           | https://www.typescriptlang.org/docs/handbook/intro.html | 2026-05-08 |
| python         | https://docs.python.org/3.13/whatsnew/3.13.html                              | https://docs.python.org/3/tutorial/index.html   | 2026-05-08 |
| react          | https://react.dev/learn                                                      | https://github.com/facebook/react               | 2026-05-08 |
| next / nextjs  | https://nextjs.org/docs/app/building-your-application/routing/route-handlers | https://nextjs.org/docs/app                     | 2026-05-08 |
| tauri          | https://v2.tauri.app/develop/calling-rust/                                   | https://v2.tauri.app/start/                     | 2026-05-08 |
| fastapi        | https://fastapi.tiangolo.com/tutorial/first-steps/                           | https://fastapi.tiangolo.com/                   | 2026-05-08 |
| zustand        | https://github.com/pmndrs/zustand                                            | —                                               | 2026-05-08 |
| zod            | https://zod.dev/                                                             | https://github.com/colinhacks/zod               | 2026-05-08 |
| pydantic       | https://docs.pydantic.dev/2.10/concepts/models/                              | https://docs.pydantic.dev/latest/               | 2026-05-08 |
| vitest         | https://vitest.dev/guide/                                                    | https://github.com/vitest-dev/vitest            | 2026-05-08 |
| pytest         | https://docs.pytest.org/en/stable/getting-started.html                       | https://docs.pytest.org/en/stable/              | 2026-05-08 |
| biome          | https://biomejs.dev/guides/getting-started/                                  | https://biomejs.dev/                            | 2026-05-08 |
| ruff           | https://docs.astral.sh/ruff/configuration/                                   | https://docs.astral.sh/ruff/                    | 2026-05-08 |

## Anti-patterns (what NOT to put in ## Evidências)

These URL shapes have been empirically observed to fail scrape:

| Pattern                                         | Why it fails                                              |
|-------------------------------------------------|-----------------------------------------------------------|
| `raw.githubusercontent.com/.../README.md`       | md2llm produces no output (badges, ToCs, no prose body)   |
| `react.dev/reference/<api>` (pure API ref)      | Empty page shell — docs are JS-rendered link lists        |
| `<lib>.docs.pmnd.rs/...` (some JS-heavy SPAs)   | fetch-url returns 0 bytes — client-side rendering         |
| `npmjs.com/package/<lib>` (when lib has site)   | npm page only has install commands, not docs              |

When unsure, **prefer tutorial / guide pages over API reference** and **prefer the lib's own canonical docs site over GitHub README**.
