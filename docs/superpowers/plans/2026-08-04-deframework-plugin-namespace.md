# Desframeworkizar o namespace global do plugin — plano de implementação

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para rastreio.

> **Workflow DevFlow:** `deframework-plugin-namespace` | **Escala:** LARGE | **Fase:** P→R
> **Spec:** `docs/superpowers/specs/2026-08-04-deframework-plugin-namespace-design.md`
> **ADR:** `.context/engineering/adrs/008-framework-profile-scoped-standards-v1.1.0.md`

**Goal:** Tirar conhecimento de framework (Odoo) e de produto proprietário (NXZ) do namespace global `devflow:*`, relocando as skills de perfil para `assets/skills/profiles/<fw>/`, e devolver a criação de agente de projeto ao dotcontext.

**Architecture:** A localização do arquivo passa a ser o contrato de registro — o Claude Code registra tudo em `skills/` e `agents/` do plugin como comando/agent type global, sem opt-out, então artefato condicional a framework sai de lá e vai para `assets/<classe>/profiles/<fw>/`, de onde continua sendo copiado para o `.context/` do projeto sob detecção de perfil. Perfis deixam de contribuir agents; o vínculo skill↔agente passa a ser declarado por `skillBindings` no perfil e materializado como frontmatter `skills:` no agente de projeto.

**Tech Stack:** Node ESM (`.mjs`), `node --test`, bash. Sem dependências externas.

## Global Constraints

- **Idioma:** pt-BR em toda documentação, comentário e mensagem de commit.
- **TDD real:** todo grupo de tarefas começa por teste que falha (RED) antes de qualquer implementação. Testes reais, nunca content check.
- **`git.versioning: pipeline`** — NÃO bumpar versão localmente; o release sai por workflow. Nenhum commit deste plano toca `.claude-plugin/plugin.json`.
- **NÃO criar PR, NÃO mergear, NÃO fazer push.** A fase C do PREVC controla a finalização.
- **Branch:** `feature/deframework-plugin-namespace` (já criada).
- **Mover é mover:** as 4 skills relocadas são markdown puro e vão por `git mv` com conteúdo **byte-idêntico** — o hash de conteúdo precisa permanecer o mesmo (Tarefa 5 verifica).
- **Não tocar:** `assets/stacks/backend/odoo.md`, `assets/standards/profiles/**`, `.claude/worktrees/**`, `references/skills-map.md`, `.context/agents/architect.md`.
- **Comandos de sinal:** `bash tests/run-unit.sh`, `bash tests/run-integration.sh`, `bash tests/run-lint.sh`.

```yaml
requiredSignals: [unit, integration, lint]
```

### Limitação declarada

O efeito principal — o desaparecimento de `devflow:odoo-*` e `devflow:nxz-go-test` do namespace — **não é observável por teste automatizado**, pois depende de o Claude Code reindexar o plugin. A Tarefa 1 é um **proxy estrutural** (disjunção de conjuntos). A confirmação final é observação manual após reinício da sessão, registrada na fase V como observação e **nunca** como sinal verde de teste.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `tests/integration/test-profile-skills-not-registered.mjs` | Guard de regressão: `skills/` × skills de perfil são disjuntos | criar |
| `tests/integration/test-profile-skills-integrity.mjs` | Trio `profiles/<fw>.yaml` ↔ diretórios ↔ `SKILL.md` | criar |
| `scripts/lib/detect-framework.mjs` | `loadProfiles` normaliza `skillBindings`; `frameworkContributions` perde `agents`, ganha `skillsWithOrigin` | modificar |
| `scripts/lib/provenance-sync.mjs` | `resolveArtifacts` source-aware + `dest` explícito; `applySync` detecta órfão | modificar |
| `scripts/lib/gen-known-hashes.mjs` | 3ª raiz de varredura | modificar |
| `scripts/lib/agent-skill-binding.mjs` | Grava `skills:` no frontmatter do agente, aditivo e idempotente | criar |
| `profiles/{odoo,nxz}.yaml` | Perdem `agents:`, ganham `skillBindings:`, remapeiam `dispatchKeywords` | modificar |
| `assets/skills/profiles/{odoo,nxz}/**` | Skills de perfil relocadas | mover |

---

## Tarefa 1: Guard de regressão — skills de perfil não são registradas

**Agente:** test-writer

**Files:**
- Create: `tests/integration/test-profile-skills-not-registered.mjs`

**Interfaces:**
- Consome: `loadProfiles(pluginRoot)` de `scripts/lib/detect-framework.mjs` — retorna `[{framework, skills: string[], ...}]`
- Produz: nada (teste terminal)

Este é o teste que teria pego o defeito original. Escrito **antes** de qualquer movimentação, ele deve falhar hoje.

- [ ] **Passo 1: Escrever o teste que falha**

