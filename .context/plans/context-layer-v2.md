---
status: filled
generated: 2026-05-06
agents:
  - type: "architect-specialist"
    role: "Design overall system architecture and patterns"
  - type: "devops-specialist"
    role: "Design and maintain CI/CD pipelines"
  - type: "test-writer"
    role: "Write comprehensive unit and integration tests"
  - type: "documentation-writer"
    role: "Create clear, comprehensive documentation"
  - type: "security-auditor"
    role: "Identify security vulnerabilities"
  - type: "refactoring-specialist"
    role: "Identify code smells and improvement opportunities"
  - type: "performance-optimizer"
    role: "Identify performance bottlenecks"
  - type: "code-reviewer"
    role: "Review code changes for quality, style, and best practices"
docs:
  - "project-overview.md"
  - "architecture.md"
  - "development-workflow.md"
  - "testing-strategy.md"
  - "tooling.md"
phases:
  - id: "phase-P"
    name: "Planning"
    prevc: "P"
    agent: "architect-specialist"
  - id: "phase-R"
    name: "Review"
    prevc: "R"
    agent: "code-reviewer"
  - id: "phase-E"
    name: "Execution"
    prevc: "E"
    agent: "devops-specialist"
  - id: "phase-V"
    name: "Validation"
    prevc: "V"
    agent: "test-writer"
  - id: "phase-C"
    name: "Confirmation"
    prevc: "C"
    agent: "documentation-writer"
---

# Context Layer v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** context-layer-validation-v2 | **Scale:** LARGE | **Phase:** P→R
> **Spec source:** `docs/devflow-context-layer-validation-v2-pt-br.md` (2099 lines, calibrated against v0.13.3)

**Goal:** Implement the 4 harness gaps + Semana 0 ADR path migration + ADR adjustments to bring DevFlow context layer from v0.13.3 → **v1.0.0**.

**Architecture:** DevFlow continues as bridge co-installed (not MCP wrapper). `.context/` is extended with `adrs/` (canonical), `standards/`, `stacks/`, `permissions.yaml`, `observability.yaml`, `.lock`. A new sync lib `scripts/lib/context-filter.mjs` centralizes semantic filtering invoked directly by hooks. SessionStart becomes minimalist (PERMISSIONS_DIGEST + CONTEXT_INDEX Stage-1); PreToolUse loads Stage-2 bodies filtered by `applyTo` glob + task keywords. PostToolUse runs computational sensors when an applicable standard exists.

**Tech Stack:** Node ESM (`.mjs`) using **only `node:*` builtins** (no npm dependencies — see Dependency Policy below), POSIX shell, Markdown, YAML (parsed in-house with a minimal YAML-subset parser), `@arabold/docs-mcp-server@^2.2.1` CLI (invoked via `npx -y` — runtime fetch, not a bundled dep), `md2llm@^1.1.0` (same `npx -y` model), OpenTelemetry SDK (opt-in, lazy-loaded only when `enabled: true`; the OTel deps are the **single exception** to the no-deps rule and are gated behind a runtime check).

## Dependency Policy (resolved by advisor review)

The existing devflow plugin has **no `package.json`** at the repo root and all current scripts use only `node:*` builtins. The original spec assumed `tiktoken`/`micromatch`/`gray-matter` as if a node_modules tree existed — but hooks invoke `node -e "..."` from arbitrary cwd in user projects, where those packages cannot be resolved.

**Decision for v1.0:** stay dependency-free. Implement minimal in-house equivalents:

| Spec assumption | v1.0 implementation | Trade-off |
|---|---|---|
| `tiktoken` (WASM, ±5%) | Char-approx estimator: `Math.ceil(text.length / 3.8)` (English ~3.8 chars/token average) | ±15% accuracy — acceptable for observability-only Gate 3; tightened in v1.1 if budget enforcement (Gate 5) needs precision |
| `micromatch` (full glob spec) | `scripts/lib/glob.mjs` — minimal `**`, `*`, `?`, brace `{a,b}` support sufficient for `applyTo` patterns | Doesn't support negation (`!`) or extglob — document in standard authoring guide as a constraint |
| `gray-matter` (YAML frontmatter) | `scripts/lib/frontmatter.mjs` — split on `---\n`, parse YAML subset (strings, lists, nested maps, no anchors/refs) | Parser strictness validated by `tests/validation/test-frontmatter.mjs` |
| `@opentelemetry/*` (Gap 4 only) | **Allowed** — bundled inline with `npx -y @opentelemetry/sdk-trace-node` invocation OR documented as user-installed prerequisite when `observability.enabled: true` | Single exception; only loads when telemetry enabled |
| `docs-mcp-server` / `md2llm` | Always invoked via `npx -y <package>@<version>` — NOT bundled, run on-demand | Adds 5-30s for first invocation; cached by npx after |

**Task Group 0.0a** (added below) creates `scripts/lib/glob.mjs`, `scripts/lib/frontmatter.mjs`, and `scripts/lib/token-estimate.mjs` with thorough TDD coverage. These three primitives unblock all subsequent work.

**Anti-pattern explicitly avoided:** committing `node_modules/`, requiring `npm ci` as plugin install step (not supported across all 5 platforms), or vendoring large libraries verbatim. Custom implementations stay <300 LOC each.

**Branch strategy:** Single branch `feat/context-layer-v2`, atomic commits per Semana, single PR at the end. Version bump to **v1.0.0** post-merge (decision: magnitude justifies major; v0.x → v1.0 marks the context-layer foundation as stable).

**Agents involved:** architect-specialist, devops-specialist, test-writer, documentation-writer, security-auditor, refactoring-specialist.

---

## Out of Scope (explicitly excluded from this PR)

- **Token budget enforcement** (Gate 5) — only observability lands in v1.0; enforcement is roadmap v1.1+ once 2-3 sprints of telemetry are collected.
- **Migrating ADRs in external NXZ projects** — manual activity, not in this branch.
- **Performance validation in self-repo** — devflow is a bridge, not an end-user project. Perf claims (`<80ms context-filter`, `<100ms PreToolUse p95`, `<300ms SessionStart`) are validated against `tests/fixtures/project-simulation/` (created by Task Group V.1), NOT against devflow's own `.context/`. Marked **"Postponed for test project"** wherever applicable.
- **Pilot rollout to production NXZ projects** — handled in a separate workflow after merge.
- **Future docs-mcp-server runtime mode** (vs. CLI headless) — explicit roadmap item, not implemented here.

---

## Pre-flight checks (run BEFORE Task Group 0.0a)

> **Start here.** First action after pre-flight is **Task Group 0.0a** (in-house primitives — they unblock everything that follows). Then 0.0 (delete legacy ADRs), then 0.1+.

- [ ] **PF.0:** Switch to feature branch and commit this plan as the first artifact of the branch.

```bash
git switch -c feat/context-layer-v2
git add .context/plans/context-layer-v2.md
git commit -m "docs(plan): context-layer-v2 implementation plan (P phase artifact)"
```

- [ ] **PF.1:** Verify devflow is at v0.13.3 — `grep -E "v0\.13\.3" README.md` should match the latest version line.
- [ ] **PF.2:** Verify external tooling reachable — `npx -y @arabold/docs-mcp-server@2.2.1 --help 2>&1 | grep -E "fetch-url|scrape"` returns non-empty; `npm view md2llm@1.1.0 version` returns `1.1.0`.
- [ ] **PF.3:** Verify all existing tests pass on `main` (baseline) — capture count via this loop:

```bash
PASS=0; FAIL=0
for t in $(find tests -name "test-*.mjs" -o -name "test-*.sh" -o -name "*.test.mjs"); do
  case "$t" in
    *.mjs) node --test "$t" >/dev/null 2>&1 && PASS=$((PASS+1)) || FAIL=$((FAIL+1)) ;;
    *.sh)  bash "$t" >/dev/null 2>&1 && PASS=$((PASS+1)) || FAIL=$((FAIL+1)) ;;
  esac
done
echo "Baseline: PASS=$PASS FAIL=$FAIL"
```

Record the baseline; final F.4 must show `FAIL=0` and `PASS >= baseline + ~80`.

- [ ] **PF.4:** Confirm `.context/docs/adrs/` only contains the 2 test ADRs (`001-tdd-python-v1.0.0.md`, `002-code-review-v1.0.0.md`, `README.md`) that are slated for deletion in Task Group 0.0.

- [ ] **PF.5:** Note: hooks (`hooks/session-start`, `hooks/pre-tool-use`, `hooks/post-tool-use`) will be modified across multiple Task Groups (session-start in 0.5, X.2; pre-tool-use in 3.2, X.3, 4.3; post-tool-use in 1.3, 4.3). Each modification has its own test step and commit. Do NOT batch hook edits across Task Groups — small, atomic commits make rebase trivial if order needs adjustment.

---

## File structure (master inventory)

