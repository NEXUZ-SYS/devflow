# Changelog

All notable changes to DevFlow are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-05-06

**First stable release of the DevFlow context layer foundation.**
v0.x → v1.0 marks the harness as production-ready across 5 supported
platforms (Claude Code, Cursor, Codex, Gemini CLI, OpenCode).

This release ships the full Gap 1-4 work tracked in
`.context/plans/context-layer-v2.md` (48 task groups, 215+ steps, 5 weeks
of design + execution under PREVC supervised mode):

### Headline changes

- **Semana 0** — ADR canonical path migrated `.context/docs/adrs/` →
  `.context/adrs/` with dual-read transitional support (removed in v1.2)
- **Gap 1 — Standards** (`.context/standards/`): triple-layer (Markdown +
  LLM-readable frontmatter + executable linter sandboxed via SI-4)
- **Gap 2 — Stacks** (`.context/stacks/`): artisanal pipeline
  (`docs-mcp-server` CLI + `md2llm`) replaces SaaS dependency on Context7
- **Gap 3 — Permissions** (`.context/permissions.yaml`): vendor-neutral
  deny-first grammar (deny → allow → mode → callback)
- **Gap 4 — Observability** (`.context/observability.yaml`): OTel GenAI
  semconv + `devflow.*` extension namespace, opt-in default

### Security invariants (SI-1 through SI-7)

Every component built in this release is tied to one or more cross-cutting
security invariants enforced by tests:

- **SI-1**: No `node -e` with interpolated user-controlled strings (regression
  test grep)
- **SI-2**: External commands always via `execFile`, never shell
- **SI-3**: URL allowlist (cloud metadata, RFC1918, link-local IPv4/IPv6,
  ULA, trailing-dot bypass) — applied to scrape URLs, callback URLs, OTel
  exporter endpoints
- **SI-4**: Linter execution sandboxed (path normalization + allowlist +
  realpath + `execFile node` + 5s timeout)
- **SI-5**: Glob subset (`**`/`*`/`?`/`{a,b}` only) — schema validators
  reject negation/extglob at load time
- **SI-6**: Scraped content sanitization (strips role markers + ignore-
  instructions phrases + sha256 canary fence)
- **SI-7**: Hook sequencing (X.2 before 0.5; deny-first ordering)

### 5 ADRs (all Aprovado)

| ADR | Topic | Decision kind |
|---|---|---|
| 001 | ADR path migration to .context/adrs/ | firm |
| 002 | Standards triple-layer | firm |
| 003 | Stack docs artisanal pipeline | firm |
| 004 | Permissions vendor-neutral | firm |
| 005 | Observability OTel GenAI | gated |

### Dependency policy

DevFlow stays **dependency-free** at runtime. Six in-house primitives
under `scripts/lib/` (glob, frontmatter, token-estimate, url-validator,
sanitize-snippet, path-resolver) replace `micromatch` / `gray-matter` /
`tiktoken`. The OpenTelemetry SDK is the **single exception** —
lazy-loaded only when `observability.enabled: true`. `docs-mcp-server`
and `md2llm` are invoked via `npx -y` (not bundled).

### Test summary

- 28 baseline tests on `main` → **55 tests** on `feat/context-layer-v2`
  (+27 new test files; 1 smoke gated by `RUN_SMOKE=1`)
- 4 audit rounds (architect + code-reviewer + security-auditor) with
  14 review findings + 8 security findings — **all blocking items fixed
  inline** (1 CRITICAL + 4 HIGH + 6 MEDIUM)

### Known limitations (deferred to v1.1+)

- **Token budget enforcement (Gate 5)** — observability only in v1.0;
  enforcement awaits 2-3 sprints of telemetry data
- **Performance validation in self-repo** — devflow is a bridge plugin
  without application frameworks. Full V.4 perf benchmarks deferred to
  pilot project test fixture (`tests/fixtures/project-simulation/`,
  scaffolded but not populated to 50-ADR scale here)
- **PII scrubbing** is best-effort regex (emails, IPv4, long digits).
  PCI/PHI workflows must use external scrubbers (Datadog Sensitive Data
  Scanner) and/or keep `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`
  disabled
- **OTLP exporter auth headers** — operators needing Datadog API keys etc.
  must set them via env vars in v1.0; first-class support in v1.1