```javascript
/**
 * Guard de regressão — skills de perfil NUNCA em skills/ do plugin.
 * Run: node --test tests/integration/test-profile-skills-not-registered.mjs
 *
 * O Claude Code registra todo skills/<nome>/SKILL.md do plugin como comando
 * global (/devflow:<nome>), sem opt-out por frontmatter. Logo skill condicional
 * a framework NÃO pode morar lá — vira comando em todo projeto (ADR-008 v1.1.0).
 *
 * AC1 skills/ do plugin e o conjunto contribuído por perfis são DISJUNTOS
 * AC2 toda skill declarada por um perfil existe em assets/skills/profiles/<fw>/
 * AC3 nenhum SKILL.md em skills/ carrega path absoluto de máquina
 * AC4 skills/ bate exatamente com o MANIFEST de skills base
 *
 * AC1 sozinho NÃO cobre o pior caso: uma skill de framework/produto que nenhum
 * perfil declara passa direto (foi o caso do nxz-go-test). AC3 pega o sintoma
 * mecânico e AC4 é a garantia estrutural — toda skill em skills/ tem de ser
 * declarada como capacidade do bridge, por escrito.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadProfiles } from "../../scripts/lib/detect-framework.mjs";

const REPO = resolve(import.meta.dirname, "../..");

function registeredSkillDirs() {
  const dir = join(REPO, "skills");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);
}

describe("skills de perfil não são registradas globalmente", () => {
  const profiles = loadProfiles(REPO);
  const registered = new Set(registeredSkillDirs());

  it("AC1 skills/ e as skills de perfil são conjuntos disjuntos", () => {
    const leaked = [];
    for (const p of profiles) {
      for (const slug of p.skills) {
        if (registered.has(slug)) leaked.push(`${slug} (perfil ${p.framework})`);
      }
    }
    assert.deepEqual(
      leaked, [],
      `skills de perfil vazando no namespace global: ${leaked.join(", ")}`,
    );
  });

  it("AC2 toda skill de perfil existe sob assets/skills/profiles/<fw>/", () => {
    const missing = [];
    for (const p of profiles) {
      for (const slug of p.skills) {
        const skillMd = join(REPO, "assets", "skills", "profiles", p.framework, slug, "SKILL.md");
        if (!existsSync(skillMd)) missing.push(`${p.framework}/${slug}`);
      }
    }
    assert.deepEqual(missing, [], `skills de perfil sem arquivo: ${missing.join(", ")}`);
  });

  // AC3 — sintoma mecânico de artefato de projeto que vazou para o bundle.
  // Uma skill do bridge nunca aponta para o disco de uma máquina especifica.
  it("AC3 nenhuma skill em skills/ carrega path absoluto de máquina", () => {
    const ABS = /(^|[\s"'`(])(\/home\/|\/Users\/|[A-Z]:\\\\)/m;
    const ofensores = [];
    for (const slug of registered) {
      const md = join(REPO, "skills", slug, "SKILL.md");
      if (!existsSync(md)) continue;
      const m = readFileSync(md, "utf-8").match(ABS);
      if (m) ofensores.push(`${slug}: ${m[0].trim()}`);
    }
    assert.deepEqual(ofensores, [],
      `skill do bridge com path de máquina (artefato de projeto vazado): ${ofensores.join(", ")}`);
  });

  // AC4 — garantia estrutural. AC1 só olha o que os perfis declaram; uma skill
  // de framework SEM perfil (o caso nxz-go-test) escaparia. O MANIFEST obriga
  // toda skill de skills/ a ser declarada como capacidade do bridge.
  it("AC4 skills/ bate exatamente com o MANIFEST de skills base", () => {
    const manifesto = readFileSync(join(REPO, "skills", "MANIFEST.txt"), "utf-8")
      .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    const declaradas = new Set(manifesto);
    const naoDeclaradas = [...registered].filter((s) => !declaradas.has(s)).sort();
    const orfas = manifesto.filter((s) => !registered.has(s)).sort();
    assert.deepEqual(naoDeclaradas, [],
      `skill em skills/ fora do MANIFEST — declare como capacidade do bridge ou mova para assets/skills/profiles/: ${naoDeclaradas.join(", ")}`);
    assert.deepEqual(orfas, [], `MANIFEST cita skill inexistente: ${orfas.join(", ")}`);
  });
});
```

- [ ] **Passo 2: Criar o MANIFEST de skills base**

Gerar a partir do estado **alvo** (44 skills, já sem as 4 relocadas e sem `nxz-go-test`):

```bash
cat > skills/MANIFEST.txt <<'EOF'
# Skills base do DevFlow — capacidades do BRIDGE, registradas no namespace global.
#
# Toda skill em skills/ DEVE constar aqui (guard AC4 de
# tests/integration/test-profile-skills-not-registered.mjs).
#
# Conhecimento condicional a framework NAO entra nesta lista: vai para
# assets/skills/profiles/<fw>/<slug>/ e e copiado sob deteccao de perfil
# (ADR-008 v1.1.0 — localizacao e o contrato de registro).
EOF
ls -d skills/*/ | xargs -n1 basename \
  | grep -vE '^(odoo-development|frontend-specialist-odoo|odoo-l10n-br|odoo-nxz-overlay|nxz-go-test)$' \
  | sort >> skills/MANIFEST.txt
wc -l skills/MANIFEST.txt   # 7 linhas de cabeçalho + 44 slugs
```

- [ ] **Passo 3: Rodar e confirmar que falha (RED)**

Run: `node --test tests/integration/test-profile-skills-not-registered.mjs`

Expected: **FAIL** em três dos quatro ACs, cada um por um motivo distinto:

| AC | Falha esperada |
|---|---|
| AC1 | 4 vazamentos: `odoo-development (odoo)`, `frontend-specialist-odoo (odoo)`, `odoo-l10n-br (odoo)`, `odoo-nxz-overlay (nxz)` |
| AC2 | os mesmos 4, ainda sem arquivo sob `assets/skills/profiles/` |
| AC3 | `nxz-go-test: /home/` — o path absoluto de máquina no bundle |
| AC4 | `nxz-go-test` + as 4 relocadas ainda em `skills/` mas fora do MANIFEST |

AC3 e AC4 são o que faltava: **AC1 sozinho nunca teria pego o `nxz-go-test`**, porque nenhum perfil o declara. Verificado empiricamente antes de escrever este plano.

- [ ] **Passo 4: Commit do teste vermelho**

```bash
git add tests/integration/test-profile-skills-not-registered.mjs skills/MANIFEST.txt
git commit -m "test(profiles): guard de regressão de namespace com 4 ACs (RED)"
```

---

## Tarefa 2: Relocar as 4 skills de perfil

**Agente:** refactoring-specialist

**Files:**
- Move: `skills/odoo-development/` → `assets/skills/profiles/odoo/odoo-development/`
- Move: `skills/frontend-specialist-odoo/` → `assets/skills/profiles/odoo/frontend-specialist-odoo/`
- Move: `skills/odoo-l10n-br/` → `assets/skills/profiles/odoo/odoo-l10n-br/`
- Move: `skills/odoo-nxz-overlay/` → `assets/skills/profiles/nxz/odoo-nxz-overlay/`
- Test: `tests/integration/test-profile-skills-not-registered.mjs` (da Tarefa 1)

**Interfaces:**
- Consome: nada
- Produz: o layout `assets/skills/profiles/<fw>/<slug>/SKILL.md` que a Tarefa 3 vai resolver

- [ ] **Passo 1: Criar os diretórios de perfil e mover**

```bash
mkdir -p assets/skills/profiles/odoo assets/skills/profiles/nxz
git mv skills/odoo-development         assets/skills/profiles/odoo/odoo-development
git mv skills/frontend-specialist-odoo assets/skills/profiles/odoo/frontend-specialist-odoo
git mv skills/odoo-l10n-br             assets/skills/profiles/odoo/odoo-l10n-br
git mv skills/odoo-nxz-overlay         assets/skills/profiles/nxz/odoo-nxz-overlay
```

- [ ] **Passo 2: Confirmar que o conteúdo não mudou**

```bash
git diff --cached --stat -M
```
Expected: apenas renomeações (`R100`), zero linhas adicionadas ou removidas. Se aparecer qualquer `+`/`-`, um arquivo foi editado — desfaça e refaça o move.

- [ ] **Passo 3: Rodar o guard (GREEN parcial — AC1 e AC2)**

Run: `node --test tests/integration/test-profile-skills-not-registered.mjs`

Expected: **AC1 e AC2 PASS**. **AC3 e AC4 seguem RED**, ambos acusando `nxz-go-test`, que só sai do bundle na Tarefa 7. Isso é o comportamento correto — cada AC fecha na tarefa que resolve a sua causa:

| AC | Fecha em |
|---|---|
| AC1, AC2 | **esta tarefa** (relocação) |
| AC3, AC4 | **Tarefa 7** (retirada do `nxz-go-test`) |

Só após a Tarefa 7 o guard fica inteiramente verde.

- [ ] **Passo 4: Commit**

```bash
git add -A assets/skills skills
git commit -m "refactor(skills): reloca skills de perfil para assets/skills/profiles/<fw>/ (GREEN)"
```

---

## Tarefa 3: `skillsWithOrigin`, `skillBindings` e a revogação de `agents`

**Agente:** backend-specialist

**Files:**
- Modify: `scripts/lib/detect-framework.mjs:52-62` (`loadProfiles`), `:193-227` (`frameworkContributions`)
- Modify: `profiles/odoo.yaml`, `profiles/nxz.yaml`
- Delete: `agents/odoo-specialist.md`, `tests/integration/test-odoo-specialist-refs.mjs`
- Test: `tests/integration/test-detect-framework.mjs`

**Interfaces:**
- Produz: `frameworkContributions(projectRoot, pluginRoot)` → `{frameworks, skills, skillsWithOrigin: [{slug, framework}], standards, standardsWithOrigin, stacks, skillBindings: {papel: [slug]}, dispatchKeywords}` — **sem** a chave `agents`
- Consumido por: Tarefa 4 (`skillsWithOrigin`), Tarefa 6 (`skillBindings`)

**Ordem:** esta tarefa vem **antes** da resolução source-aware porque produz o `skillsWithOrigin` que a Tarefa 4 consome. Inverter a ordem deixaria a Tarefa 4 sem como ficar verde por conta própria.

- [ ] **Passo 1: Escrever os testes que falham**

```javascript
// acrescentar em tests/integration/test-detect-framework.mjs
// Fixture: projeto que casa com o perfil odoo. Sem o marcador nenhum perfil
// fica ativo e as asserções passariam vazias (falso-verde).
function projetoOdoo() {
  const proj = mkdtempSync(join(tmpdir(), "detect-odoo-"));
  writeFileSync(join(proj, "__manifest__.py"), "{'name': 'fixture'}\n");
  return proj;
}

describe("contribuições de perfil após a revogação de agents (ADR-008 v1.1.0)", () => {
  it("frameworkContributions não expõe mais agents", () => {
    const c = frameworkContributions(projetoOdoo(), REPO);
    assert.equal(c.agents, undefined, "perfis não contribuem agents");
  });

  it("expõe skillsWithOrigin com o perfil de origem", () => {
    const c = frameworkContributions(projetoOdoo(), REPO);
    const dev = c.skillsWithOrigin.find((s) => s.slug === "odoo-development");
    assert.deepEqual(dev, { slug: "odoo-development", framework: "odoo" });
  });

  it("normaliza skillBindings e mapeia papel → skills", () => {
    const c = frameworkContributions(projetoOdoo(), REPO);
    assert.deepEqual(c.skillBindings["backend-specialist"].sort(),
      ["odoo-development", "odoo-l10n-br"]);
    assert.deepEqual(c.skillBindings["frontend-specialist"], ["frontend-specialist-odoo"]);
  });

  it("dispatchKeywords não referencia agente do plugin", () => {
    const c = frameworkContributions(projetoOdoo(), REPO);
    assert.equal(c.dispatchKeywords["odoo-specialist"], undefined);
    assert.ok(c.dispatchKeywords["backend-specialist"].includes("orm"));
  });

  it("backward-compat: perfil sem as chaves novas → arrays/objetos vazios", () => {
    const p = loadProfiles(REPO).find((x) => x.framework === "nxz");
    assert.ok(Array.isArray(p.skills));
    assert.equal(typeof p.skillBindings, "object");
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha (RED)**

Run: `node --test tests/integration/test-detect-framework.mjs`
Expected: **FAIL** — `c.agents` ainda é `["odoo-specialist"]`, `skillsWithOrigin` e `skillBindings` são `undefined`.

- [ ] **Passo 3: Normalizar `skillBindings` no `loadProfiles`**

Em `scripts/lib/detect-framework.mjs`, no objeto empurrado por `loadProfiles`, remover a linha `agents:` e acrescentar:

```javascript
      skills: Array.isArray(data.skills) ? data.skills : [],
      skillBindings: (data.skillBindings && typeof data.skillBindings === "object")
        ? data.skillBindings : {},
```

- [ ] **Passo 4: Atualizar `frameworkContributions`**

Remover `const agents = new Set()`, o `p.agents.forEach(...)` e a chave `agents:` do retorno. Acrescentar:

```javascript
  const skillsOrigin = new Map();  // slug -> framework (primeiro perfil vence)
  const skillBindings = {};
  // ...dentro do laço `for (const p of active)`:
    p.skills.forEach((s) => {
      skills.add(s);
      if (!skillsOrigin.has(s)) skillsOrigin.set(s, p.framework);
    });
    for (const [role, slugs] of Object.entries(p.skillBindings || {})) {
      skillBindings[role] = [...new Set([...(skillBindings[role] || []), ...(slugs || [])])];
    }
  // ...no retorno, no lugar de `agents`:
    skillsWithOrigin: [...skillsOrigin].map(([slug, framework]) => ({ slug, framework })),
    skillBindings,
```

- [ ] **Passo 5: Atualizar `profiles/odoo.yaml`**

Remover a linha `agents: ["odoo-specialist"]` e o bloco `dispatchKeywords` antigo; colocar:

```yaml
# Perfis NÃO contribuem agents (ADR-008 v1.1.0) — criar agente de projeto é do dotcontext.
skills: ["odoo-development", "frontend-specialist-odoo", "odoo-l10n-br"]
# Liga cada skill a um papel de agente de projeto; o sync grava isso no frontmatter.
skillBindings:
  backend-specialist:  ["odoo-development", "odoo-l10n-br"]
  frontend-specialist: ["frontend-specialist-odoo"]
dispatchKeywords:
  backend-specialist:  ["odoo", "orm", "addon", "l10n_br", "nfc-e", "nf-e"]
  frontend-specialist: ["owl", "qweb", "pos"]
```

- [ ] **Passo 6: Atualizar `profiles/nxz.yaml`**

Remover `agents: []`; colocar:

```yaml
skills: ["odoo-nxz-overlay"]
skillBindings:
  backend-specialist: ["odoo-nxz-overlay"]
dispatchKeywords:
  backend-specialist: ["nxz", "bridge", "nfce", "danfe"]
```

- [ ] **Passo 7: Remover o agente do plugin e seu teste**

```bash
git rm agents/odoo-specialist.md tests/integration/test-odoo-specialist-refs.mjs
```

**Desvio registrado na execução — `tests/odoo-artifacts/` também depende dos paths antigos.** O escopo de testes a ajustar previa só os três `test-profile-*`, mas o sinal `unit` quebrou em `tests/odoo-artifacts/`, que hardcoda os caminhos das skills por meio da lib compartilhada `tests/odoo-artifacts/lib/artifact-lint.mjs` (`L1_FILES`/`L2_FILES`/`L3_FILES`) e testa o agente removido em `env-coupling.test.mjs`. Ajustes feitos aqui:

- `lib/artifact-lint.mjs` — as 4 constantes passam a apontar para `assets/skills/profiles/<fw>/`.
- `env-coupling.test.mjs` — removido o bloco que lia `agents/odoo-specialist.md` (o arquivo deixou de existir por decisão da ADR) e trocado o `if (!existsSync(file)) return;` por uma asserção de existência: aquele `return` faria o teste passar **vazio** justamente se a relocação tivesse perdido um arquivo.

- [ ] **Passo 8: Rodar os testes e confirmar GREEN**

Run: `node --test tests/integration/test-detect-framework.mjs`
Expected: **PASS**. Não rode ainda o `test-provenance-sync.mjs` — a resolução source-aware que o deixa verde é a Tarefa 4.

- [ ] **Passo 9: Commit**

```bash
git add -A scripts/lib/detect-framework.mjs profiles tests/integration agents
git commit -m "feat(profiles): revoga agents por perfil; adiciona skillsWithOrigin e skillBindings"
```

---

## Tarefa 4: Resolução source-aware no provenance-sync

**Agente:** backend-specialist

**Files:**
- Modify: `scripts/lib/provenance-sync.mjs:75-103` (`resolveArtifacts`)
- Test: `tests/integration/test-provenance-sync.mjs`

**Interfaces:**
- Consome: `frameworkContributions({...})` → `{frameworks, skills, standardsWithOrigin, stacks, dispatchKeywords}`
- Produz: `resolveArtifacts({projectRoot, pluginRoot, baseSkills})` → `[{src, dest, framework}]`, onde `framework` é `"skill"` para skill base e o nome do perfil para skill de perfil

Hoje o `dest` é derivado do path relativo do `src`, o que só funciona porque `skills/` do plugin espelha `.context/skills/`. Com a origem em `assets/skills/profiles/<fw>/`, derivar produziria `.context/assets/skills/profiles/...`.

- [ ] **Passo 1: Escrever o teste que falha**

O arquivo já tem o helper `mk()` (tmpdirs) e `const REPO`. Um tmpdir **vazio não casa** com o perfil Odoo — a fixture precisa criar o marcador de detecção, senão o teste passa vazio (falso-verde).

```javascript
// acrescentar em tests/integration/test-provenance-sync.mjs
// Fixture: projeto que CASA com o perfil odoo (detect.files: __manifest__.py).
function projetoOdoo() {
  const proj = mkdtempSync(join(tmpdir(), "prov-odoo-"));
  writeFileSync(join(proj, "__manifest__.py"), "{'name': 'fixture'}\n");
  return proj;
}

describe("resolveArtifacts é source-aware por slug", () => {
  it("skill de perfil resolve de assets/skills/profiles/<fw>/ com dest em .context/skills/", () => {
    const arts = resolveArtifacts({
      projectRoot: projetoOdoo(),
      pluginRoot: REPO,
      baseSkills: [],
    });
    const dev = arts.find((a) => a.src.includes("odoo-development"));
    assert.ok(dev, "odoo-development deveria ser contribuída pelo perfil odoo");
    assert.match(dev.src, /assets\/skills\/profiles\/odoo\/odoo-development\/SKILL\.md$/);
    assert.match(dev.dest, /\.context\/skills\/odoo-development\/SKILL\.md$/);
    assert.equal(dev.framework, "odoo");
    assert.ok(!dev.dest.includes("assets"), "dest não pode carregar o path de origem");
  });

  it("skill base continua resolvendo de skills/", () => {
    const arts = resolveArtifacts({
      projectRoot: projetoOdoo(),
      pluginRoot: REPO,
      baseSkills: ["commit-message"],
    });
    const base = arts.find((a) => a.src.includes("commit-message"));
    assert.ok(base, "skill base deveria ser resolvida");
    assert.match(base.src, /\/skills\/commit-message\//);
    assert.ok(!base.src.includes("assets/skills"), "skill base não vem de assets/");
    assert.match(base.dest, /\.context\/skills\/commit-message\//);
    assert.equal(base.framework, "skill");
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha (RED)**

Run: `node --test tests/integration/test-provenance-sync.mjs`
Expected: **FAIL** — o primeiro teste quebra porque `src` ainda aponta para `skills/odoo-development` (inexistente após a Tarefa 2), então a skill de perfil não é resolvida.

- [ ] **Passo 3: Implementar a resolução source-aware**

Substituir o laço de skills em `resolveArtifacts` por:

```javascript
export function resolveArtifacts({ projectRoot, pluginRoot, baseSkills = [] }) {
  const c = frameworkContributions(projectRoot, pluginRoot);
  const arts = [];

  // Origem por slug: base vive em skills/; de perfil, em assets/skills/profiles/<fw>/.
  // O dest NUNCA é derivado do rel do src — derivar produziria .context/assets/skills/...
  const sources = new Map(); // slug -> {sub, framework}
  for (const slug of baseSkills) {
    sources.set(slug, { sub: join("skills", slug), framework: "skill" });
  }
  for (const { slug, framework } of c.skillsWithOrigin || []) {
    sources.set(slug, {
      sub: join("assets", "skills", "profiles", framework, slug),
      framework,
    });
  }

  for (const [slug, { sub, framework }] of sources) {
    const files = [];
    walkFiles(pluginRoot, sub, files);
    for (const rel of files) {
      const inner = relative(sub, rel);         // caminho dentro da skill
      arts.push({
        src: join(pluginRoot, rel),
        dest: join(projectRoot, ".context", "skills", slug, inner),
        framework,
      });
    }
  }

  for (const { id, framework } of c.standardsWithOrigin || []) {
    const md = join("assets", "standards", "profiles", framework, `${id}.md`);
    arts.push({
      src: join(pluginRoot, md),
      dest: join(projectRoot, ".context", "engineering", "standards", `${id}.md`),
      framework,
    });
    const js = join("assets", "standards", "profiles", framework, "machine", `${id}.js`);
    if (existsSync(join(pluginRoot, js))) {
      arts.push({
        src: join(pluginRoot, js),
        dest: join(projectRoot, ".context", "engineering", "standards", "machine", `${id}.js`),
        framework,
      });
    }
  }
  return arts;
}
```

- [ ] **Passo 4: Rodar e confirmar GREEN**

Run: `node --test tests/integration/test-provenance-sync.mjs`
Expected: **PASS**. O `skillsWithOrigin` que esta tarefa consome já existe — foi entregue pela Tarefa 3.

- [ ] **Passo 5: Commit**

```bash
git add scripts/lib/provenance-sync.mjs tests/integration/test-provenance-sync.mjs
git commit -m "feat(sync): resolveArtifacts resolve origem por slug e calcula dest explicitamente"
```

---

## Tarefa 5: Proveniência — nova raiz e o invariante do hash

**Agente:** backend-specialist

**Files:**
- Modify: `scripts/lib/gen-known-hashes.mjs:29-34` (`distributableFiles`)
- Test: `tests/integration/test-gen-known-hashes.mjs`

**Interfaces:**
- Produz: `distributableFiles(pluginRoot)` → `string[]` de paths relativos `.md`/`.js`, agora incluindo `assets/skills/profiles/**`

O hash é `sha256(conteúdo)`, path-agnóstico — então a relocação **não pode** alterar o conjunto de hashes, desde que a nova raiz seja varrida.

- [ ] **Passo 1: Escrever o teste que falha**

```javascript
// acrescentar em tests/integration/test-gen-known-hashes.mjs
describe("relocação das skills de perfil e o registry", () => {
  it("assets/skills/profiles/** entra na varredura de distribuíveis", () => {
    const files = distributableFiles(REPO);
    const relocated = files.filter((f) => f.startsWith("assets/skills/profiles/"));
    assert.ok(relocated.length > 0, "skills de perfil precisam ser indexadas");
    assert.ok(
      relocated.some((f) => f.endsWith("odoo-development/SKILL.md")),
      "odoo-development/SKILL.md deve estar no registry",
    );
  });

  it("nenhuma skill de perfil sobrou sob skills/", () => {
    const files = distributableFiles(REPO);
    const leaked = files.filter((f) => /^skills\/(odoo-|frontend-specialist-odoo|nxz-)/.test(f));
    assert.deepEqual(leaked, [], `skills de perfil ainda em skills/: ${leaked.join(", ")}`);
  });

  it("o hash do conteúdo relocado é preservado (path-agnóstico)", () => {
    const set = genFromWorkingTree(REPO);
    const moved = join(REPO, "assets/skills/profiles/odoo/odoo-development/SKILL.md");
    const h = createHash("sha256").update(readFileSync(moved)).digest("hex");
    assert.ok(set.has(h), "o hash do conteúdo movido continua no registry");
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha (RED)**

Run: `node --test tests/integration/test-gen-known-hashes.mjs`
Expected: **FAIL** no primeiro e no terceiro — `assets/skills/profiles/` não é varrido, então os arquivos relocados sumiram do registry.

- [ ] **Passo 3: Adicionar a terceira raiz**

```javascript
// Artefatos VERBATIM: skills/** (base) + assets/skills/profiles/** (perfil)
// + assets/standards/profiles/** (.md + .js). Sem agents nem std raiz.
export function distributableFiles(pluginRoot) {
  const out = [];
  walk(pluginRoot, "skills", out);
  walk(pluginRoot, join("assets", "skills", "profiles"), out);
  walk(pluginRoot, join("assets", "standards", "profiles"), out);
  return out.filter((f) => f.endsWith(".md") || f.endsWith(".js"));
}
```

- [ ] **Passo 4: Rodar e confirmar GREEN**

Run: `node --test tests/integration/test-gen-known-hashes.mjs`
Expected: **PASS**.

- [ ] **Passo 5: Regenerar o registry e conferir o delta**

```bash
node scripts/lib/gen-known-hashes.mjs
git diff --stat assets/provenance/known-hashes.json
```
Expected: o conjunto encolhe **apenas** pelos hashes do `nxz-go-test` (removido na Tarefa 7). Se hashes das skills relocadas sumirem, o conteúdo foi alterado no move — volte à Tarefa 2.

- [ ] **Passo 6: Commit**

```bash
git add scripts/lib/gen-known-hashes.mjs tests/integration/test-gen-known-hashes.mjs assets/provenance/known-hashes.json
git commit -m "feat(provenance): indexa assets/skills/profiles e preserva o invariante de hash"
```

---

## Tarefa 6: Binding `skills:` no frontmatter do agente de projeto

**Agente:** backend-specialist

**Files:**
- Create: `scripts/lib/agent-skill-binding.mjs`
- Create: `tests/integration/test-agent-skill-binding.mjs`

**Interfaces:**
- Consome: `skillBindings` de `frameworkContributions` (Tarefa 4); `parseFrontmatter` de `scripts/lib/frontmatter.mjs` (**só leitura** — ver nota abaixo)
- Produz: `applySkillBindings({root, skillBindings})` → `{written: string[], pending: string[]}` (`pending` = papéis sem agente correspondente) e `upsertSkillsLine(raw, slugs)` → `string|null`

**Risco coberto por este teste:** o parser do dotcontext **descarta o frontmatter inteiro** quando um campo sai mal-tipado (caso conhecido: `generated:` sem aspas virando `Date`). O teste valida o arquivo resultante com o parser do **próprio dotcontext** — `pyyaml` daria falso-OK.

**Decisão de implementação — edição cirúrgica, não re-serialização.** `scripts/lib/frontmatter.mjs` exporta apenas `parseYaml` e `parseFrontmatter`; **não existe** um `stringifyFrontmatter`. Escrever um seria o caminho errado de qualquer forma: re-serializar o bloco inteiro é exatamente o que pode re-emitir `generated: 2026-04-02` sem aspas e disparar o bug que este teste persegue. A lib preserva o texto original do frontmatter e apenas **insere ou substitui a linha `skills:`** — assim as demais chaves permanecem byte-idênticas por construção, não por confiança no serializador.

- [ ] **Passo 1: Escrever os testes que falham**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySkillBindings } from "../../scripts/lib/agent-skill-binding.mjs";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";

const AGENTE = `---
type: agent
name: backend-specialist
description: Backend do projeto
role: backend
generated: "2026-04-02"
status: filled
scaffoldVersion: "2.0.0"
---

## Mission

Corpo do playbook que NÃO pode ser reescrito.
`;

function projetoComAgente() {
  const root = mkdtempSync(join(tmpdir(), "devflow-binding-"));
  mkdirSync(join(root, ".context", "agents"), { recursive: true });
  writeFileSync(join(root, ".context", "agents", "backend-specialist.md"), AGENTE);
  return root;
}

describe("binding de skills no agente de projeto", () => {
  it("grava skills: preservando todas as demais chaves e o corpo", () => {
    const root = projetoComAgente();
    applySkillBindings({
      root,
      skillBindings: { "backend-specialist": ["odoo-development", "odoo-l10n-br"] },
    });
    const raw = readFileSync(join(root, ".context/agents/backend-specialist.md"), "utf-8");
    const { data, body } = parseFrontmatter(raw);

    assert.deepEqual(data.skills, ["odoo-development", "odoo-l10n-br"]);
    assert.equal(data.name, "backend-specialist");
    assert.equal(data.role, "backend");
    assert.equal(data.scaffoldVersion, "2.0.0");
    assert.equal(data.type, "agent");
    assert.match(body, /Corpo do playbook que NÃO pode ser reescrito/);
  });

  it("é idempotente — reaplicar não duplica nem reordena", () => {
    const root = projetoComAgente();
    const args = { root, skillBindings: { "backend-specialist": ["odoo-development"] } };
    applySkillBindings(args);
    const primeira = readFileSync(join(root, ".context/agents/backend-specialist.md"), "utf-8");
    applySkillBindings(args);
    const segunda = readFileSync(join(root, ".context/agents/backend-specialist.md"), "utf-8");
    assert.equal(primeira, segunda, "reaplicar deve ser byte-idêntico");
  });

  it("papel sem agente vira pendência — NUNCA cria o arquivo", () => {
    const root = projetoComAgente();
    const r = applySkillBindings({
      root,
      skillBindings: { "mobile-specialist": ["alguma-skill"] },
    });
    assert.deepEqual(r.pending, ["mobile-specialist"]);
    assert.equal(existsSync(join(root, ".context/agents/mobile-specialist.md")), false);
  });

  it("o frontmatter resultante sobrevive ao parser do dotcontext", () => {
    const root = projetoComAgente();
    applySkillBindings({
      root,
      skillBindings: { "backend-specialist": ["odoo-development"] },
    });
    const raw = readFileSync(join(root, ".context/agents/backend-specialist.md"), "utf-8");
    const { data } = parseFrontmatter(raw);
    // Se um campo sair mal-tipado, o parser descarta o frontmatter inteiro e
    // estas chaves somem — é exatamente esse modo de falha que o teste detecta.
    for (const k of ["type", "name", "role", "status", "scaffoldVersion", "skills"]) {
      assert.ok(k in data, `chave ${k} perdida — frontmatter foi descartado`);
    }
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha (RED)**

Run: `node --test tests/integration/test-agent-skill-binding.mjs`
Expected: **FAIL** com `Cannot find module '.../agent-skill-binding.mjs'`.

- [ ] **Passo 3: Implementar a lib**

```javascript
/**
 * agent-skill-binding — grava `skills:` no frontmatter do agente de projeto.
 *
 * Aditivo e idempotente: NÃO re-serializa o frontmatter. Preserva o texto
 * original linha a linha e apenas insere/substitui a linha `skills:`, para que
 * as demais chaves fiquem byte-idênticas por CONSTRUÇÃO — re-serializar poderia
 * re-emitir um campo mal-tipado (ex.: `generated:` sem aspas) e fazer o parser
 * do dotcontext descartar o frontmatter inteiro.
 *
 * NUNCA cria agente — isso é competência do dotcontext (ADR-006 / ADR-008 v1.1.0).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";

const DELIM = /^---\s*$/;

/** Insere ou substitui a linha `skills:` dentro do bloco de frontmatter. */
export function upsertSkillsLine(raw, slugs) {
  const linhas = raw.split("\n");
  if (!DELIM.test(linhas[0] ?? "")) return null;          // sem frontmatter
  const fim = linhas.findIndex((l, i) => i > 0 && DELIM.test(l));
  if (fim === -1) return null;                            // bloco nao fechado

  const valor = `skills: [${slugs.join(", ")}]`;
  const alvo = linhas.findIndex((l, i) => i > 0 && i < fim && /^skills:/.test(l));
  if (alvo === -1) linhas.splice(fim, 0, valor);          // insere antes do ---
  else linhas[alvo] = valor;                              // substitui no lugar
  return linhas.join("\n");
}