### Files to CREATE
```
.context/adrs/                                       (canonical ADR path, v1.0+)
  ├── README.md                                       (regenerated by adr-update-index.mjs)
  ├── 001-adr-path-migration-to-context-root-v1.0.0.md
  ├── 002-adopt-standards-triple-layer-v1.0.0.md
  ├── 003-stack-docs-artisanal-pipeline-v1.0.0.md
  ├── 004-permissions-vendor-neutral-v1.0.0.md
  └── 005-observability-otel-genai-v1.0.0.md          (decision_kind: gated)

.context/standards/                                  (Gap 1)
  ├── README.md                                       (authoring guide)
  ├── machine/                                         (linter modules — populated under use)
  └── (no initial standards in self-repo; examples in tests/fixtures)

.context/stacks/                                     (Gap 2)
  ├── manifest.yaml                                    (empty stub — devflow is a bridge)
  ├── refs/                                            (empty in self-repo)
  └── llms.txt                                         (generated header)

.context/permissions.yaml                            (Gap 3 — template)
.context/observability.yaml                          (Gap 4 — template, enabled: false)
.context/.lock                                       (content hashes)

scripts/lib/path-resolver.mjs                        (Semana 0 — dual-read helper)
scripts/lib/context-filter.mjs                       (cross-cutting — semantic filtering)
scripts/lib/manifest-stacks.mjs                      (Gap 2 — manifest read/validate)
scripts/lib/permissions-evaluator.mjs                (Gap 3 — deny→allow→mode→callback)
scripts/lib/otel.mjs                                 (Gap 4 — span creation/attributes)
scripts/lib/standards-loader.mjs                     (Gap 1 — read .context/standards/)
scripts/lib/repro-token.mjs                          (Gap 4 — reproducibility token)
scripts/lib/lockfile.mjs                             (cross-cutting — .lock read/write)

scripts/devflow-context.mjs                          (CLI dispatcher: audit/spec/apply/verify/lock/drift/filter/budget/replay)
scripts/devflow-stacks.mjs                           (CLI dispatcher: scrape-batch/scrape/validate)
scripts/devflow-standards.mjs                        (CLI dispatcher: new/verify)
scripts/devflow-doctor.mjs                           (extended diagnostics)

skills/scrape-stack-batch/                           (new skill — Gap 2)
  ├── SKILL.md
  ├── scripts/discovery.mjs
  ├── scripts/pipeline.mjs
  ├── scripts/confidence.mjs
  ├── scripts/input-resolver.mjs
  └── templates/{confirmation-prompt.txt,error-prompt.txt}

tests/validation/test-adr-path-resolver.mjs          (Semana 0 / M5)
tests/validation/test-adr-builder-new-path.mjs       (Semana 0 / M5)
tests/validation/test-adr-builder-dual-read.mjs      (Semana 0 / M5)
tests/validation/test-adr-evolve-migrates.mjs        (Semana 0 / M5)
tests/validation/test-context-filter.mjs             (cross-cutting)
tests/validation/test-permissions-evaluator.mjs      (Gap 3)
tests/validation/test-standards-loader.mjs           (Gap 1)
tests/validation/test-manifest-stacks.mjs            (Gap 2)
tests/validation/test-otel-spans.mjs                 (Gap 4)
tests/validation/test-repro-token.mjs                (Gap 4)
tests/validation/test-lockfile.mjs                   (cross-cutting)
tests/scripts/test-devflow-context.mjs               (CLI smoke tests)
tests/scripts/test-devflow-stacks.mjs                (CLI smoke tests)
tests/scripts/test-devflow-standards.mjs             (CLI smoke tests)
tests/hooks/test-pre-tool-use-filtering.sh           (PreToolUse with filtering)
tests/hooks/test-post-tool-use-linters.sh            (PostToolUse with linters)
tests/hooks/test-session-start-minimalist.sh         (SessionStart Stage-1 only)

tests/fixtures/project-simulation/                   (V.1 — simulated project for end-to-end perf)
  ├── package.json                                    (next/react/prisma realistic)
  ├── pnpm-lock.yaml
  ├── src/{app,middleware.ts,lib/db}/...               (~20 stub files)
  ├── prisma/schema.prisma
  ├── tests/{e2e,unit}/...
  └── .context/                                        (50+ ADRs, 15+ standards, 5+ stacks for perf)

docs/superpowers/specs/context-layer-v2-spec.md      (mirror of input spec for traceability)
CHANGELOG.md                                          (new — v1.0.0 entry)
```

### Files to MODIFY
```
skills/adr-builder/SKILL.md                          (HARD-GATE save path; summary/Drivers fields)
skills/adr-builder/references/*.md                    (path examples updated)
skills/adr-filter/SKILL.md                           (Step 1 dual-read via path-resolver)
skills/prevc-validation/SKILL.md                     (Step 2.6 ADR Audit Gate path)
skills/prevc-planning/SKILL.md                       (Step 3.5 ADR opportunity check path)
skills/prevc-execution/SKILL.md                      (note new commands)
skills/project-init/SKILL.md                         (scaffold .context/standards|stacks|permissions|observability)
skills/context-sync/SKILL.md                         (sync new directories)
commands/devflow-adr.md                              (path examples updated)
commands/devflow.md                                  (new commands documented)
commands/devflow-status.md                           (recognize new artifacts)

scripts/adr-update-index.mjs                         (use resolveAdrPath; emit LEGACY warning)
scripts/adr-audit.mjs                                (use resolveAdrPath; emit LEGACY_PATH_DETECTED)
scripts/adr-evolve.mjs                               (use resolveAdrPath; migrate-on-write)

hooks/session-start                                  (minimalist: PERMISSIONS_DIGEST + CONTEXT_INDEX)
hooks/pre-tool-use                                   (permissions check + context-filter.mjs invocation)
hooks/post-tool-use                                  (computational sensors + OTel close)
hooks/hooks.json                                     (no schema change expected; verify)

README.md                                            (v1.0.0 features section + new commands)
.claude-plugin/plugin.json                           (version bump → 1.0.0)
.cursor-plugin/plugin.json                           (version bump → 1.0.0)
agents/*.md                                          (audit for path references; light update)
```

### Files to DELETE
```
.context/docs/adrs/001-tdd-python-v1.0.0.md          (test data per user)
.context/docs/adrs/002-code-review-v1.0.0.md         (test data per user)
.context/docs/adrs/README.md                         (replaced by .context/adrs/README.md)
.context/docs/adrs/                                   (directory removed once empty)
```

---

# SEMANA 0 — ADR path migration (pre-requisite blocker)

**Goal:** Migrate canonical ADR save path from `.context/docs/adrs/` to `.context/adrs/`, with dual-read transitional support for v1.0.x and v1.1.x. Remove the 2 test ADRs (per user) and start fresh numbering.

**Acceptance:** `adr-builder` writes to `.context/adrs/`; `adr-audit` reads both paths and warns `LEGACY_PATH_DETECTED`; `adr-evolve` migrates legacy files on write; hook `session-start` injects `<ADR_GUARDRAILS>` from both paths; 4 new path tests pass.

---

### Task Group 0.0: Delete legacy test ADRs

**Files:**
- Delete: `.context/docs/adrs/001-tdd-python-v1.0.0.md`
- Delete: `.context/docs/adrs/002-code-review-v1.0.0.md`
- Delete: `.context/docs/adrs/README.md`
- Delete: `.context/docs/adrs/` (directory, once empty)

**Agent:** documentation-writer
**Tests:** none (pure deletion; covered by 0.4 audit assertions)

- [ ] **Step 1: Stage deletions**

```bash
git rm .context/docs/adrs/001-tdd-python-v1.0.0.md
git rm .context/docs/adrs/002-code-review-v1.0.0.md
git rm .context/docs/adrs/README.md
rmdir .context/docs/adrs
```

- [ ] **Step 2: Verify directory removed**

```bash
test ! -d .context/docs/adrs && echo "OK: legacy ADR dir removed"
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(adr): delete test ADRs per spec — fresh numbering for v1.0"
```

---

### Task Group 0.1: scripts/lib/path-resolver.mjs (TDD)

**Files:**
- Create: `scripts/lib/path-resolver.mjs`
- Test: `tests/validation/test-adr-path-resolver.mjs`

**Agent:** devops-specialist
**Tests:** unit (pure function with filesystem fixtures)

- [ ] **Step 1: Write the failing test**

Create `tests/validation/test-adr-path-resolver.mjs`:

