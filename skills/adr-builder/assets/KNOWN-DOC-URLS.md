# Known canonical doc URLs (verified scrape-friendly)

Use this table when populating `## Evidências` in newly-generated ADRs. The first URL listed for each lib has been empirically verified to scrape cleanly through the DevFlow `stacks scrape` pipeline (md2llm produces useful output, page has prose-rich docs). Fallbacks listed second.

Mirrors `scripts/lib/known-doc-urls.mjs` — keep both in sync. Date stamps tell you when the URL was last verified; pages restructure and entries go stale within months.

## How to use (instructions for the adr-builder agent)

When generating an ADR, populate the `## Evidências` section with the canonical URL for the chosen stack. Look up the lib in this table:

1. Find the row for your lib (lowercase, exact match).
2. Copy the **primary** URL into `## Evidências` as the first source.
3. Optionally include 1-2 fallback URLs.
4. If the lib is **not** in this table, fall back to your judgment — official docs site is the right place to look. Record what you chose.

The table is the seed for `discoveryHints` (populated by `extract-stacks --add-to-manifest`) which `scrape --auto-fallback` then iterates through if the primary fails.

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