export function applySkillBindings({ root, skillBindings = {} }) {
  const written = [];
  const pending = [];

  for (const [role, slugs] of Object.entries(skillBindings)) {
    const file = join(root, ".context", "agents", `${role}.md`);
    if (!existsSync(file)) { pending.push(role); continue; }

    const raw = readFileSync(file, "utf-8");
    const { data } = parseFrontmatter(raw);
    if (!data || Object.keys(data).length === 0) { pending.push(role); continue; }

    const desejado = [...new Set(slugs)].sort();
    const atual = Array.isArray(data.skills) ? [...data.skills].sort() : null;
    if (atual && atual.join(",") === desejado.join(",")) continue; // idempotente

    const out = upsertSkillsLine(raw, desejado);
    if (out == null) { pending.push(role); continue; }
    writeFileSync(file, out);
    written.push(role);
  }
  return { written, pending };
}
```

- [ ] **Passo 4: Rodar e confirmar GREEN**

Run: `node --test tests/integration/test-agent-skill-binding.mjs`
Expected: **PASS** nos 4 testes.

- [ ] **Passo 5: Declarar o gatilho de reaplicação**

Sem gatilho, o binding é uma escrita única que o dotcontext apaga na próxima regeneração do agente — e aí a leitura *"o devflow materializa, não autora"* que reconcilia esta tarefa com o guardrail do ADR-006 deixa de se sustentar: sobra uma escrita órfã num arquivo de outro dono.

Em `skills/context-sync/SKILL.md`, na seção de resolução de artefatos, declarar explicitamente:

> **Binding de skills (toda execução).** Após copiar os artefatos de perfil,
> `context-sync` invoca `applySkillBindings({ root, skillBindings })` com o
> `skillBindings` de `frameworkContributions`. A chamada é **incondicional e
> idempotente**: reaplicar sem mudança não altera byte algum do arquivo, e uma
> regeneração do agente pelo dotcontext é reparada no sync seguinte. Papéis sem
> agente correspondente voltam em `pending` e são **reportados**, nunca criados.

- [ ] **Passo 6: Commit**

```bash
git add scripts/lib/agent-skill-binding.mjs tests/integration/test-agent-skill-binding.mjs skills/context-sync/SKILL.md
git commit -m "feat(sync): binding aditivo de skills no agente de projeto, reaplicado a cada sync"
```

---

## Tarefa 7: Retirar o `nxz-go-test` e neutralizar os defaults proprietários

**Agente:** refactoring-specialist

**Files:**
- Delete: `skills/nxz-go-test/`
- Modify: `skills/adr-builder/assets/context.yaml`

**Interfaces:**
- Consome: nada
- Produz: nada

`nxz-go-test` não é contribuído por nenhum perfil, referencia um caminho absoluto da máquina do autor e já existe duplicado em `~/.claude/skills/nxz-go-test` — a remoção não perde capacidade.

- [ ] **Passo 1: Confirmar que nada no plugin o referencia**

```bash
grep -rn "nxz-go-test" --include="*.md" --include="*.yaml" --include="*.mjs" \
  profiles/ skills/ scripts/ agents/ commands/ tests/ | grep -v "^skills/nxz-go-test/"
