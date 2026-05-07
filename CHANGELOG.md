# Changelog

All notable changes to DevFlow are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased] — Semana 1 (Standards) cumulative since 1.0.0-rc1

> Mini-V/C entry per checkpoint policy (option B). Final 1.0.0 release ships
> after all 4 Gaps + V/C task groups complete. Security audit by
> `devflow:security-auditor` returned PASS with 3 LOW + 2 INFO items (no
> blockers); LOW #1 (stdin size cap) fixed inline.

### Added (Gap 1 — Standards)

- **ADR-002** (`adopt-standards-triple-layer`, Proposto, audit 12/12 PASS):
  documents the architectural decision for standards as triple layer (Markdown
  + LLM-readable frontmatter + executable linter, with `weakStandardWarning`
  fallback). Status flips to Aprovado in F.0a.
- **`.context/standards/`** directory + `README.md` authoring guide (pt-BR)
  covering frontmatter spec, applyTo glob subset (SI-5), linter sandboxing
  (SI-4), 7 anti-patterns, and CLI usage.
- **`scripts/lib/standards-loader.mjs`** — `loadStandards(projectRoot)` parses
  frontmatter, validates applyTo against SI-5, marks weak standards.
  `findApplicableStandards(filePath, standards)` filters by glob match.
- **`scripts/lib/run-linter.mjs`** — SI-4 sandboxed linter runner:
  - 5 enforcement layers (format regex → forbidden chars → absolute path →
    sandbox prefix → realpath symlink check)
  - `execFile('node', [linter, file], { timeout: 5000, maxBuffer: 1MB })` —
    no shell, no `exec`
  - 11 unit tests + 3 RCE rejection shell tests (path traversal, abs path,
    shell metacharacters with canary file)