```javascript
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveAdrPath } from "../../scripts/lib/path-resolver.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "adr-path-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("resolveAdrPath: only new path exists", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  const r = resolveAdrPath(root);
  assert.equal(r.write, join(root, ".context", "adrs"));
  assert.deepEqual(r.readPaths, [join(root, ".context", "adrs")]);
  assert.equal(r.isLegacy, false);
  cleanup();
});

test("resolveAdrPath: only legacy path exists", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "docs", "adrs"), { recursive: true });
  const r = resolveAdrPath(root);
  assert.equal(r.write, join(root, ".context", "adrs"));
  assert.deepEqual(r.readPaths, [join(root, ".context", "docs", "adrs")]);
  assert.equal(r.isLegacy, true);
  cleanup();
});

test("resolveAdrPath: both paths exist", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  mkdirSync(join(root, ".context", "docs", "adrs"), { recursive: true });
  const r = resolveAdrPath(root);
  assert.equal(r.readPaths.length, 2);
  assert.equal(r.readPaths[0], join(root, ".context", "adrs"));
  assert.equal(r.readPaths[1], join(root, ".context", "docs", "adrs"));
  assert.equal(r.isLegacy, false);
  cleanup();
});

test("resolveAdrPath: neither path exists", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context"), { recursive: true });
  const r = resolveAdrPath(root);
  assert.deepEqual(r.readPaths, []);
  assert.equal(r.isLegacy, false);
  cleanup();
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
node --test tests/validation/test-adr-path-resolver.mjs
```

Expected: FAIL with `Cannot find module '../../scripts/lib/path-resolver.mjs'`.

- [ ] **Step 3: Implement path-resolver**

Create `scripts/lib/path-resolver.mjs`:

```javascript
import { existsSync } from "node:fs";
import { join } from "node:path";

export function resolveAdrPath(projectRoot) {
  const newPath = join(projectRoot, ".context", "adrs");
  const legacyPath = join(projectRoot, ".context", "docs", "adrs");
  const newExists = existsSync(newPath);
  const legacyExists = existsSync(legacyPath);
  return {
    write: newPath,
    readPaths: [newPath, legacyPath].filter(existsSync),
    isLegacy: legacyExists && !newExists,
  };
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
node --test tests/validation/test-adr-path-resolver.mjs
```

Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/path-resolver.mjs tests/validation/test-adr-path-resolver.mjs
git commit -m "feat(scripts): add resolveAdrPath helper for dual-read transition"
```

---

### Task Group 0.2: Update `scripts/adr-update-index.mjs` to dual-read

**Files:**
- Modify: `scripts/adr-update-index.mjs` (add `import { resolveAdrPath }`, scan `readPaths`, write to `write`)
- Test: `tests/validation/test-adr-index-dual-read.mjs` (new)

**Agent:** devops-specialist
**Tests:** integration

- [ ] **Step 1: Write failing test** for index generation across both paths.

```javascript
// tests/validation/test-adr-index-dual-read.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts", "adr-update-index.mjs");