```
Expected: **nenhuma saída**. Se aparecer algo, trate a referência antes de remover.

- [ ] **Passo 2: Remover**

```bash
git rm -r skills/nxz-go-test
```

- [ ] **Passo 3: Neutralizar os defaults do adr-builder**

Em `skills/adr-builder/assets/context.yaml`, substituir as duas listas:

```yaml
# Nomes de produtos internos que NÃO devem aparecer em ADR (Check 3).
# Substitua pelos produtos da sua organização.
product_names:
  - <Produto A>
  - <Produto B>

# Verticais de mercado que NÃO devem aparecer em ADR (Check 3).
# Substitua pelas verticais da sua organização.
business_verticals:
  - <vertical-1>
  - <vertical-2>
```

- [ ] **Passo 4: Verificar que o Check 3 do audit continua funcionando**

Run: `node scripts/adr-audit.mjs .context/engineering/adrs/008-framework-profile-scoped-standards-v1.1.0.md --format=json`
Expected: Check 3 (`Foco em stack`) segue `PASS` — os placeholders não casam com nada no texto, que é o comportamento esperado de um default neutro.

- [ ] **Passo 5: Commit**

```bash
git add -A skills
git commit -m "chore(skills): retira nxz-go-test do bundle e neutraliza defaults proprietários"
```

---

## Tarefa 8: Integridade do trio e testes de perfil existentes

**Agente:** test-writer

**Files:**
- Create: `tests/integration/test-profile-skills-integrity.mjs`
- Modify: `tests/integration/test-profile-nxz-integrity.mjs`, `test-profile-standards-integrity.mjs`, `test-profile-standards-wiring.mjs`

**Interfaces:**
- Consome: `loadProfiles(pluginRoot)`

- [ ] **Passo 1: Escrever o teste de integridade**

```javascript
/**
 * Integridade do trio — skills de perfil.
 * Run: node --test tests/integration/test-profile-skills-integrity.mjs
 *
 * AC1 todo slug em profiles/<fw>.yaml `skills:` tem diretório com SKILL.md
 * AC2 nenhum diretório órfão em assets/skills/profiles/<fw>/ sem declaração no yaml
 * AC3 todo papel citado em skillBindings referencia skills declaradas
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadProfiles } from "../../scripts/lib/detect-framework.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const base = (fw) => join(REPO, "assets", "skills", "profiles", fw);

describe("integridade das skills de perfil", () => {
  const profiles = loadProfiles(REPO);

  it("AC1 todo slug declarado tem diretório com SKILL.md", () => {
    const faltando = [];
    for (const p of profiles) {
      for (const slug of p.skills) {
        if (!existsSync(join(base(p.framework), slug, "SKILL.md"))) {
          faltando.push(`${p.framework}/${slug}`);
        }
      }
    }
    assert.deepEqual(faltando, []);
  });

  it("AC2 nenhum diretório órfão", () => {
    const orfaos = [];
    for (const p of profiles) {
      const dir = base(p.framework);
      if (!existsSync(dir)) continue;
      const declarados = new Set(p.skills);
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory() && !declarados.has(e.name)) orfaos.push(`${p.framework}/${e.name}`);
      }
    }
    assert.deepEqual(orfaos, []);
  });

  it("AC3 skillBindings só cita skills declaradas pelo perfil", () => {
    const invalidos = [];
    for (const p of profiles) {
      const declarados = new Set(p.skills);
      for (const [role, slugs] of Object.entries(p.skillBindings || {})) {
        for (const s of slugs) {
          if (!declarados.has(s)) invalidos.push(`${p.framework}: ${role} → ${s}`);
        }
      }
    }
    assert.deepEqual(invalidos, []);
  });
});
```

- [ ] **Passo 2: Rodar (deve passar após as Tarefas 2 e 4)**

Run: `node --test tests/integration/test-profile-skills-integrity.mjs`
Expected: **PASS**.

- [ ] **Passo 3: Corrigir os testes de perfil existentes**

```bash
grep -rn "agents\b\|odoo-specialist" tests/integration/test-profile-nxz-integrity.mjs \
  tests/integration/test-profile-standards-integrity.mjs \
  tests/integration/test-profile-standards-wiring.mjs
```
Remover toda asserção sobre a chave `agents` dos perfis e sobre `odoo-specialist`. As asserções de `standards`/`stacks` permanecem inalteradas.

- [ ] **Passo 4: Rodar a suíte de integração inteira**

Run: `bash tests/run-integration.sh`
Expected: **PASS** — exit 0.

- [ ] **Passo 5: Commit**

```bash
git add tests/integration
git commit -m "test(profiles): integridade do trio de skills e ajuste dos testes de perfil"
```

---

## Tarefa 9: Documentação — exemplos e templates

**Agente:** documentation-writer

**Files:**
- Modify: `skills/project-init/SKILL.md`, `skills/agent-dispatch/SKILL.md`, `skills/context-sync/SKILL.md`
- Modify: `templates/agents/odoo-project-context.example.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consome: o layout e as chaves definidos nas Tarefas 2 e 4

- [ ] **Passo 1: Localizar as referências obsoletas**

```bash
grep -rn "odoo-specialist\|skills/odoo-\|agents:" \
  skills/project-init/SKILL.md skills/agent-dispatch/SKILL.md \
  skills/context-sync/SKILL.md templates/agents/odoo-project-context.example.md
```

- [ ] **Passo 2: Atualizar `skills/project-init/SKILL.md`**

Trocar o exemplo de saída do detector (≈ linhas 425-427) por:

```json
{ "frameworks": ["odoo"],
  "skills": ["odoo-development", "frontend-specialist-odoo", "odoo-l10n-br"],
  "skillsWithOrigin": [{ "slug": "odoo-development", "framework": "odoo" }],
  "skillBindings": { "backend-specialist": ["odoo-development", "odoo-l10n-br"] },
  "dispatchKeywords": { "backend-specialist": ["odoo", "orm", "..."] } }
```

Remover o parágrafo que manda acrescentar os agents do detector ao set (≈ 517-518) e substituir por: *"Perfis não contribuem agents (ADR-008 v1.1.0) — a criação de agente de projeto é do dotcontext. O perfil contribui skills e, por `skillBindings`, a chave `skills:` no frontmatter do agente do papel correspondente."*

Ajustar a menção de cópia de skills (≈ 570) para a origem `assets/skills/profiles/<fw>/`.

- [ ] **Passo 3: Atualizar `skills/agent-dispatch/SKILL.md`**

Nas linhas ≈ 37, 45 e 75, trocar `odoo-specialist` pelos papéis reais (`backend-specialist`, `frontend-specialist`) e acrescentar que o dispatch lê a chave `skills:` do frontmatter do agente de projeto para saber quais skills de framework carregar.

- [ ] **Passo 4: Atualizar `skills/context-sync/SKILL.md`**

Na linha ≈ 141, ajustar a descrição da resolução de artefatos: skills de perfil vêm de `assets/skills/profiles/<fw>/`, o destino é sempre `.context/skills/<slug>/`, e artefato não mais contribuído é reportado como órfão (preservado, removido só sob confirmação).

- [ ] **Passo 5: Atualizar o template de contexto Odoo**

Em `templates/agents/odoo-project-context.example.md`, remover as referências a `odoo-specialist` e apontar para o agente de projeto do papel + a chave `skills:` do frontmatter.

- [ ] **Passo 6: Registrar no CHANGELOG**

Acrescentar em `## [Unreleased]`, seção `### Changed` com marcação **BREAKING**: skills de framework saem do namespace global; `devflow:odoo-*` e `devflow:nxz-go-test` deixam de existir como comandos; perfis não contribuem mais agents; o agent type `devflow:Odoo Specialist` é removido.

- [ ] **Passo 7: Commit**

```bash
git add skills templates CHANGELOG.md
git commit -m "docs: alinha exemplos, template e CHANGELOG ao layout de skills por perfil"
```

---

## Tarefa 10: Detecção de órfão no sync

**Agente:** backend-specialist

**Files:**
- Modify: `scripts/lib/provenance-sync.mjs:105-139` (`applySync`)
- Create: `assets/provenance/retired.json`
- Test: `tests/integration/test-provenance-sync.mjs`

**Interfaces:**
- Produz: `applySync(...)` → report com a chave nova `orphaned: [{path, verdict}]`, `verdict` ∈ `{"untouched", "diverged"}`
- Produz: `detectRetired({projectRoot, pluginRoot, registry})` → `[{path, since, reason, pristine}]`, `pristine` ∈ `{true, false, null}`

### Por que duas mecânicas, e não uma

O manifesto de proveniência **exclui agents por design** — o cabeçalho da lib diz textualmente *"Agents (preenchidos no deploy) e std-*.md raiz (live-loaded) ficam fora"*. Um detector de órfão que só lê o manifesto **nunca veria** `.context/agents/odoo-specialist.md`, que é justamente o único artefato realmente orfanado por esta mudança. As skills de Odoo mantêm slug e destino (não orfanam) e os 2 standards NXZ seguem contribuídos pelo perfil `nxz`, que permanece.

Daí duas mecânicas complementares:

| Mecânica | Cobre | Como decide |
|---|---|---|
| Órfão de manifesto | skills e standards de perfil que saíram do conjunto contribuído | compara manifesto × artefatos contribuídos |
| **Lista de aposentados** | qualquer artefato que o plugin **deixou de distribuir**, inclusive classes nunca rastreadas por hash | declaração explícita em `assets/provenance/retired.json` |

`pristine` é honesto sobre o limite: `true`/`false` quando o hash é conhecido, e **`null` quando a classe nunca foi rastreada** (agents) — nesse caso a ferramenta admite que não sabe, em vez de chutar.

- [ ] **Passo 1: Escrever o teste que falha**

```javascript
const ORFAO = ".context/skills/odoo-nxz-overlay/SKILL.md";

// Fixture: projeto com manifesto de proveniência E o artefato materializado em
// disco — sem o arquivo real, applySync pula o órfão (projHash == null).
// `recordedHash` permite gravar um hash DIFERENTE do conteúdo, que é como se
// simula um artefato editado localmente.
function projetoComManifesto({ recordedHash = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prov-orf-"));
  const abs = join(root, ORFAO);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, "conteudo do artefato\n");
  const real = createHash("sha256").update(readFileSync(abs)).digest("hex");
  mkdirSync(join(root, ".context"), { recursive: true });
  writeFileSync(
    join(root, ".context", ".provenance.json"),
    JSON.stringify({
      schema: 1,
      artifacts: [{ path: ORFAO, hash: recordedHash ?? real, framework: "nxz" }],
    }, null, 2) + "\n",
  );
  return { root, real };
}

describe("detecção de órfão", () => {
  it("artefato no manifesto que nenhum perfil contribui é reportado e NÃO removido", () => {
    const { root } = projetoComManifesto();          // manifesto grava o hash real
    const report = applySync({
      projectRoot: root, pluginRoot: REPO,
      artifacts: [],                                 // nenhum perfil ativo contribui
      registry: new Set(), sourceVersion: "3.0.0",
    });
    assert.deepEqual(report.orphaned.map((o) => o.path), [ORFAO]);
    assert.equal(report.orphaned[0].verdict, "untouched");
    assert.equal(existsSync(join(root, ORFAO)), true, "órfão NUNCA é removido pelo sync");
  });

  it("órfão com conteúdo divergente é marcado diverged", () => {
    // manifesto guarda hash de uma versão anterior; o disco tem outro conteúdo
    const { root } = projetoComManifesto({ recordedHash: "0".repeat(64) });
    const report = applySync({
      projectRoot: root, pluginRoot: REPO, artifacts: [],
      registry: new Set(), sourceVersion: "3.0.0",   // e o hash real não está no registry
    });
    assert.equal(report.orphaned[0].verdict, "diverged");
    assert.equal(existsSync(join(root, ORFAO)), true, "divergente também é preservado");
  });
});

describe("aposentados alcançam classes fora do manifesto", () => {
  it("o agente de perfil retirado é detectado, ainda que agents nunca entrem no manifesto", () => {
    const root = mkdtempSync(join(tmpdir(), "prov-ret-"));
    const agente = join(root, ".context/agents/odoo-specialist.md");
    mkdirSync(dirname(agente), { recursive: true });
    writeFileSync(agente, "---\ntype: agent\nname: odoo-specialist\n---\n");

    const achados = detectRetired({ projectRoot: root, pluginRoot: REPO, registry: new Set() });
    const alvo = achados.find((r) => r.path === ".context/agents/odoo-specialist.md");

    assert.ok(alvo, "o agente aposentado precisa ser detectado sem depender do manifesto");
    assert.equal(alvo.pristine, null, "agents nunca foram rastreados por hash — admitir que nao sabe");
    assert.match(alvo.reason, /agents/i);
    assert.equal(existsSync(agente), true, "aposentado NUNCA e removido pela deteccao");
  });

  it("nao reporta nada quando o projeto nao tem artefato aposentado", () => {
    const root = mkdtempSync(join(tmpdir(), "prov-ret-limpo-"));
    mkdirSync(join(root, ".context"), { recursive: true });
    assert.deepEqual(detectRetired({ projectRoot: root, pluginRoot: REPO, registry: new Set() }), []);
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha (RED)**

Run: `node --test tests/integration/test-provenance-sync.mjs`
Expected: **FAIL** — `report.orphaned` é `undefined` e `detectRetired` não existe.

- [ ] **Passo 3: Declarar os aposentados**

```bash
mkdir -p assets/provenance
cat > assets/provenance/retired.json <<'EOF'
{
  "schema": 1,
  "_comment": "Artefatos que o plugin JA distribuiu e nao distribui mais. O sync procura cada path no .context/ do projeto e REPORTA (nunca remove). Cobre inclusive classes que o manifesto de proveniencia nao rastreia, como agents.",
  "retired": [
    {
      "path": ".context/agents/odoo-specialist.md",
      "since": "3.0.0",
      "reason": "Perfis nao contribuem mais agents; criar agente de projeto e do dotcontext (ADR-008 v1.1.0)"
    },
    {
      "path": ".context/skills/nxz-go-test",
      "since": "3.0.0",
      "reason": "Artefato de projeto especifico; nunca foi gated por perfil algum"
    }
  ]
}
EOF
```

- [ ] **Passo 4: Implementar as duas mecânicas**

Em `applySync`, antes do `saveManifest`:

```javascript
  // Órfão: estava no manifesto mas nenhum perfil ativo contribui mais.
  // Preserva e reporta (ADR-012) — remoção só sob confirmação humana, fora daqui.
  const contribuidos = new Set(artifacts.map((a) => relative(projectRoot, a.dest)));
  report.orphaned = [];
  for (const [rel, rec] of byPath) {
    if (contribuidos.has(rel)) continue;
    const projHash = hashFile(join(projectRoot, rel));
    if (projHash == null) continue;               // já não existe em disco
    const intocado = projHash === rec.hash || (registry && registry.has(projHash));
    report.orphaned.push({ path: rel, verdict: intocado ? "untouched" : "diverged" });
  }
```

E, como função exportada nova:

```javascript
/**
 * Aposentados — artefatos que o plugin ja distribuiu e nao distribui mais.
 *
 * Existe porque o manifesto de proveniencia cobre SO skills e standards de
 * perfil: agents ficam de fora por design (sao preenchidos no deploy). Sem
 * isto, o unico artefato que a revogacao de agents realmente orfana seria
 * invisivel. NUNCA remove — so reporta (ADR-012).
 */