- **`scripts/lib/run-linter-cli.mjs`** — stdin wrapper for hook invocation.
  SI-1 compliant (no `node -e` interpolation). 1MB stdin size cap (security
  audit LOW #1 fix).
- **`scripts/devflow-standards.mjs`** — CLI dispatcher:
  - `new <id>` scaffolds `.context/standards/std-<id>.md` + linter template
  - `verify [<id>] [--strict]` validates applyTo subset, linter file existence,
    weak-standard warnings; `--strict` exits non-zero on weak standards
- **`hooks/post-tool-use`** integration: parses Edit/Write events from stdin,
  invokes `run-linter-cli.mjs` via JSON envelope, appends violations to the
  reminder context.
- **Frontmatter parser extended** (`scripts/lib/frontmatter.mjs`): handles
  non-empty inline arrays (`applyTo: ["src/**", "test/**"]`).

### Tests

- 39 tests post-Semana 0 → **44 tests** post-Semana 1 (+5 new test files,
  +25 test cases). All passing.
- Security regression: SI-1 (no `node -e` interpolation), SI-4 (3 RCE vectors
  rejected), SI-5 (glob subset enforced) — all PASS.

### Known limitations (tracked, not blocking)

- Weak-standard policy is non-blocking by default (security LOW). CI must
  invoke `devflow standards verify --strict` to enforce.
- `applyTo: ["**"]` would match dotfiles like `.git/`, `.context/`. Linters
  still sandboxed via SI-4, but standards using global patterns may produce
  noise. Tracking for v1.1 (`findApplicableStandards` exclusion list).

---

## [1.0.0-rc1] — 2026-05-06

Release candidate for **v1.0.0** — first stable release of the context layer
foundation. v0.x → v1.0 marks the harness as stable for production use across
the 5 supported platforms (Claude Code, Cursor, Codex, Gemini CLI, OpenCode).

This RC ships **Semana 0 (ADR path migration)** of the context-layer-v2 work.
Subsequent RCs will land Gap 1 (Standards), Gap 2 (Stacks), Gap 3 (Permissions),
Gap 4 (Observability) before the final 1.0.0 release.

### BREAKING (mitigated by dual-read)

- **ADR canonical path migrated** from `.context/docs/adrs/` to `.context/adrs/`.
  - All scripts (`adr-update-index`, `adr-audit`, `adr-evolve`) and the
    `hooks/session-start` hook now READ from both paths during the v1.0.x and
    v1.1.x transition window. Path is removed in **v1.2.0**.
  - Existing projects on legacy path continue working without changes.
  - SessionStart and `adr-audit` emit `LEGACY_PATH_DETECTED` warning when only
    legacy contributes ADRs.
  - `adr-evolve` migrates legacy ADRs to canonical path on `--apply`
    (transparent migration during patch/minor evolves).
  - **Migration recipe** for projects in legacy state:
    ```bash
    git mv .context/docs/adrs .context/adrs
    grep -rln 'docs/adrs/' .context/ | xargs sed -i 's|docs/adrs/|adrs/|g'
    node scripts/adr-update-index.mjs
    git commit -m "chore(adr): migrate path from docs/adrs to adrs (devflow v1.0)"
    ```

### Added

- **Security invariants (SI-1 through SI-7)** as plan-level constraints
  embedded in `.context/plans/context-layer-v2.md`:
  - SI-1: No `node -e` interpolation of user-controlled strings (regression
    test at `tests/hooks/test-no-node-e-interpolation.sh`)
  - SI-2: External commands always via `execFile`, never shell
  - SI-3: URL allowlist (`scripts/lib/url-validator.mjs`) — rejects cloud
    metadata, RFC1918, link-local, file://, and other SSRF vectors; defeats
    DNS rebinding by re-resolving hostnames
  - SI-4: Linter execution sandboxed (path normalization + allowlist + execFile
    + 5s timeout)
  - SI-5: Glob subset enforcement — schema validators reject negation (`!`) and
    extglob (`+(...)`/`@(...)`/etc.)
  - SI-6: Scraped content sanitization (`scripts/lib/sanitize-snippet.mjs`) —
    strips role markers + ignore-instructions phrases; wraps in fenced
    delimiter with sha256 canary
  - SI-7: Hook sequencing constraints (X.2 before 0.5; deny-first ordering)

- **In-house primitives** (no npm dependencies):
  - `scripts/lib/glob.mjs` — micromatch substitute (subset: `**`, `*`, `?`,
    `{a,b}`)
  - `scripts/lib/frontmatter.mjs` — gray-matter substitute (YAML subset,
    rejects anchors and references)
  - `scripts/lib/token-estimate.mjs` — tiktoken substitute (char-approx ±15%,
    sufficient for observability Gate 3 in v1.0)
  - `scripts/lib/url-validator.mjs` — SI-3 SSRF allowlist
  - `scripts/lib/sanitize-snippet.mjs` — SI-6 prompt-injection stripper
  - `scripts/lib/path-resolver.mjs` — Semana 0 dual-read helper
    (`resolveAdrPath`)

- **ADR template fields (optional, v1.0+)**:
  - `summary` field (Y-statement, ≤240 chars) — used by SessionStart in
    `<ADR_GUARDRAILS>` Stage-1 disclosure when present
  - `Drivers` section (omit if ≤2 forces) — for decisions with ≥3 concurrent
    forces

- **ADR-001** (Proposto): Migrate save path from `.context/docs/adrs/` to
  `.context/adrs/` with dual-read transitional support. Audit 12/12 PASS.
  Status flipped to Aprovado in F.0a after content stabilizes.

### Changed

- `skills/adr-builder/SKILL.md`: 9 path occurrences updated; HARD-GATE
  forbids legacy path explicitly (read-only via dual-read).
- 6 other skills (`adr-filter`, `prevc-validation`, `prevc-planning`,
  `prd-generation`, `context-sync`, `context-awareness`) updated to canonical
  path; readers (`adr-filter`, `prevc-planning`, `prevc-validation`) gained
  dual-read fallback notes.
- `scripts/adr-update-index.mjs`: scans both paths; writes README to
  whichever path contains ADRs (canonical wins on collision).
- `scripts/adr-audit.mjs`: emits stderr `LEGACY_PATH_DETECTED` when only
  legacy path exists.
- `scripts/adr-evolve.mjs`: migrate-on-write — patch/minor evolves move
  legacy ADRs to canonical path atomically via `git mv`.
- `hooks/session-start`: dual-path scan + N6 stderr warning when legacy
  contributes ADRs.

### Removed

- The 2 test ADRs (`001-tdd-python`, `002-code-review`) from the devflow
  self-repo `.context/docs/adrs/` — they were test data, not real architectural
  decisions about devflow itself. Numbering reset for v1.0 organizational ADRs.

### Tests

- 28 baseline tests → **40+ tests** after Semana 0 (12+ new across the in-house
  primitives, dual-read scenarios, and security regressions). All passing.

### Known Limitations (deferred to later RCs)

- Token budget enforcement (Gate 5) — observability only in v1.0; enforcement
  is roadmap v1.1+ once 2-3 sprints of telemetry are collected.
- Performance validation in self-repo not representative — full V.4 perf
  benchmarks run against `tests/fixtures/project-simulation/` (Task Group V.1
  in subsequent RCs).
- Standards (Gap 1), Stacks (Gap 2), Permissions (Gap 3), Observability
  (Gap 4) ship in subsequent RCs before final 1.0.0.

---

## [0.13.6] — Earlier

See git history for prior versions.