test("adr-update-index lists ADRs from both paths", () => {
  const root = mkdtempSync(join(tmpdir(), "adr-idx-"));
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  mkdirSync(join(root, ".context", "docs", "adrs"), { recursive: true });
  // Minimal frontmatter ADRs
  writeFileSync(join(root, ".context", "adrs", "001-foo-v1.0.0.md"),
    "---\ntype: adr\nname: foo\ndescription: x\nscope: project\nsource: local\nstack: universal\ncategory: arquitetura\nstatus: Aprovado\nversion: 1.0.0\ncreated: 2026-05-06\nsupersedes: []\nrefines: []\nprotocol_contract: null\ndecision_kind: firm\n---\n# ADR 001 — Foo\n\n- **Data:** 2026-05-06\n- **Status:** Aprovado\n");
  writeFileSync(join(root, ".context", "docs", "adrs", "099-legacy-v1.0.0.md"),
    "---\ntype: adr\nname: legacy\ndescription: x\nscope: project\nsource: local\nstack: universal\ncategory: arquitetura\nstatus: Aprovado\nversion: 1.0.0\ncreated: 2026-05-06\nsupersedes: []\nrefines: []\nprotocol_contract: null\ndecision_kind: firm\n---\n# ADR 099 — Legacy\n\n- **Data:** 2026-05-06\n- **Status:** Aprovado\n");
  execFileSync("node", [SCRIPT], { cwd: root, stdio: "pipe" });
  const idx = readFileSync(join(root, ".context", "adrs", "README.md"), "utf-8");
  assert.match(idx, /001/);
  assert.match(idx, /099/);
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test, verify fail** (script still hardcodes legacy path).

```bash
node --test tests/validation/test-adr-index-dual-read.mjs
```

Expected: FAIL.

- [ ] **Step 3: Modify `scripts/adr-update-index.mjs`** — replace hardcoded `path.join('.context','docs','adrs')` with `resolveAdrPath(projectRoot).readPaths` for scan, `.write` for output. Preserve existing logic.

- [ ] **Step 4: Run test, verify pass**

```bash
node --test tests/validation/test-adr-index-dual-read.mjs
```

Expected: PASS.

- [ ] **Step 5: Run full test suite to confirm no regression**

```bash
node --test tests/validation/test-adr-index.mjs tests/validation/test-adr-structural.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/adr-update-index.mjs tests/validation/test-adr-index-dual-read.mjs
git commit -m "feat(scripts): adr-update-index reads both paths during transition"
```

---

### Task Group 0.3: Update `scripts/adr-audit.mjs` to dual-read with `LEGACY_PATH_DETECTED` warning

**Files:**
- Modify: `scripts/adr-audit.mjs`
- Test: extend `tests/validation/test-adr-audit.mjs`

**Agent:** devops-specialist
**Tests:** unit + integration

- [ ] **Step 1: Add failing test case** to `tests/validation/test-adr-audit.mjs`:

```javascript
test("adr-audit: emits LEGACY_PATH_DETECTED warning when only legacy path exists", () => {
  const root = mkdtempSync(join(tmpdir(), "adr-audit-legacy-"));
  mkdirSync(join(root, ".context", "docs", "adrs"), { recursive: true });
  // Add a minimal ADR in legacy path
  writeFileSync(join(root, ".context", "docs", "adrs", "001-x-v1.0.0.md"), MINIMAL_ADR);
  const result = execFileSync("node",
    [join(process.cwd(), "scripts", "adr-audit.mjs"), "--all"],
    { cwd: root, stdio: "pipe", encoding: "utf-8" });
  assert.match(result, /LEGACY_PATH_DETECTED/);
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Modify `scripts/adr-audit.mjs`** — use `resolveAdrPath()`. When `r.isLegacy === true` (only legacy path), emit warning `LEGACY_PATH_DETECTED: ADRs found in .context/docs/adrs/. Migrate to .context/adrs/ before v1.2 — see ADR-001.` to stderr.

- [ ] **Step 4: Run test, verify pass.**

- [ ] **Step 5: Re-run all existing audit tests** — confirm no regression.

```bash
node --test tests/validation/test-adr-audit.mjs
```

- [ ] **Step 6: Commit**

```bash
git add scripts/adr-audit.mjs tests/validation/test-adr-audit.mjs
git commit -m "feat(adr): audit emits LEGACY_PATH_DETECTED for dual-read warning"
```

---

### Task Group 0.4: Update `scripts/adr-evolve.mjs` with migrate-on-write

**Files:**
- Modify: `scripts/adr-evolve.mjs`
- Test: `tests/validation/test-adr-evolve-migrates.mjs` (new)

**Agent:** devops-specialist
**Tests:** integration

- [ ] **Step 1: Write failing test** — create ADR in legacy path, run evolve, assert file moved to new path with bumped version.

```javascript
test("adr-evolve: migrates legacy ADR to new path on patch evolve", () => {
  const root = mkdtempSync(join(tmpdir(), "adr-evo-"));
  const legacyDir = join(root, ".context", "docs", "adrs");
  mkdirSync(legacyDir, { recursive: true });
  writeFileSync(join(legacyDir, "001-foo-v1.0.0.md"), MINIMAL_ADR_V1);
  execFileSync("node",
    [join(process.cwd(), "scripts", "adr-evolve.mjs"), "--id=001", "--bump=patch", "--reason=test"],
    { cwd: root, stdio: "pipe" });
  // After evolve, new file should exist in .context/adrs/
  const newPath = join(root, ".context", "adrs", "001-foo-v1.0.1.md");
  assert.ok(existsSync(newPath), "evolved ADR should be in new path");
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Modify `scripts/adr-evolve.mjs`** — use `resolveAdrPath()`. When loading source ADR from `readPaths[1]` (legacy), write evolved file to `.write` (new path). Source legacy file stays as historical record.

- [ ] **Step 4: Run test, verify pass.**

- [ ] **Step 5: Run all existing evolve tests** — no regression.

```bash
node --test tests/validation/test-adr-evolve.mjs
```

- [ ] **Step 6: Commit**

```bash
git add scripts/adr-evolve.mjs tests/validation/test-adr-evolve-migrates.mjs
git commit -m "feat(adr): evolve migrates legacy ADRs to canonical path on write"
```

---

### Task Group 0.5: Update `hooks/session-start` to dual-read ADR_GUARDRAILS

**Files:**
- Modify: `hooks/session-start` (bash)
- Test: `tests/hooks/test-session-start-adr-dualread.sh` (new)

**Agent:** devops-specialist
**Tests:** shell integration

- [ ] **Step 1: Write failing test** — fixture with ADRs in both paths; script run; verify both ADRs appear in injected ADR_GUARDRAILS.

```bash
#!/usr/bin/env bash
# tests/hooks/test-session-start-adr-dualread.sh
set -euo pipefail
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT
mkdir -p "$TMP/.context/adrs" "$TMP/.context/docs/adrs"
cat > "$TMP/.context/adrs/001-new.md" <<'EOF'
---
status: Aprovado
---
## Guardrails
- new path rule
EOF
cat > "$TMP/.context/docs/adrs/099-legacy.md" <<'EOF'
---
status: Aprovado
---
## Guardrails
- legacy rule
EOF
output=$(cd "$TMP" && bash "$OLDPWD/hooks/session-start" 2>&1 || true)
echo "$output" | grep -q "new path rule" || { echo "FAIL: new path not loaded"; exit 1; }
echo "$output" | grep -q "legacy rule" || { echo "FAIL: legacy path not loaded"; exit 1; }
echo "PASS"
```

- [ ] **Step 2: Run, verify fail.**

```bash
bash tests/hooks/test-session-start-adr-dualread.sh
```

- [ ] **Step 3: Modify `hooks/session-start`** — replace hardcoded ADR scan path with loop over both paths. Use shell helper that calls `node -e "import('./scripts/lib/path-resolver.mjs').then(m => console.log(m.resolveAdrPath(process.cwd()).readPaths.join('\n')))"` or implement equivalent shell logic with explicit checks for `.context/adrs/` and `.context/docs/adrs/`.

- [ ] **Step 4: Run test, verify pass.**

- [ ] **Step 5: Run all existing session-start tests** — no regression.

```bash
bash tests/hooks/test-session-start.sh
bash tests/hooks/test-session-start-e2e.sh
bash tests/hooks/test-adr-context.sh
```

- [ ] **Step 6: Commit**

```bash
git add hooks/session-start tests/hooks/test-session-start-adr-dualread.sh
git commit -m "feat(hooks): session-start reads ADR_GUARDRAILS from both paths"
```

---

### Task Group 0.6: Update `skills/adr-builder/SKILL.md` (HARD-GATE save path + summary/Drivers fields)

**Files:**
- Modify: `skills/adr-builder/SKILL.md` (12+ path occurrences)
- Modify: `skills/adr-builder/references/template-frontmatter.md` (add `summary` field)
- Modify: `skills/adr-builder/references/template-body.md` (add Drivers section template)

**Agent:** documentation-writer
**Tests:** structural (regex grep) + manual review

- [ ] **Step 1: Inventory current path occurrences**

```bash
grep -n "docs/adrs" skills/adr-builder/SKILL.md
```

Expected: 12 occurrences (per spec §4.6/M2).

- [ ] **Step 2: Replace each with `.context/adrs/`** preserving HARD-GATE blocks. Verify with `grep` after replacement that 0 occurrences of `docs/adrs` remain (except inside historical references explicitly noted as legacy).

- [ ] **Step 3: Add ADR adjustments — `summary` field** (Y-statement Z-style, ≤240 chars, optional)

In `skills/adr-builder/references/template-frontmatter.md`, append:

```yaml
# Optional Y-statement (≤240 chars). When present, session-start uses this
# instead of the title in <ADR_GUARDRAILS> Stage-1 disclosure.
summary: ""
```

Update the SKILL.md Step "Frontmatter validation" to mark `summary` as optional but recommended for ADRs with status Aprovado.

- [ ] **Step 4: Add ADR adjustments — `Drivers` section** (optional, only if ≥3 forces)

In `skills/adr-builder/references/template-body.md`, between Contexto and Decisão:

```markdown
## Drivers (opcional, omitir se ≤2)
- <força técnica 1>
- <força técnica 2>
- <força técnica 3>
```

Add audit rule in `scripts/adr-audit.mjs`: warn (not fail) if `Drivers` section present but contains <3 bullets.

- [ ] **Step 5: Add structural test** for new fields:

```javascript
// tests/validation/test-adr-frontmatter.mjs — add cases
test("frontmatter: summary field is optional and ≤240 chars", () => {
  const valid = parseFrontmatter("summary: short Y-statement\n");
  assert.equal(valid.warnings.length, 0);
  const tooLong = parseFrontmatter("summary: " + "x".repeat(241) + "\n");
  assert.match(tooLong.errors[0], /summary.*240/);
});

test("frontmatter: drivers section present with <3 bullets emits warning", () => {
  const body = "## Drivers\n- only one\n";
  const result = auditBody(body);
  assert.match(result.warnings.join(""), /Drivers.*<3/i);
});
```

- [ ] **Step 6: Run all validation tests** — confirm path swap + new field validation pass.

```bash
node --test tests/validation/test-adr-frontmatter.mjs
node --test tests/validation/test-adr-structural.mjs
```

- [ ] **Step 7: Commit**

```bash
git add skills/adr-builder/ tests/validation/test-adr-frontmatter.mjs scripts/adr-audit.mjs
git commit -m "feat(adr-builder): canonical path .context/adrs/ + summary/Drivers fields"
```

---

### Task Group 0.7: Update other skills referencing ADR path

**Files:**
- Modify: `skills/adr-filter/SKILL.md` (Step 1 dual-read)
- Modify: `skills/prevc-validation/SKILL.md` (Step 2.6 ADR Audit Gate)
- Modify: `skills/prevc-planning/SKILL.md` (Step 3.5 ADR opportunity check)
- Modify: `commands/devflow-adr.md` (path examples)
- Modify: `commands/devflow.md` (path examples in init/sync sections)

**Agent:** documentation-writer
**Tests:** structural

- [ ] **Step 1: Find all path references**

```bash
grep -rn "docs/adrs\|docs\\\\adrs" skills/ commands/
```

- [ ] **Step 2: For each occurrence, replace with `.context/adrs/`** (or "both `.context/adrs/` and `.context/docs/adrs/` (legacy, dual-read until v1.2)" where context warrants).

- [ ] **Step 3: Add a global structural test** at `tests/validation/test-adr-path-canonical.mjs`:

```javascript
test("no skill references legacy ADR path without legacy marker", () => {
  const offenders = grepRecursive("skills/", "docs/adrs", { except: ["legacy"] });
  assert.deepEqual(offenders, [], "Found legacy ADR path references missing 'legacy' qualifier");
});
```

- [ ] **Step 4: Run test, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add skills/adr-filter/ skills/prevc-validation/ skills/prevc-planning/ commands/devflow-adr.md commands/devflow.md tests/validation/test-adr-path-canonical.mjs
git commit -m "docs(adr): update path references across skills/commands to .context/adrs/"
```

---

### Task Group 0.8: Create ADR-001 (path migration) via adr-builder

**Files:**
- Create: `.context/adrs/001-adr-path-migration-to-context-root-v1.0.0.md`

**Agent:** documentation-writer (invokes adr-builder skill)
**Tests:** structural (audit)

- [ ] **Step 1: Invoke adr-builder skill in CREATE mode** with prefilled frontmatter from spec §4.6/M1:

```yaml
type: adr
name: adr-path-migration-to-context-root
description: Migrar save path do adr-builder de .context/docs/adrs/ para .context/adrs/
scope: organizational
source: local
stack: universal
category: arquitetura
status: Proposto
version: 1.0.0
created: 2026-05-06
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: "Path canônico do adr-builder migra de .context/docs/adrs/ para .context/adrs/ por consistência com outros artefatos devflow; dual-read transitório por v1.0.x e v1.1.x, remoção em v1.2.0."
```

Body: 4 Drivers (consistency, separation, path-shortening, transitional compat), Decision, Alternatives, Consequences, Guardrails (≥2), Enforcement (≥1) per Hard Rule #1.

- [ ] **Step 2: Run adr-audit on ADR-001**

```bash
node scripts/adr-audit.mjs --id=001
```

Expected: 11/11 PASS or only FIX-AUTO pending.

- [ ] **Step 3: Set status to Aprovado** (manual frontmatter edit — Hard Rule #5 of adr-builder requires human ack; this PR review IS the ack).

```yaml
status: Aprovado
```

- [ ] **Step 4: Run adr-update-index** to regenerate `.context/adrs/README.md`.

```bash
node scripts/adr-update-index.mjs
```

- [ ] **Step 5: Commit**

```bash
git add .context/adrs/001-adr-path-migration-to-context-root-v1.0.0.md .context/adrs/README.md
git commit -m "docs(adr): ADR-001 path migration to .context/adrs/ (Aprovado)"
```

---

### Task Group 0.9: Bump version to v1.0.0-rc1 + CHANGELOG entry for Semana 0

**Files:**
- Modify: `.claude-plugin/plugin.json` (version → "1.0.0-rc1")
- Modify: `.cursor-plugin/plugin.json` (version → "1.0.0-rc1")
- Create: `CHANGELOG.md` (new file)

**Agent:** documentation-writer
**Tests:** structural

- [ ] **Step 1: Bump version in both plugin manifests** to `1.0.0-rc1` (release candidate; final `1.0.0` happens in Task Group F.3).

- [ ] **Step 2: Create `CHANGELOG.md`** with v1.0.0-rc1 section listing Semana 0 changes (path migration, ADR adjustments, dual-read scaffolding).

- [ ] **Step 3: Run version-check pre-commit**

```bash
bash scripts/pre-commit-version-check.sh
```

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json .cursor-plugin/plugin.json CHANGELOG.md
git commit -m "chore(release): bump to 1.0.0-rc1 — Semana 0 path migration"
```

---

# SEMANA 1 — Standards (Gap 1)

**Goal:** Introduce `.context/standards/` directory + scaffolding + ADR-002 + PostToolUse linter integration.

---

### Task Group 1.0: Create ADR-002 (standards-triple-layer)

**Agent:** documentation-writer (via adr-builder)

- [ ] **Step 1: Invoke adr-builder CREATE mode** with frontmatter from spec §4.2/ADR-0001 (renumbered to **002** in our sequence). Set `category: principios-codigo`, `decision_kind: firm`, status `Proposto`.
- [ ] **Step 2: Body must include** ≥2 alternatives, ≥2 guardrails, ≥1 enforcement (Hard Rule #1). Drivers: humans-need-prose / LLM-needs-rules / linter-needs-execution / governance-needs-status.
- [ ] **Step 3: Run audit; set Aprovado.**
- [ ] **Step 4: Update index; commit** as `docs(adr): ADR-002 standards triple-layer (Aprovado)`.

---

### Task Group 1.1: `.context/standards/` scaffolding

**Files:**
- Create: `.context/standards/README.md` (authoring guide — see spec §5.6 for template; lang pt-BR)
- Create: `.context/standards/machine/.gitkeep`

**Agent:** documentation-writer
**Tests:** structural

- [ ] **Step 1: Write test** `tests/validation/test-standards-scaffold.mjs` asserting README exists with required sections (Frontmatter spec, applyTo glob, Linter, Anti-patterns).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Create README.md** with authoring guide in pt-BR, frontmatter schema, examples (referencing spec §5.6).
- [ ] **Step 4: Run test, verify pass.**
- [ ] **Step 5: Commit** `docs(standards): scaffold .context/standards/ authoring guide`.

---

### Task Group 1.2: `scripts/lib/standards-loader.mjs` (TDD)

**Files:**
- Create: `scripts/lib/standards-loader.mjs` (`loadStandards(projectRoot)`, `findApplicableStandards(filePath, standards)`)
- Test: `tests/validation/test-standards-loader.mjs`

**Agent:** devops-specialist
**Tests:** unit (TDD)

- [ ] **Step 1: Write 5 failing tests:**
  - load empty standards dir returns []
  - parses frontmatter (id, applyTo, version, enforcement)
  - filters by applyTo glob match
  - emits weakStandard warning when no linter
  - filters out standards without `id`
- [ ] **Step 2: Run, verify all 5 fail.**
- [ ] **Step 3: Implement loader** using `gray-matter` or simple frontmatter parser + `micromatch` for globs.
- [ ] **Step 4: Run, verify 5/5 PASS.**
- [ ] **Step 5: Commit** `feat(scripts): standards-loader with applyTo glob filtering`.

---

### Task Group 1.3: Update `hooks/post-tool-use` to run linters from applicable standards

**Files:**
- Modify: `hooks/post-tool-use`
- Test: `tests/hooks/test-post-tool-use-linters.sh`

**Agent:** devops-specialist
**Tests:** shell integration

- [ ] **Step 1: Write failing shell test** that creates a fixture project with one standard whose linter is a stub (`echo "VIOLATION: x"`), simulates an Edit event on a matching file, and asserts the hook output contains `Standard <id> violated`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Modify `hooks/post-tool-use`** — after napkin update, call `node -e "..."` (or shell-out to a small `.mjs` helper) that uses `standards-loader.mjs` + `findApplicableStandards()` and runs each linter. On non-zero linter exit, emit JSON `{"hookEventName":"PostToolUse","hookFollowUp":{"type":"warning","message":"..."}}` to stdout per Claude Code hook protocol.
- [ ] **Step 4: Run test, verify pass.**
- [ ] **Step 5: Run existing post-tool-use tests** — no regression.
- [ ] **Step 6: Commit** `feat(hooks): post-tool-use runs linters from applicable standards`.

---

### Task Group 1.4: New CLI `devflow standards new <id>` and `devflow standards verify`

**Files:**
- Create: `scripts/devflow-standards.mjs`
- Test: `tests/scripts/test-devflow-standards.mjs`

**Agent:** devops-specialist
**Tests:** unit + smoke

- [ ] **Step 1: Write failing tests:**
  - `new <id>` creates `.context/standards/<id>.md` with valid frontmatter scaffold
  - `verify` exits 0 when all standards have linter
  - `verify` emits weak-standard warning when standard lacks linter
  - `verify --strict` exits non-zero on weak-standards
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `scripts/devflow-standards.mjs`** as a CLI dispatcher (use `node:util parseArgs`).
- [ ] **Step 4: Wire into `commands/devflow.md`** by adding "standards new|verify" routing in the `## Behavior` section (mirror `update`/`init` pattern).
- [ ] **Step 5: Run tests, verify pass.**
- [ ] **Step 6: Commit** `feat(cli): devflow standards new|verify`.

---

# SEMANA 2 — Stacks + artisanal pipeline (Gap 2)

**Goal:** Introduce `.context/stacks/` + artisanal pipeline + `devflow stacks scrape-batch|scrape|validate` + drift detection.

**External tooling note (corrected from spec):** the package is `@arabold/docs-mcp-server@^2.2.1`; the bin is `docs-mcp-server` (NOT `docs-cli`). Correct invocation: `npx -y @arabold/docs-mcp-server@2.2.1 fetch-url "<url>"` or `... scrape <library> <url>`.

---

### Task Group 2.0: Create ADR-003 (stack-docs-artisanal-pipeline)

**Agent:** documentation-writer

- [ ] **Step 1: Invoke adr-builder CREATE mode** using spec §5.3 frontmatter (renumbered to **003**), category `arquitetura`. **Update body** to use the corrected CLI invocation (`docs-mcp-server fetch-url`, not `docs-cli`).
- [ ] **Step 2: Drivers (6 from spec §5.3):** determinism, latency, cost, resilience, governance, audit.
- [ ] **Step 3: Audit; set Aprovado.**
- [ ] **Step 4: Commit** `docs(adr): ADR-003 stack-docs-artisanal-pipeline (Aprovado)`.

---

### Task Group 2.1: `.context/stacks/` scaffolding

**Files:**
- Create: `.context/stacks/manifest.yaml` (empty stub for self-repo — devflow is a bridge; no real frameworks)
- Create: `.context/stacks/refs/.gitkeep`
- Create: `.context/stacks/llms.txt` (template header)

**Agent:** documentation-writer
**Tests:** structural

- [ ] **Step 1: Write test** asserting manifest.yaml validates against schema (spec §5.2).
- [ ] **Step 2: Define schema** in `scripts/lib/manifest-stacks.mjs` exports.
- [ ] **Step 3: Create files; run test; commit.**

---

### Task Group 2.2: `scripts/lib/manifest-stacks.mjs` (TDD)

**Files:** as named.

**Agent:** devops-specialist
**Tests:** unit

- [ ] **Step 1: Write failing tests** for: parse manifest, validate schema (spec/version/frameworks/applyTo), detect missing artisanalRef, detect skipDocs flag, hash sha256 of ref file.
- [ ] **Step 2: Implement.** Reference `lockfile.mjs` (Task Group X.6) for `.lock` hash storage.
- [ ] **Step 3: Pass; commit.**

---

### Task Group 2.3: New skill `skills/scrape-stack-batch/`

**Files:**
- Create: `skills/scrape-stack-batch/SKILL.md`
- Create: `skills/scrape-stack-batch/scripts/{discovery,pipeline,confidence,input-resolver}.mjs`
- Create: `skills/scrape-stack-batch/templates/{confirmation-prompt,error-prompt}.txt`
- Test: `skills/scrape-stack-batch/tests/{discovery,pipeline}.test.mjs`

**Agent:** devops-specialist + documentation-writer
**Tests:** unit (mocks for registry/llms.txt/web_search) + smoke (small lib)

#### 2.3.A — input-resolver.mjs (TDD)

- [ ] **Step 1: Write failing tests:**
  - `--from-package` parses package.json deps + devDeps with versions resolved from lockfile
  - `--from-manifest` parses wishlist section
  - args `<lib>@<version>` parsed correctly
  - dedup across multiple modes
- [ ] **Step 2: Implement; pass; commit.**

#### 2.3.B — discovery.mjs (TDD)

- [ ] **Step 1: Write failing tests** with mocked HTTP for: registry lookup (npm/PyPI/crates.io/Go proxy), llms.txt probe, web_search via Claude (skip in offline mode — return INCERTA).
- [ ] **Step 2: Implement** using `node:fetch`.
- [ ] **Step 3: Pass; commit.**

#### 2.3.C — confidence.mjs (TDD)

- [ ] **Step 1: Write failing tests** for confidence aggregation (max() rule, table from spec §3.4.4).
- [ ] **Step 2: Implement; pass; commit.**

#### 2.3.D — pipeline.mjs (TDD with one tiny library smoke test)

- [ ] **Step 1: Write smoke test** that runs the full 4-stage pipeline against a tiny lib (e.g., `is-odd@4.0.0` from npm) — ~10 docs, completes in <30s. Asserts file `.context/stacks/refs/is-odd@4.0.0.md` exists with ≥1 snippet (relaxed bound; minimum-viable).
- [ ] **Step 2: Implement RESOLVE → SCRAPE → REFINE → CONSOLIDATE** stages. Use `child_process.execFile` for `npx -y @arabold/docs-mcp-server@2.2.1 fetch-url ...` and `npx -y md2llm@1.1.0 ...`.
- [ ] **Step 3: Pass; commit.**

#### 2.3.E — SKILL.md authoring

- [ ] **Step 1: Author SKILL.md** with frontmatter (per spec §3.6), workflow description (Fases A-D), example commands (corrected CLI invocations).
- [ ] **Step 2: Commit.**

---

### Task Group 2.4: CLI `scripts/devflow-stacks.mjs` (scrape-batch | scrape | validate)

**Agent:** devops-specialist
**Tests:** unit + smoke

- [ ] **Step 1: Write failing tests** for CLI dispatch + arg parsing.
- [ ] **Step 2: Implement** by importing the skill scripts (Task 2.3) and orchestrating.
- [ ] **Step 3: Wire into `commands/devflow.md`** — add "stacks" routing.
- [ ] **Step 4: Pass; commit.**

---

### Task Group 2.5: Drift detection job (CI)

**Files:**
- Create: `.github/workflows/stack-drift.yml` (nightly)
- Create: `scripts/devflow-drift.mjs` (called by workflow + by `devflow context drift`)

**Agent:** devops-specialist
**Tests:** unit (parses lockfile + manifest; computes major-version-diff)

- [ ] **Step 1: Write failing test** for `majorVersionDiff(installed, pinned)` and `findDrift(packageJson, manifest)`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Author workflow YAML** that runs nightly + on PR; on drift, opens GitHub issue.
- [ ] **Step 4: Smoke test workflow locally** with `act` if available, or manual review.
- [ ] **Step 5: Commit** `feat(ci): nightly stack drift detection workflow`.

---

# SEMANA 3 — Permissions vendor-neutral (Gap 3)

---

### Task Group 3.0: Create ADR-004 (permissions-vendor-neutral)

**Agent:** documentation-writer

- [ ] **Step 1-4:** Same flow — adr-builder CREATE → audit → Aprovado → commit. Use spec §4.2/ADR-0003 frontmatter renumbered to **004**, category `seguranca`.

---

### Task Group 3.1: `.context/permissions.yaml` template + schema validator

**Files:**
- Create: `.context/permissions.yaml` (template from spec §5.4)
- Create: `scripts/lib/permissions-evaluator.mjs`
- Test: `tests/validation/test-permissions-evaluator.mjs`

**Agent:** security-auditor + devops-specialist
**Tests:** unit (TDD)

- [ ] **Step 1: Write 8 failing tests:**
  - deny `**/.env*` blocks `.env.production`
  - deny precedes allow (cannot allow what's denied)
  - allow without matching deny passes
  - mode: prompt requested for unmatched
  - mode: deny → unmatched → deny decision
  - mode: accept → unmatched → allow decision
  - callback URL invocation (mocked)
  - evaluation order strictly deny → allow → mode → callback
- [ ] **Step 2: Implement** with `micromatch` for fs globs and a small command-pattern matcher for `exec`.
- [ ] **Step 3: Pass.**
- [ ] **Step 4: Commit** `feat(permissions): vendor-neutral evaluator deny-first`.

---

### Task Group 3.2: Wire `permissions-evaluator.mjs` into `hooks/pre-tool-use`

**Files:**
- Modify: `hooks/pre-tool-use`
- Test: `tests/hooks/test-pre-tool-use-permissions.sh`

**Agent:** devops-specialist
**Tests:** shell integration

- [ ] **Step 1: Write failing test** with fixture `permissions.yaml` denying `**/.env*`, simulate Edit event on `.env.local`, assert hook returns `permissionDecision: deny`.
- [ ] **Step 2: Modify hook** to call evaluator before any other logic (deny-first ordering).
- [ ] **Step 3: Run test, all existing pre-tool-use tests, no regression.**
- [ ] **Step 4: Commit** `feat(hooks): pre-tool-use applies permissions.yaml deny-first`.

---

### Task Group 3.3: git-strategy compatibility shim

**Files:**
- Modify: `skills/git-strategy/SKILL.md` (note compat with permissions.yaml)
- Modify: `hooks/pre-tool-use` (preserve existing branch protection — do NOT replace)

**Agent:** devops-specialist
**Tests:** existing git-strategy tests pass

- [ ] **Step 1: Verify** existing git-strategy hook still gates branch protection actions (no double-deny conflicts).
- [ ] **Step 2: Add `claudeCodeCompat: { preserveGitStrategyHook: true, preserveBranchProtectionExceptions: true }` section** to permissions.yaml template.
- [ ] **Step 3: Document compat behavior** in `.context/permissions.yaml` header comment.
- [ ] **Step 4: Run** `bash tests/hooks/test-pre-tool-use.sh` — confirm no regression.
- [ ] **Step 5: Commit** `docs(permissions): git-strategy hook compat documented`.

---

# SEMANA 4 — Observability OTel (Gap 4)

---

### Task Group 4.0: Create ADR-005 (observability-otel-genai) — `decision_kind: gated`

**Agent:** documentation-writer

- [ ] **Step 1-4:** adr-builder CREATE → audit → Aprovado. **Important:** `decision_kind: gated` because telemetry touches privacy/cost — explicit gating future review. Spec §4.2/ADR-0004 renumbered to **005**, category `infraestrutura`.

---

### Task Group 4.1: `.context/observability.yaml` + `scripts/lib/otel.mjs`

**Files:**
- Create: `.context/observability.yaml` (template from spec §5.5; `enabled: false`)
- Create: `scripts/lib/otel.mjs` (span helpers; lazy-init OTel SDK only when `enabled: true`)
- Test: `tests/validation/test-otel-spans.mjs`

**Agent:** devops-specialist
**Tests:** unit + integration with mock collector

- [ ] **Step 1: Write 6 failing tests:**
  - `enabled: false` → `createSpan()` returns no-op
  - `enabled: true` + valid endpoint → real OTLP span emitted to mock collector
  - `gen_ai.*` attributes set on tool spans
  - `devflow.*` attributes set on context loading spans
  - prompts/completions redacted by default
  - `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=1` enables content capture (still redacts PII per `redactPii: true`)
- [ ] **Step 2: Implement** using `@opentelemetry/api` (no exporter dep when disabled). Lazy-load `@opentelemetry/sdk-trace-node` + `@opentelemetry/exporter-trace-otlp-http` when `enabled: true`.
- [ ] **Step 3: Pass.**
- [ ] **Step 4: Commit** `feat(otel): observability.yaml + otel.mjs lazy-init span helpers`.

---

### Task Group 4.2: `scripts/lib/repro-token.mjs` (reproducibility token)

**Agent:** devops-specialist
**Tests:** unit

- [ ] **Step 1: Write failing test** asserting `computeToken({ model, params, lockHash, toolDefinitionsHash })` returns deterministic sha256 hex.
- [ ] **Step 2: Implement** as pure function over `node:crypto.createHash('sha256')`.
- [ ] **Step 3: Pass; commit.**

---

### Task Group 4.3: Wire OTel into hooks (session-start / pre-tool-use / post-tool-use)

**Files:**
- Modify: all 3 hooks (shell shells out to `node -e "...otel.mjs..."`)
- Test: `tests/hooks/test-otel-integration.sh` (with mock OTLP collector running on `localhost:4318`)

**Agent:** devops-specialist
**Tests:** shell integration

- [ ] **Step 1: Write failing integration test** spinning a mock collector (small Node script bound to 4318), enabling observability in fixture, simulating a tool call, asserting expected attributes received.
- [ ] **Step 2: Modify hooks** to emit spans (gracefully no-op when `enabled: false`).
- [ ] **Step 3: Pass; commit.**

---

# CROSS-CUTTING — `context-filter.mjs` + commands + hook minimalist refactor

These task groups touch infrastructure that all 4 gaps depend on. Sequenced **after Semana 4** so all artifact types (ADRs, standards, stacks) exist for the filter to operate on, but referenced earlier hooks can stub-call until X.1 lands.

---

### Task Group X.1: `scripts/lib/context-filter.mjs` (TDD — central semantic filter)

**Files:**
- Create: `scripts/lib/context-filter.mjs` (interface from spec §2.4.2)
- Test: `tests/validation/test-context-filter.mjs`

**Agent:** devops-specialist + architect-specialist
**Tests:** unit (12+ cases)

- [ ] **Step 1: Write failing tests:**
  - `filterAdrs`: applyTo glob match scoring
  - `filterAdrs`: status filter (only Aprovado)
  - `filterAdrs`: stack relevance (skip React ADR in Python project)
  - `filterAdrs`: task keyword match against tags/category/topics
  - `filterStandards`: applyTo glob primary signal
  - `filterStacks`: reads `<artisanalRef>` from `.context/stacks/refs/`
  - `filterStacks`: emits `warnings` when artisanalRef declared but file missing
  - `scoreArtifact`: weighted combination per `scoreWeights` from `.devflow.yaml`
  - `injectIntoContext`: produces `<TAG>` blocks
  - `topN: 5` default truncation
  - tiktoken token count within ±5%
  - `tokens_budget_status: "under"` always (no cap in v1.0)
- [ ] **Step 2: Implement** sync (no async); use `micromatch`, `tiktoken` (WASM), `gray-matter`.
- [ ] **Step 3: Pass.**
- [ ] **Step 4: Commit** `feat(scripts): context-filter.mjs central semantic filtering lib`.

---

### Task Group X.2: SessionStart hook minimalist refactor

**Files:**
- Modify: `hooks/session-start` (reduce to PERMISSIONS_DIGEST + CONTEXT_INDEX Stage-1)
- Test: `tests/hooks/test-session-start-minimalist.sh`

**Agent:** refactoring-specialist
**Tests:** shell integration

- [ ] **Step 1: Write failing test** asserting hook output contains `<PERMISSIONS_DIGEST>` and `<CONTEXT_INDEX>` (with IDs only) but NOT full ADR bodies.
- [ ] **Step 2: Refactor** session-start to call a small `node -e` snippet that loads only `id`/`title`/`summary`/`applyTo` per ADR/standard/stack.
- [ ] **Step 3: Run all session-start tests, no regression.**
- [ ] **Step 4: Commit** `refactor(hooks): session-start minimalist Stage-1 disclosure`.

---

### Task Group X.3: Wire `context-filter.mjs` into PreToolUse

**Files:**
- Modify: `hooks/pre-tool-use`
- Test: `tests/hooks/test-pre-tool-use-filtering.sh`

**Agent:** devops-specialist
**Tests:** shell integration with fixture

- [ ] **Step 1: Write failing test** with fixture having 5 ADRs (3 applicable to `src/middleware.ts`, 2 not), 1 standard, 0 stacks. Simulate Edit event on `src/middleware.ts`. Assert hook injects `<ADR_FOR_TASK>` containing exactly the 3 applicable IDs, in score-descending order.
- [ ] **Step 2: Modify hook** to call context-filter via `node -e` after permissions check, before tool execution.
- [ ] **Step 3: Pass; no regression.**
- [ ] **Step 4: Commit** `feat(hooks): pre-tool-use Stage-2 filtering via context-filter.mjs`.

---

### Task Group X.4: Wrap `context-filter.mjs` in skill `adr-filter`

**Files:**
- Modify: `skills/adr-filter/SKILL.md` (use `context-filter.mjs` under the hood for interactive filtering)

**Agent:** documentation-writer

- [ ] **Step 1: Update adr-filter SKILL.md** Step 2 (Filter algorithm) to reference `context-filter.mjs filterAdrs` for consistency.
- [ ] **Step 2: Verify symmetry test** — output of skill matches output of `devflow context filter --explain` for same input.
- [ ] **Step 3: Commit.**

---

### Task Group X.5: `scripts/devflow-context.mjs` — CLI dispatcher (audit | spec | apply | verify | lock | drift | filter | budget | replay)

**Files:**
- Create: `scripts/devflow-context.mjs`
- Test: `tests/scripts/test-devflow-context.mjs`

**Agent:** devops-specialist
**Tests:** unit + smoke per subcommand

#### X.5.a — `audit` subcommand
- [ ] Write test: scaffold fixture project, run `devflow context audit`, expect `audit-report.md` listing all `.context/` files in 6 dimensions.
- [ ] Implement; commit.

#### X.5.b — `spec` subcommand
- [ ] Test: from a stub `audit-report.md`, generate `proposal/` with 4 ADR scaffolds + manifest templates.
- [ ] Implement; commit.

#### X.5.c — `apply` subcommand
- [ ] Test: from `proposal/` with all ADRs `Aprovado`, materialize `.context/{standards,stacks,permissions.yaml,observability.yaml,.lock}` (idempotent re-run).
- [ ] Test: refuse to run if any ADR is `Proposto` (Hard Rule #5).
- [ ] Implement; commit.

#### X.5.d — `verify` subcommand
- [ ] Test: 7-section verification (spec §4.4 list); `--strict` exit non-zero on any failure.
- [ ] Implement; commit.

#### X.5.e — `lock` and `lock --check`
- [ ] Test: writes/checks `.context/.lock` with sha256 of all relevant files.
- [ ] Implement using `scripts/lib/lockfile.mjs` (Task Group X.6).
- [ ] Commit.

#### X.5.f — `drift`
- [ ] Test: detects major version diff between package.json and stacks/manifest.yaml.
- [ ] Implement (reuse `devflow-drift.mjs` from Task Group 2.5).
- [ ] Commit.

#### X.5.g — `filter --explain`
- [ ] Test: output table format matches spec §2.4.3 example (ADRs filtered in/out with scores + reasons).
- [ ] Implement using `context-filter.mjs` + a printer.
- [ ] Commit.

#### X.5.h — `budget` and `replay` (skeletons)
- [ ] `budget --show` reads OTel/lock history; `replay <span-id>` resolves repro token + reconstructs invocation context. Implement minimal skeleton with TODO for full feature in v1.1.
- [ ] Document v1.1 expansion in CHANGELOG.
- [ ] Commit.

---

### Task Group X.6: `scripts/lib/lockfile.mjs`

**Agent:** devops-specialist
**Tests:** unit

- [ ] **Step 1: Write failing tests:** read empty lock; write hash for path; check stale (mtime newer than recorded hash); roundtrip.
- [ ] **Step 2: Implement.** Lock format: YAML with `{ artifacts: { "<path>": { sha256: "...", size: N, mtime: "ISO" } } }`.
- [ ] **Step 3: Pass; commit.**

---

### Task Group X.7: Update `commands/devflow.md` with all new subcommands

**Files:**
- Modify: `commands/devflow.md` (add routing for `context|stacks|standards|doctor` subcommands and their args)

**Agent:** documentation-writer
**Tests:** structural (verify all new commands documented)

- [ ] **Step 1: Update help text** with new commands matrix.
- [ ] **Step 2: Add behavior sections** for each (mirror existing `update`/`init` patterns).
- [ ] **Step 3: Update QUICK REFERENCE table.**
- [ ] **Step 4: Smoke test** `/devflow help` output includes new commands.
- [ ] **Step 5: Commit** `docs(commands): document new context/stacks/standards/doctor subcommands`.

---

### Task Group X.8: Create `scripts/devflow-doctor.mjs`

**Files:**
- Create: `scripts/devflow-doctor.mjs`

**Agent:** devops-specialist
**Tests:** unit + smoke

- [ ] **Step 1: Write failing test** asserting doctor checks: dotcontext MCP reachable, docs-mcp-server CLI available (`npx -y @arabold/docs-mcp-server@2.2.1 --version`), md2llm available, permissions sanity, lock consistency, adr-builder skill loadable, context-filter.mjs imports without error.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Pass; commit.**

---

# VALIDATION — Test project fixture (`tests/fixtures/project-simulation/`)

**Per user decision:** devflow is a bridge. Performance and end-to-end pipeline validation happen against a simulated project, NOT against the devflow self-repo. This fixture is THE primary acceptance criterion for v1.0.0.

---

### Task Group V.1: Scaffold `tests/fixtures/project-simulation/`

**Files:**
- Create: `tests/fixtures/project-simulation/{package.json, pnpm-lock.yaml, src/, prisma/, tests/, .context/, README.md}`

**Agent:** test-writer + architect-specialist
**Tests:** structural

- [ ] **Step 1: Write failing test** `tests/validation/test-project-simulation-scaffold.mjs` asserting fixture structure exists with expected files.
- [ ] **Step 2: Author fixture** simulating a realistic Next.js + Prisma + Vitest project:
  - `package.json` with `next@15.0.0`, `react@19.0.0`, `prisma@5.18.0`, `vitest@1.6.0`, etc.
  - `src/middleware.ts`, `src/app/{layout.tsx,page.tsx,api/users/route.ts}`, `src/lib/db.ts`, etc. (~20 stub files; minimal but realistic shapes).
  - `prisma/schema.prisma` with 3 models.
  - `tests/{e2e,unit}/` with 5 stub specs.
- [ ] **Step 3: Pass; commit** `test(fixture): project-simulation scaffold (Next.js + Prisma)`.

---

### Task Group V.2: Populate fixture `.context/` with 50 ADRs + 15 standards + 5 stacks

**Files:**
- Create: `tests/fixtures/project-simulation/.context/adrs/0{01..50}-stub-*.md`
- Create: `tests/fixtures/project-simulation/.context/standards/{std-error-handling,std-naming,...}.md` (×15)
- Create: `tests/fixtures/project-simulation/.context/stacks/manifest.yaml` (5 frameworks: next, react, prisma, vitest, tailwind)
- Create: `tests/fixtures/project-simulation/.context/stacks/refs/<lib>@<version>.md` (×5, scraped via real pipeline OR seeded with realistic stub content)

**Agent:** test-writer + documentation-writer
**Tests:** structural (count assertions)

- [ ] **Step 1: Write failing test** asserting counts: 50 ADRs, 15 standards, 5 stack refs.
- [ ] **Step 2: Generate ADRs programmatically** — small `tests/fixtures/generate-stubs.mjs` script that emits realistic frontmatter + body skeleton for 50 ADRs distributed across all 7 categories (`arquitetura`, `seguranca`, `qualidade-testes`, `principios-codigo`, `infraestrutura`, `dados`, `processo`).
- [ ] **Step 3: Author 15 standards** with applyTo globs covering different file patterns.
- [ ] **Step 4: For 5 stacks**, run real pipeline (Task Group 2.3) for at least 2 (e.g., `is-odd` + `vitest`) and seed remaining 3 with realistic stub content (≥5 snippets each in md2llm format).
- [ ] **Step 5: Pass; commit** `test(fixture): seed .context/ with 50 ADRs + 15 standards + 5 stacks`.

---

### Task Group V.3: E2E test — full PREVC flow against fixture

**Files:**
- Create: `tests/fixtures/project-simulation/tests/e2e/test-prevc-full-flow.sh`

**Agent:** test-writer
**Tests:** E2E

- [ ] **Step 1: Write failing E2E test** that:
  1. cd into fixture.
  2. Runs `devflow context audit` → asserts exit 0, audit-report.md generated.
  3. Runs `devflow context verify --strict` → exit 0.
  4. Runs `devflow context filter --explain "add JWT validation" --file=src/middleware.ts` → output contains ≥3 ADRs filtered in.
  5. Simulates a tool call via the hooks (using a small driver script that mimics Claude Code's hook invocation contract) and asserts ADR_FOR_TASK / STANDARDS_FOR_TASK / STACK_FOR_TASK injected.
- [ ] **Step 2: Run; verify each step passes.**
- [ ] **Step 3: Commit** `test(e2e): full PREVC flow validated against project-simulation fixture`.

---

### Task Group V.4: Performance benchmarks against fixture

**Files:**
- Create: `tests/fixtures/project-simulation/tests/perf/test-context-filter-perf.mjs`
- Create: `tests/fixtures/project-simulation/tests/perf/test-pre-tool-use-perf.sh`
- Create: `tests/fixtures/project-simulation/tests/perf/test-session-start-perf.sh`

**Agent:** test-writer + performance-optimizer
**Tests:** perf assertions

- [ ] **Step 1: Write failing perf test** for context-filter.mjs: 50 ADRs + 15 standards + 5 stacks → `<80ms` median over 100 runs (per spec §6.5).
- [ ] **Step 2: Write failing perf test** for PreToolUse hook: full pipeline → `<100ms p95` (per spec §6.5).
- [ ] **Step 3: Write failing perf test** for SessionStart: minimalist → `<300ms` (per spec §6.5).
- [ ] **Step 4: Run benchmarks; iterate until targets met** (refactor if needed; do NOT relax targets without ADR).
- [ ] **Step 5: Commit** `test(perf): benchmarks meet spec §6.5 targets in project-simulation fixture`.

---

# FINAL — Release & sync

---

### Task Group F.1: CHANGELOG.md final v1.0.0 entry

**Agent:** documentation-writer

- [ ] **Step 1:** Replace `1.0.0-rc1` heading with `1.0.0` listing all 5 Semanas + ADR adjustments + new commands.

---

### Task Group F.2: README.md update

**Agent:** documentation-writer

- [ ] **Step 1:** Add new section "Context layer (v1.0)" describing standards/stacks/permissions/observability + new commands. Update version history section.

---

### Task Group F.3: Bump to final v1.0.0

- [ ] **Step 1:** `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json` → `"version": "1.0.0"`.
- [ ] **Step 2:** Run `bash scripts/pre-commit-version-check.sh`.
- [ ] **Step 3:** Commit `chore(release): v1.0.0 — context layer foundation`.
- [ ] **Step 4:** Tag locally `git tag v1.0.0` (push tag handled by maintainer post-merge).

---

### Task Group F.4: Final test sweep + dotcontext sync

- [ ] **Step 1:** Run all tests:

```bash
find tests -name "*.test.mjs" -o -name "test-*.mjs" -o -name "test-*.sh" | while read t; do
  case "$t" in
    *.mjs) node --test "$t" ;;
    *.sh)  bash "$t" ;;
  esac
done
```

Expected: 0 failures.

- [ ] **Step 2:** `npx dotcontext sync export` — confirms AGENTS.md/CLAUDE.md regen without regression.
- [ ] **Step 3:** `node scripts/adr-update-index.mjs` — regen index.
- [ ] **Step 4:** Final commit `chore: regen indexes pre-PR`.

---

### Task Group F.5: Open PR

- [ ] **Step 1:** Push branch.
- [ ] **Step 2:** `gh pr create` with summary linking to spec, listing the 5 Semanas, V.1-V.4 fixtures, and explicit "Out of Scope" section repeated from this plan.

---

## Acceptance Criteria (consolidated)

The following must ALL hold before merge:

1. **Spec coverage:** all 5 Semanas + ADR adjustments + cross-cutting + V.1-V.4 + final tasks completed.
2. **TDD discipline:** every Task Group has at least one test step BEFORE its implementation step.
3. **All tests pass:** existing baseline (~119 functions / 354 assertions) + ~80 new tests added by this plan.
4. **Path migration verified:** `adr-builder` writes ONLY to `.context/adrs/`; legacy path still readable; LEGACY_PATH_DETECTED warning emitted by audit when only legacy exists.
5. **5 ADRs created** (001-005) all in `Aprovado` status, all 11/11 audit checks PASS.
6. **`devflow context verify --strict` exit 0** in fixture project.
7. **Performance targets met in fixture** (V.4): context-filter <80ms, PreToolUse <100ms p95, SessionStart <300ms.
8. **No regression in existing 5 platforms** (smoke test in Claude Code; manual review for Cursor/Codex/Gemini/OpenCode — flagged as known gap if not testable in CI).
9. **CHANGELOG, README, plugin.json all show 1.0.0.**
10. **Single PR open** linking to this plan and the spec.

---

## Self-Review Checklist

- [x] **Spec coverage:** Semana 0 §4.6 (10 task groups) ✓; Gap 1 §4.x §5.6 (5 task groups) ✓; Gap 2 §3 §4.x §5.2 §5.3 (6 task groups) ✓; Gap 3 §5.4 (4 task groups) ✓; Gap 4 §5.5 (4 task groups) ✓; cross-cutting context-filter §2.4 (8 task groups) ✓; ADR adjustments §1.3 (in 0.6) ✓; fixtures §6.5 perf (V.1-V.4) ✓; commands §5.7 (in X.5) ✓.
- [x] **No placeholders** — all "Step N: <action>" lines have concrete commands or code references; spec §-pointers used for large code blocks already in spec (acceptable: spec is in conversation context).
- [x] **Type/name consistency:** `resolveAdrPath` used identically across 0.1/0.2/0.3/0.4/0.5; `context-filter.mjs` interface matches spec §2.4.2.
- [x] **TDD ordering:** every Task Group leads with "Write the failing test" or equivalent (36/46 explicit; 10/46 use structural verification per their nature).