- **`allow.tool: ["mcp__dotcontext__*"]` wildcards** — trusts MCP namespace;
  malicious user-installed MCP plugins could match. Lower impact (user-
  initiated install) but tracked for v1.1 docs
- **`parseInlineArray`** comma split breaks on `["a,b", "c"]` — real ADR/
  manifest patterns don't use quoted commas; v1.1 will switch to
  state-machine split

### Migration recipe (for projects on v0.13.x)

ADRs in legacy `.context/docs/adrs/`:

```bash
git mv .context/docs/adrs .context/adrs
grep -rln 'docs/adrs/' .context/ | xargs sed -i 's|docs/adrs/|adrs/|g'
node scripts/adr-update-index.mjs
git commit -m "chore(adr): migrate path from docs/adrs to adrs (devflow v1.0)"
```

Dual-read keeps v0.13.x projects working until v1.2 — migration is
opt-in until then.

---

## [1.0.0 development] — Semana 4 (Observability OTel) cumulative

> Mini-V/C entry per checkpoint policy. Security audit returned
> **PROCEED-WITH-CONSTRAINTS** (1 HIGH + 2 MEDIUM + 2 LOW); **all 5 items
> fixed inline before merge**. Final semana of Gap 1-4 work — release path
> (F.0a Aprovado batch + F.1-F.5) opens after this checkpoint.

### Added (Gap 4 — Observability OTel)

- **ADR-005** (`observability-otel-genai`, Proposto, audit 12/12 PASS):
  decision_kind `gated` (privacy + cost). 4 Drivers (standardization,
  replay, observability-before-enforcement, vendor-neutrality). Status
  flips to Aprovado in F.0a.
- **`.context/observability.yaml`** template:
  - `enabled: false` (default; opt-in)
  - 6 `gen_ai.*` + 12 `devflow.*` extension attributes captured
  - `gen_ai.prompt`/`gen_ai.completion` redacted by default
  - `contentCapture.envVar: OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`,
    `redactPii: true`
- **`scripts/lib/otel.mjs`**:
  - `loadObservabilityConfig` / `validateObservabilityConfig` (now applies
    SI-3 to `exporter.endpoint` per HIGH audit fix — same denylist as
    `permissions-evaluator` callback URL)
  - `createSpan(cfg, name)` — no-op when disabled (zero overhead, no SDK
    loaded); lazy-loads `@opentelemetry/sdk-node` + `exporter-trace-otlp-http`
    on first use when enabled. OTel deps are the SINGLE exception to no-deps
    policy.
  - `initOtel(cfg)` — awaitable initializer (MEDIUM #1 fix: prevents
    first-N-spans-dropped in one-shot CLIs)
  - `redactAttribute` — drops attribute by name OR scrubs PII (email/IPv4/
    long digits) when `redactPii: true`
  - `isContentCaptureEnabled` — gated by env var
- **`scripts/lib/repro-token.mjs`**:
  - `computeReproToken({ model, params, lockHash, toolDefinitionsHash })`:
    sha256 of canonical JSON (key-order-independent)
  - `hashToolDefinitions(tools)`: sorts by name (or full canonical JSON
    when name absent — LOW fix, prevents anonymous-tool collision)