export function detectRetired({ projectRoot, pluginRoot, registry }) {
  const p = join(pluginRoot, "assets", "provenance", "retired.json");
  if (!existsSync(p)) return [];
  let lista;
  try { lista = JSON.parse(readFileSync(p, "utf-8")).retired; } catch { return []; }
  if (!Array.isArray(lista)) return [];

  const contextRoot = join(projectRoot, ".context");
  const achados = [];
  for (const item of lista) {
    const abs = join(projectRoot, item.path);
    // Mesma contencao do applySync: nada fora de .context/, nada via symlink.
    if (!isWithinDir(abs, contextRoot) || isSymlink(abs) || !existsSync(abs)) continue;
    const h = hashFile(abs);
    // null = classe nunca rastreada por hash (agents). Admitir, nao chutar.
    const pristine = h == null ? null : (registry && registry.has(h) ? true : false);
    achados.push({ path: item.path, since: item.since, reason: item.reason, pristine });
  }
  return achados;
}
```

> **Nota sobre `pristine` para agents.** `distributableFiles()` nunca indexou `agents/**`, então o hash de um agente jamais esteve no registry. Um `false` ali seria mentira ("você editou isto") — por isso o teste exige `null` quando a classe não é rastreável. `hashFile` de um **diretório** (caso do `nxz-go-test`) também retorna `null`, o que produz o mesmo veredito honesto.

- [ ] **Passo 5: Rodar e confirmar GREEN**

Run: `node --test tests/integration/test-provenance-sync.mjs`
Expected: **PASS** nos quatro testes (2 de órfão + 2 de aposentado).

- [ ] **Passo 6: Commit**

```bash
git add scripts/lib/provenance-sync.mjs assets/provenance/retired.json tests/integration/test-provenance-sync.mjs
git commit -m "feat(sync): reporta órfãos por manifesto e aposentados por declaração"
```

---

## Tarefa 11: Sinais verdes e observação manual do namespace

**Agente:** test-writer

**Files:**
- Test: toda a suíte

- [ ] **Passo 1: Rodar os três sinais declarados**

```bash
bash tests/run-unit.sh && bash tests/run-integration.sh && bash tests/run-lint.sh
```
Expected: **exit 0** nos três. Qualquer falha volta para a tarefa correspondente — não seguir adiante.

- [ ] **Passo 2: Conferir que nenhuma skill de framework sobrou em `skills/`**

```bash
ls skills/ | grep -E "odoo|nxz" || echo "OK: nenhuma skill de framework em skills/"
```
Expected: `OK: nenhuma skill de framework em skills/`

- [ ] **Passo 3: Registrar a observação manual do namespace**

Esta verificação **não é um sinal de teste**. Após reiniciar a sessão do Claude Code, conferir que `devflow:odoo-development`, `devflow:frontend-specialist-odoo`, `devflow:odoo-l10n-br`, `devflow:odoo-nxz-overlay`, `devflow:nxz-go-test` e o agent type `devflow:Odoo Specialist` **não aparecem mais** na listagem.

Registrar o resultado como **observação** na fase V, junto da ressalva de que o Claude Code precisa reindexar o plugin. Se a listagem ainda os mostrar, verificar se o plugin instalado é o da branch antes de concluir qualquer coisa.

- [ ] **Passo 4: Commit final se algo mudou**

```bash
git status --short
```
Se houver mudanças pendentes, commitar; caso contrário, seguir para a fase V.