- **`scripts/lib/otel-cli.mjs`**: stdin emitter for hook invocation. Awaits
  `initOtel` before emitting span (MEDIUM #1 fix). SI-1 compliant. 1MB cap.
- **Hook integrations** (all guarded by `if [ -f .context/observability.yaml ]`):
  - `hooks/session-start`: emits `devflow.session_start` span at end
  - `hooks/pre-tool-use`: emits `devflow.permission.deny` span before exit
    on deny (uses `gen_ai.tool.name` per OTel GenAI semconv — LOW fix)
  - `hooks/post-tool-use`: emits `devflow.tool_use` span at end of every
    tool call

### Security fixes (inline, from Semana 4 audit)

- **HIGH** — SSRF parity gap on `exporter.endpoint`. Operator-supplied OTLP
  endpoint had only "is non-empty string" check; `permissions-evaluator`
  callback already enforces SI-3 denylist. **Fixed**:
  `validateObservabilityConfig` now rejects metadata IPs (169.254.0.0/16,
  fd00:ec2::254, metadata.* hostnames, instance-data.ec2.internal),
  RFC1918 (10/8, 172.16-31/12, 192.168/16), 0/8, IPv6 link-local
  (fe80::/10) and ULA (fc00::/7), and trailing-dot bypass. Allows
  `http://localhost` (dev pattern: Jaeger/Phoenix on :4318). 5 regression
  tests added.
- **MEDIUM #1** — first-N spans silently dropped due to fire-and-forget
  `ensureSdkInitialized`. **Fixed (path c)**: added `initOtel(cfg)`
  awaitable wrapper; `otel-cli.mjs` awaits it before `createSpan`. Hooks
  invoke the CLI as one-shot, so the latency is acceptable.
- **MEDIUM #2** — PII patterns miss IPv6, formatted credit cards, JWT/AWS
  keys, formatted phones. **Fixed (path b)**: ADR-005 guardrail wording
  downgraded to "best-effort PII scrubbing" with explicit guidance for
  PCI/PHI environments to use external scrubbers (Datadog Sensitive Data
  Scanner) and/or keep content capture disabled.
- **LOW** — `gen_ai.tool.call.id` set to tool name (broke OTel GenAI
  semconv correlation in Langfuse/Phoenix). **Fixed**: renamed to
  `gen_ai.tool.name` in both `pre-tool-use` and `post-tool-use` hooks.
- **LOW** — `hashToolDefinitions` collision when multiple tools lack
  `name`. **Fixed**: fallback to full canonical JSON as sort key.

### Tests

- 53 tests post-Semana 3 → **55 tests** post-Semana 4 (+2 test files: 17
  cases for otel.mjs incl. 5 SSRF regressions + 8 cases for repro-token.mjs).
  All passing. SI-1 still PASS (no `node -e` interpolation).

### Known limitations (tracked, not blocking)

- LOW: PII scrubbing is best-effort (regex-based). Production PCI/PHI
  workflows require external scrubber. Documented in ADR-005 + observability.yaml.
- LOW: `OTLPTraceExporter` without explicit auth headers — operators
  needing auth (e.g., Datadog API key) must add `headers` to
  `exporter` config; v1.1 will support this directly.

---

## [1.0.0 development] — Semana 3 (Permissions) cumulative

> Mini-V/C entry per checkpoint policy (option B). Security audit returned
> **PROCEED-WITH-CONSTRAINTS** with 2 HIGH + 2 MEDIUM + 3 LOW; **all 4
> non-LOW items fixed inline before merge**.

### Added (Gap 3 — Permissions vendor-neutral)

- **ADR-004** (`permissions-vendor-neutral`, Proposto, audit 12/12 PASS):
  documents the deny→allow→mode→callback grammar. 4 Drivers
  (portabilidade, auditabilidade, defense-in-depth, composability).
  Status flips to Aprovado in F.0a.
- **`.context/permissions.yaml`** template:
  - `spec: devflow-permissions/v0` with `evaluationOrder: [deny, allow, mode, callback]`
  - 17 fs deny patterns (env, .ssh, secrets, AWS creds, kubeconfig,
    terraform state, etc. — N4 expanded coverage)
  - 11 exec deny patterns (force-push variants, `curl|sh`, `rm -rf /*`, etc.)
  - 5 net deny patterns (cloud metadata IPs)
  - allow.fs.{read,write} + allow.exec + allow.tool wildcards
  - `mode: prompt` (default), `callback: { url: null }` (opt-in)
  - `claudeCodeCompat: { preserveGitStrategyHook, preserveBranchProtectionExceptions }`
- **`scripts/lib/permissions-evaluator.mjs`**:
  - `evaluatePermissions(event, cfg)`: order deny → allow → mode → callback
  - `validatePermissionsSchema(cfg)`: SI-5 (rejects extglob/negação on all
    glob fields) + SI-3 (callback URL denylist with link-local IPv4/IPv6,
    ULA, instance-data, trailing-dot — H2 fix)
  - `loadPermissions(projectRoot)`: parses YAML, calls validator,
    **fail-closed to mode:deny on schema errors** (M1 fix from audit)
  - `extractNetTargets(command)`: extracts URLs/hostnames from Bash
    commands so `deny.net` is enforceable at runtime (H1 fix)
- **`scripts/lib/permissions-cli.mjs`**: stdin wrapper for hook invocation
  (SI-1 compliant, 1MB stdin cap).
- **`hooks/pre-tool-use`** wiring: permissions check runs FIRST (before
  Edit/Write filter, before branch-protection). Uses event.cwd (not PWD)
  so user-project permissions.yaml is read correctly. Inline JSON
  escape via `python3 json.dumps`.
- **`skills/git-strategy/SKILL.md`**: new "Compatibilidade com
  permissions.yaml" section explaining defense-in-depth + roadmap of
  hook removal in v1.2.

### Security fixes (inline, from Semana 3 audit)

- **HIGH H1**: `deny.net` declared but never evaluated at runtime — cloud
  metadata IPs in YAML were silently ignored. Fixed by adding URL/hostname
  extraction from Bash commands + direct `event.url` field handling.
  3 regression tests added.
- **HIGH H2**: SI-3 sync regex check missed link-local IPv4 (169.254.0.0/16
  beyond just `.169.254`), IPv6 link-local (fe80::), ULA (fc00::/7),
  `instance-data.ec2.internal`, trailing-dot bypass. Extended denylist
  with all gaps + URL parser-based trailing-dot check. 5 regression tests.
- **MEDIUM M1**: `loadPermissions` previously accepted invalid configs (bad
  globs, extglob/negation) silently — leading to silent fail-open at match
  time. Now calls `validatePermissionsSchema` at load and returns
  `{...cfg, mode: "deny"}` (fail-closed) when errors found. 1 regression test.
- **MEDIUM M2**: `localhost:*/admin/*` deny rule was unreachable at runtime
  (subset of H1). Fixed by H1's URL extraction; rule now matches Bash
  commands invoking `curl http://localhost:...`.

### Tests

- 51 tests post-Semana 2 → **53 tests** post-Semana 3 (+2 new test files:
  18 unit cases for permissions-evaluator including 9 security regressions
  + 3 shell integration cases for pre-tool-use). All passing.

### Known limitations (tracked, not blocking)

- LOW: `allow.exec: ["npx *"]` permits arbitrary code via untrusted npm
  packages — by design (operator opts in); v1.1 docs guide will flag this.
- LOW: `allow.tool: ["mcp__dotcontext__*"]` wildcards trust MCP namespace —
  malicious user-installed MCP plugin could register `mcp__dotcontext__rce`
  and slip through. Lower impact (user-initiated install).
- LOW: `permissions-cli.mjs` swallows errors silently to avoid
  fail-closed-by-error. v1.1 will add stderr diagnostic logging.

---

## [1.0.0 development] — Semana 2 (Stacks) cumulative

> Mini-V/C entry per checkpoint policy (option B). Security audit by
> `devflow:security-auditor` returned REVISE with 1 CRITICAL + 1 HIGH +
> 2 LOW; CRITICAL (path traversal via library name) and HIGH (path
> traversal via artisanalRef) **fixed inline before merge**.

### Added (Gap 2 — Stacks + artisanal pipeline)

- **ADR-003** (`stack-docs-artisanal-pipeline`, Proposto, audit 12/12 PASS):
  documents the pipeline architecture with corrected CLI invocation
  (`docs-mcp-server fetch-url`, NOT `docs-cli` as in spec). 6 Drivers
  (determinism/latency/cost/resilience/governance/audit). Status flips
  to Aprovado in F.0a.
- **`.context/stacks/`** scaffolding: `manifest.yaml` stub + `refs/.gitkeep`
  + `llms.txt` template. DevFlow self-repo has no frameworks (bridge plugin)
  but the structure is in place for user projects.
- **`scripts/lib/manifest-stacks.mjs`**:
  - `loadManifest(projectRoot)` parses `.context/stacks/manifest.yaml`
  - `validateManifest(m)`: spec, framework version, applyTo glob subset
    (SI-5), AND `artisanalRef` must match `refs/<lib>@<version>.md` with
    no traversal/abs paths (Semana 2 audit HIGH fix)
  - `hashRef()` returns sha256 hex of ref file
  - `findMissingRefs()` detects declared refs without backing file
- **`scripts/lib/frontmatter.mjs` rewrite**: recursive `parseBlock()`
  unblocks arbitrary nesting depth (manifests, future permissions/observability
  configs). Also handles list-of-maps pattern (`- key: val` with continuation
  lines) for `wishlist` entries.
- **Skill `scrape-stack-batch/`**:
  - `scripts/input-resolver.mjs` (Fase A): `parseArgPairs` /
    `resolveFromPackage` / `resolveFromManifest` / `resolveAll` with SI-3
    URL validation. **All 3 input paths reject path-traversal library
    names** (Semana 2 audit CRITICAL fix).
  - `scripts/discovery.mjs` (Fase B): registry probes (npm/PyPI/crates.io),
    llms.txt HEAD probe, optional web_search fallback. **Triple-gated
    SI-3** — every URL passes `validateUrl` before being returned.
  - `scripts/confidence.mjs`: scoring per spec §3.4.4 (max() rule),
    classify by 0.8/0.6 thresholds (recommended/review/uncertain).
  - `scripts/pipeline.mjs` (Fase D): RESOLVE/SCRAPE/REFINE/CONSOLIDATE.
    All `npx` invocations via `execFile` (SI-2). SI-6 sanitization +
    sha256 canary fence wrapping output. Defense-in-depth library
    validation in BOTH `resolve()` AND `consolidate()` (Semana 2 audit
    CRITICAL fix).
  - `SKILL.md` + 2 templates (confirmation + error prompts).
- **`scripts/devflow-stacks.mjs`** CLI dispatcher:
  - `validate [<lib>] [--strict]`: schema + missing refs + SI-6 fence
    + ≥5 code blocks (md2llm sanity)
  - `scrape <lib> <ver> --source=<type> --from=<url>`: single-lib pipeline
  - `scrape-batch [args] [--from-package|--from-manifest] [--dry-run]`:
    plan + delegation to skill for interactive flow
- **`scripts/devflow-drift.mjs`** + **`.github/workflows/stack-drift.yml`**:
  nightly + on-PR drift detection. Opens GitHub issue (with dedup) on
  nightly drift; fails PR check on PR drift.

### Security fixes (inline, from Semana 2 audit)

- **CRITICAL**: Path traversal via library name (e.g.,
  `package.json` key `"../../../tmp/pwned"`) would have written
  consolidated `.md` files outside `.context/stacks/refs/`. Fixed by:
  (1) tightening `SLUG_RE` in `pipeline.mjs` to npm-spec
  (`@scope/`-optional + single segment, no `..`, no leading dots);
  (2) defense-in-depth re-validation in `consolidate()`;
  (3) `isSafeLibrary()` filter in all 3 input-resolver paths
  (`parseArgPairs`, `resolveFromPackage`, `resolveFromManifest`).
  Added 5 regression tests across input-resolver and pipeline suites.

- **HIGH**: Path traversal via `artisanalRef` (e.g., manifest
  `artisanalRef: "../../../etc/passwd"`) would have allowed arbitrary
  local file reads via `existsSync`/`readFileSync`. Fixed by adding
  strict `refs/<safe-chars>.md` regex check in `validateManifest()`.
  Added 4 regression tests in `test-manifest-stacks.mjs`.

### Tests

- 44 tests post-Semana 1 → **51 tests** post-Semana 2 (+7 new test
  files: confidence, discovery, pipeline, input-resolver, devflow-stacks,
  devflow-drift, manifest-stacks). 1 skipped (smoke pipeline gated by
  `RUN_SMOKE=1` env). 9 net regression tests added by security fixes.

### Known limitations (tracked, not blocking)

- LOW: `parseInlineArray` in frontmatter parser splits on comma —
  edge case `["a,b", "c"]` parses as 3 items. Real ADR/manifest
  patterns don't use quoted commas; documented constraint, fix in v1.1.
- LOW: GitHub Actions `actions/github-script@v7` interpolation — mitigated
  by parser-level rejection of backticks/`${` in framework keys (regex
  `[A-Za-z_][\w-]*`), but remains a defense-in-depth gap. v1.1 will
  switch to `core.getInput`-based pattern.

---

## [1.0.0 development] — Semana 1 (Standards) cumulative since 1.0.0-rc1

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
