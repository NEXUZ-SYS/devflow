# ADR System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** adr-implementation | **Scale:** MEDIUM | **Phase:** P->R

**Goal:** Implement a two-layer ADR system (organizational templates + project-specific) integrated with `/devflow prd`, enabling AI guardrails via `.context/docs/adrs/`.

**Architecture:** Templates organizacionais vivem em `.context/templates/adrs/` segmentados por stack. O skill `prd-generation` ganha entrevista de stack + recomendacao de ADRs. Skills `prevc-planning`, `prevc-validation`, `context-awareness` e `context-sync` sao estendidos para ler/validar ADRs.

**Tech Stack:** Markdown + YAML frontmatter, Node.js (node:test), Bash

**Agents:** documentation-writer (templates), architect (skill modifications), test-writer (structural tests)

---

## File Structure

### New Files
```
.context/templates/adrs/
  README.md                              — index of available templates
  principios-codigo/
    solid-python.md                      — SOLID principles for Python
    solid-typescript.md                  — SOLID principles for TypeScript
    solid-go.md                          — SOLID principles for Go
    clean-code-python.md                 — Clean Code for Python
    clean-code-typescript.md             — Clean Code for TypeScript
    clean-code-go.md                     — Clean Code for Go
  qualidade-testes/
    tdd-python.md                        — TDD for Python
    tdd-typescript.md                    — TDD for TypeScript
    tdd-go.md                            — TDD for Go
    code-review.md                       — Code review checklist (universal)
  arquitetura/
    layered-architecture.md              — Layered architecture (universal)
    hexagonal-architecture.md            — Hexagonal/Ports & Adapters (universal)
    microservices-vs-monolith.md         — Decision framework (universal)
  seguranca/
    owasp-top10.md                       — OWASP Top 10 (universal)
    secrets-management.md                — Secrets management (universal)
    least-privilege.md                   — Least privilege (universal)
  infraestrutura/
    iac-terraform.md                     — IaC with Terraform
    iac-cdk.md                           — IaC with AWS CDK
    cicd-github-actions.md               — CI/CD with GitHub Actions
    cicd-gitlab-ci.md                    — CI/CD with GitLab CI
    aws-data-lake.md                     — AWS Data Lake / Lakehouse patterns
templates/adr-repo-scaffold/
  README.md                              — Instructions for team ADR repos
  .github/PULL_REQUEST_TEMPLATE.md       — PR template for new ADRs
tests/validation/test-adr-structural.mjs — Structural tests for ADR templates
```

### Modified Files
```
skills/prd-generation/SKILL.md           — Add stack interview + ADR recommendation steps
skills/prevc-planning/SKILL.md           — Read ADRs in Step 1 context gathering
skills/prevc-validation/SKILL.md         — Add ADR compliance check
skills/context-awareness/SKILL.md        — Include .context/docs/adrs/ in scope
skills/context-sync/SKILL.md             — Sync ADR index on /devflow-sync docs
```

---

## Task 1: Structural Tests for ADR Templates

**Agent:** test-writer
**Tests:** unit (structural validation)

**Files:**
- Create: `tests/validation/test-adr-structural.mjs`

- [ ] **Step 1: Write the failing test file**

```javascript
/**
 * Structural validation tests for ADR templates and system.
 * Validates frontmatter, guardrails section, template index, and file structure.
 * Run: node --test tests/validation/test-adr-structural.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, basename } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const TEMPLATES_DIR = resolve(ROOT, ".context/templates/adrs");
const SCAFFOLD_DIR = resolve(ROOT, "templates/adr-repo-scaffold");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf-8");

// ─── Helper: parse YAML frontmatter ─────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
    if (kv) fields[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return fields;
}

// ─── Helper: recursively find all .md files in a directory ──────

function findMarkdownFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath));
    } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Template Directory Structure ───────────────────────────────

describe("ADR template directory structure", () => {
  it("should have .context/templates/adrs/ directory", () => {
    assert.ok(existsSync(TEMPLATES_DIR), "Missing .context/templates/adrs/");
  });

  it("should have README.md index", () => {
    const readmePath = join(TEMPLATES_DIR, "README.md");
    assert.ok(existsSync(readmePath), "Missing README.md index");
  });

  const requiredCategories = [
    "principios-codigo",
    "qualidade-testes",
    "arquitetura",
    "seguranca",
    "infraestrutura",
  ];

  for (const cat of requiredCategories) {
    it(`should have category directory: ${cat}`, () => {
      const catPath = join(TEMPLATES_DIR, cat);
      assert.ok(existsSync(catPath), `Missing category: ${cat}`);
      assert.ok(statSync(catPath).isDirectory(), `${cat} is not a directory`);
    });
  }
});

// ─── Template Frontmatter Validation ────────────────────────────

describe("ADR template frontmatter", () => {
  const templates = findMarkdownFiles(TEMPLATES_DIR);

  it("should have at least 15 templates", () => {
    assert.ok(templates.length >= 15, `Only ${templates.length} templates found, expected >= 15`);
  });

  for (const templatePath of templates) {
    const relativePath = templatePath.replace(ROOT + "/", "");

    describe(relativePath, () => {
      const content = readFileSync(templatePath, "utf-8");
      const fm = parseFrontmatter(content);

      it("should have YAML frontmatter", () => {
        assert.ok(fm, "Missing or malformed frontmatter");
      });

      it("should have type: adr", () => {
        assert.equal(fm?.type, "adr", `Expected type: adr, got: ${fm?.type}`);
      });

      it("should have required fields", () => {
        const required = ["name", "description", "scope", "stack", "category", "status", "created"];
        for (const field of required) {
          assert.ok(fm?.[field], `Missing required field: ${field}`);
        }
      });

      it("should have scope: organizational", () => {
        assert.equal(fm?.scope, "organizational", `Template should be organizational scope`);
      });

      it("should have valid category", () => {
        const validCategories = [
          "principios-codigo",
          "qualidade-testes",
          "arquitetura",
          "seguranca",
          "infraestrutura",
        ];
        assert.ok(
          validCategories.includes(fm?.category),
          `Invalid category: ${fm?.category}`
        );
      });

      it("should have Guardrails section", () => {
        assert.ok(
          content.includes("## Guardrails"),
          "Missing ## Guardrails section"
        );
      });

      it("should have at least one guardrail rule", () => {
        const guardrailSection = content.split("## Guardrails")[1]?.split("##")[0] || "";
        const rules = guardrailSection.match(/^- (SEMPRE|NUNCA|QUANDO)/gm) || [];
        assert.ok(rules.length >= 1, "Guardrails section must have at least one SEMPRE/NUNCA/QUANDO rule");
      });

      it("should have Enforcement section", () => {
        assert.ok(
          content.includes("## Enforcement"),
          "Missing ## Enforcement section"
        );
      });
    });
  }
});

// ─── README Index Validation ────────────────────────────────────

describe("ADR templates README index", () => {
  it("should list all template files", () => {
    const readme = read(".context/templates/adrs/README.md");
    const templates = findMarkdownFiles(TEMPLATES_DIR);

    for (const templatePath of templates) {
      const fileName = basename(templatePath, ".md");
      assert.ok(
        readme.includes(fileName),
        `README missing reference to template: ${fileName}`
      );
    }
  });
});

// ─── Scaffold Repo Structure ────────────────────────────────────

describe("ADR repo scaffold", () => {
  it("should have templates/adr-repo-scaffold/ directory", () => {
    assert.ok(existsSync(SCAFFOLD_DIR), "Missing templates/adr-repo-scaffold/");
  });

  it("should have README.md", () => {
    assert.ok(existsSync(join(SCAFFOLD_DIR, "README.md")), "Missing scaffold README.md");
  });

  it("should have PR template", () => {
    assert.ok(
      existsSync(join(SCAFFOLD_DIR, ".github/PULL_REQUEST_TEMPLATE.md")),
      "Missing .github/PULL_REQUEST_TEMPLATE.md"
    );
  });
});

// ─── Skill Modifications Validation ─────────────────────────────

describe("Skill ADR integration", () => {
  it("prd-generation should reference ADR interview", () => {
    const content = read("skills/prd-generation/SKILL.md");
    assert.ok(
      content.includes("Entrevista STACK") || content.includes("Stack Interview"),
      "prd-generation missing stack interview step"
    );
    assert.ok(
      content.includes("ADR") || content.includes("adr"),
      "prd-generation missing ADR reference"
    );
  });

  it("prevc-planning should reference ADR reading", () => {
    const content = read("skills/prevc-planning/SKILL.md");
    assert.ok(
      content.includes(".context/docs/adrs") || content.includes("adrs/README.md"),
      "prevc-planning missing ADR context gathering"
    );
  });

  it("prevc-validation should reference ADR compliance", () => {
    const content = read("skills/prevc-validation/SKILL.md");
    assert.ok(
      content.includes("ADR") || content.includes("guardrail"),
      "prevc-validation missing ADR compliance check"
    );
  });

  it("context-awareness should reference ADR directory", () => {
    const content = read("skills/context-awareness/SKILL.md");
    assert.ok(
      content.includes(".context/docs/adrs") || content.includes("adrs"),
      "context-awareness missing ADR directory reference"
    );
  });

  it("context-sync should reference ADR sync", () => {
    const content = read("skills/context-sync/SKILL.md");
    assert.ok(
      content.includes("adrs") || content.includes("ADR"),
      "context-sync missing ADR sync reference"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/validation/test-adr-structural.mjs`
Expected: FAIL — directories, templates, and skill modifications don't exist yet.

- [ ] **Step 3: Commit test file**

```bash
git add tests/validation/test-adr-structural.mjs
git commit -m "test(adr): add structural validation tests for ADR system"
```

---

## Task 2: ADR Template Structure and README Index

**Agent:** documentation-writer
**Tests:** unit (structural — from Task 1)

**Files:**
- Create: `.context/templates/adrs/README.md`
- Create: `.context/templates/adrs/principios-codigo/` (directory)
- Create: `.context/templates/adrs/qualidade-testes/` (directory)
- Create: `.context/templates/adrs/arquitetura/` (directory)
- Create: `.context/templates/adrs/seguranca/` (directory)
- Create: `.context/templates/adrs/infraestrutura/` (directory)

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p .context/templates/adrs/{principios-codigo,qualidade-testes,arquitetura,seguranca,infraestrutura}
```

- [ ] **Step 2: Write README.md index**

Create `.context/templates/adrs/README.md`:

```markdown
# ADR Templates Organizacionais

Templates de boas praticas segmentados por stack e dominio.
Usados pelo `/devflow prd` para recomendar ADRs ao projeto.

## Como Funcionar

1. Apos gerar o PRD, o DevFlow analisa a stack do projeto
2. Cruza a stack com os templates disponiveis
3. Recomenda ADRs relevantes ao usuario
4. Templates aceitos sao copiados para `.context/docs/adrs/` do projeto

## Templates Disponiveis

| Categoria | Template | Stack | Guardrails |
|-----------|----------|-------|------------|
| Principios de Codigo | solid-python | Python | 8 regras |
| Principios de Codigo | solid-typescript | TypeScript | 8 regras |
| Principios de Codigo | solid-go | Go | 8 regras |
| Principios de Codigo | clean-code-python | Python | 6 regras |
| Principios de Codigo | clean-code-typescript | TypeScript | 6 regras |
| Principios de Codigo | clean-code-go | Go | 6 regras |
| Qualidade & Testes | tdd-python | Python | 5 regras |
| Qualidade & Testes | tdd-typescript | TypeScript | 5 regras |
| Qualidade & Testes | tdd-go | Go | 5 regras |
| Qualidade & Testes | code-review | universal | 4 regras |
| Arquitetura | layered-architecture | universal | 6 regras |
| Arquitetura | hexagonal-architecture | universal | 6 regras |
| Arquitetura | microservices-vs-monolith | universal | 5 regras |
| Seguranca | owasp-top10 | universal | 10 regras |
| Seguranca | secrets-management | universal | 5 regras |
| Seguranca | least-privilege | universal | 5 regras |
| Infraestrutura | iac-terraform | Terraform | 7 regras |
| Infraestrutura | iac-cdk | CDK | 6 regras |
| Infraestrutura | cicd-github-actions | GitHub Actions | 5 regras |
| Infraestrutura | cicd-gitlab-ci | GitLab CI | 5 regras |
| Infraestrutura | aws-data-lake | AWS | 8 regras |

## Fonte

- **Local:** Kit inicial do DevFlow
- **Externo:** Configuravel via entrevista no `/devflow prd` (repositorio git do time)

## Estrutura de um Template

Cada template usa o formato ADR com YAML frontmatter:

- `type: adr` — identifica como ADR
- `scope: organizational` — template organizacional (vs `project` para instanciadas)
- `stack` — linguagem/plataforma alvo
- `category` — categoria do template
- Secoes: Contexto, Decisao, Alternativas, Consequencias, **Guardrails**, **Enforcement**
```

- [ ] **Step 3: Commit**

```bash
git add .context/templates/adrs/
git commit -m "feat(adr): create template directory structure and README index"
```

---

## Task 3: ADR Templates — Principios de Codigo (6 files)

**Agent:** documentation-writer
**Tests:** unit (structural — from Task 1)

**Files:**
- Create: `.context/templates/adrs/principios-codigo/solid-python.md`
- Create: `.context/templates/adrs/principios-codigo/solid-typescript.md`
- Create: `.context/templates/adrs/principios-codigo/solid-go.md`
- Create: `.context/templates/adrs/principios-codigo/clean-code-python.md`
- Create: `.context/templates/adrs/principios-codigo/clean-code-typescript.md`
- Create: `.context/templates/adrs/principios-codigo/clean-code-go.md`

- [ ] **Step 1: Write solid-python.md**

```markdown
---
type: adr
name: solid-python
description: Principios SOLID aplicados a projetos Python — guardrails para classes, modulos e dependencias
scope: organizational
source: local
stack: python
category: principios-codigo
status: Aprovado
created: 2026-04-03
---

# ADR — Principios SOLID para Python

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Python
- **Categoria:** Principios de Codigo

---

## Contexto

Projetos Python tendem a crescer com classes monoliticas, acoplamento direto a implementacoes concretas e funcoes que fazem mais do que deveriam. Sem guardrails, a IA gera codigo funcional mas dificil de manter, testar e evoluir.

## Decisao

Adotar os principios SOLID como guardrails obrigatorios para todo codigo Python orientado a objetos, usando os mecanismos nativos da linguagem (abc, Protocol, dataclasses).

## Alternativas Consideradas

- **Sem padrao formal** — cada desenvolvedor decide; inconsistencia entre modulos
- **Apenas Clean Code** — cobre estilo mas nao arquitetura de classes
- **SOLID completo** — escolhido; cobre tanto design de classes quanto modulos

## Consequencias

- Codigo mais testavel (DIP facilita mocks e stubs)
- Curva de aprendizado para desenvolvedores juniores
- Mais arquivos (SRP gera classes menores e mais numerosas)

## Guardrails

- SEMPRE aplicar Single Responsibility Principle: cada classe/modulo tem uma unica razao para mudar
- SEMPRE usar `abc.ABC` ou `typing.Protocol` para definir interfaces antes de implementacoes concretas
- NUNCA depender diretamente de implementacoes concretas em construtores — usar injecao de dependencia
- SEMPRE preferir composicao sobre heranca; heranca maxima de 2 niveis
- NUNCA adicionar metodos a uma interface existente se isso quebrar implementacoes — criar nova interface (ISP)
- SEMPRE usar `dataclasses` ou `pydantic.BaseModel` para DTOs em vez de dicts soltos
- QUANDO precisar estender comportamento, ENTAO usar Strategy pattern ou decorators em vez de modificar classes existentes (OCP)
- QUANDO uma classe tiver mais de 200 linhas, ENTAO considerar decomposicao (sinal de violacao SRP)

## Enforcement

- [ ] Code review: verificar se novas classes seguem SRP (uma razao para mudar)
- [ ] Code review: construtores recebem abstrações (Protocol/ABC), nao implementacoes
- [ ] Lint rule: `pylint --max-line-length` e `pylint --max-args` como proxy de complexidade
- [ ] Gate PREVC: no Validation phase, checar se interfaces precedem implementacoes no git log

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://docs.python.org/3/library/abc.html |
| Docs externos | https://peps.python.org/pep-0544/ (Protocol) |
| ADRs relacionadas | clean-code-python |

## Evidencias / Anexos

Exemplo de DIP em Python:

```python
from typing import Protocol

class Repository(Protocol):
    def save(self, entity: dict) -> None: ...
    def find_by_id(self, id: str) -> dict | None: ...

class UserService:
    def __init__(self, repo: Repository) -> None:
        self._repo = repo

    def create_user(self, data: dict) -> dict:
        self._repo.save(data)
        return data
```
```

- [ ] **Step 2: Write solid-typescript.md**

```markdown
---
type: adr
name: solid-typescript
description: Principios SOLID aplicados a projetos TypeScript — guardrails para classes, interfaces e modulos
scope: organizational
source: local
stack: typescript
category: principios-codigo
status: Aprovado
created: 2026-04-03
---

# ADR — Principios SOLID para TypeScript

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** TypeScript
- **Categoria:** Principios de Codigo

---

## Contexto

TypeScript oferece sistema de tipos rico mas sem disciplina, projetos acumulam classes god-object, interfaces infladas e dependencias circulares. A IA pode gerar codigo que compila mas viola principios fundamentais de design.

## Decisao

Adotar SOLID como guardrails obrigatorios para TypeScript, usando interfaces nativas, generics, e o sistema de modulos ES.

## Alternativas Consideradas

- **Apenas ESLint rules** — cobre estilo, nao arquitetura
- **Functional-only** — valido para alguns projetos, mas nao universal
- **SOLID com interfaces TS** — escolhido; melhor fit para OOP+FP hibrido do TS

## Consequencias

- Interfaces explicitas facilitam testes e mocks
- Mais boilerplate de interfaces (trade-off aceitavel)
- Generics reduzem duplicacao mantendo type safety

## Guardrails

- SEMPRE definir interfaces antes de classes concretas
- SEMPRE usar injecao de dependencia via construtor — parametros tipados por interface, nao por classe
- NUNCA usar `any` como tipo de parametro ou retorno — usar `unknown` quando o tipo e realmente desconhecido
- SEMPRE aplicar SRP: cada arquivo exporta uma responsabilidade principal
- NUNCA heranca acima de 2 niveis — preferir composicao com interfaces
- SEMPRE usar readonly para propriedades que nao devem ser mutadas apos construcao
- QUANDO uma interface tiver mais de 5 metodos, ENTAO considerar Interface Segregation (dividir)
- QUANDO precisar estender funcionalidade, ENTAO usar generics ou composition em vez de modificar contratos existentes

## Enforcement

- [ ] Lint rule: `@typescript-eslint/no-explicit-any` como error
- [ ] Code review: interfaces definidas antes de implementacoes
- [ ] Code review: construtores recebem interfaces, nao classes concretas
- [ ] Gate PREVC: arquivos com mais de 250 linhas flagados para revisao

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://www.typescriptlang.org/docs/handbook/2/objects.html |
| ADRs relacionadas | clean-code-typescript |

## Evidencias / Anexos

Exemplo de DIP em TypeScript:

```typescript
interface Repository<T> {
  save(entity: T): Promise<void>;
  findById(id: string): Promise<T | null>;
}

class UserService {
  constructor(private readonly repo: Repository<User>) {}

  async createUser(data: CreateUserDto): Promise<User> {
    const user = User.create(data);
    await this.repo.save(user);
    return user;
  }
}
```
```

- [ ] **Step 3: Write solid-go.md**

```markdown
---
type: adr
name: solid-go
description: Principios SOLID aplicados a projetos Go — guardrails para packages, interfaces e composicao
scope: organizational
source: local
stack: go
category: principios-codigo
status: Aprovado
created: 2026-04-03
---

# ADR — Principios SOLID para Go

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Go
- **Categoria:** Principios de Codigo

---

## Contexto

Go usa interfaces implicitas e composicao em vez de heranca. Os principios SOLID se aplicam diferentemente: SRP mapeia para packages, DIP usa interfaces implicitas, e ISP e natural pela convencao de interfaces pequenas.

## Decisao

Adaptar SOLID para Go idiomatico, respeitando as convencoes da linguagem.

## Alternativas Consideradas

- **Go sem padrao formal** — funciona para projetos pequenos, escala mal
- **Clean Architecture rigida** — over-engineering para Go
- **SOLID adaptado a Go** — escolhido; respeita idiomas da linguagem

## Consequencias

- Packages mais coesos e com menos dependencias
- Interfaces naturalmente pequenas (1-3 metodos)
- Testabilidade via interfaces implicitas

## Guardrails

- SEMPRE organizar por dominio/feature, nao por camada tecnica (ex: `user/` nao `models/`, `handlers/`)
- SEMPRE definir interfaces no pacote consumidor, nao no produtor (convencao Go)
- NUNCA criar interfaces com mais de 3 metodos — dividir em interfaces menores
- SEMPRE usar struct embedding para composicao, NUNCA simular heranca
- NUNCA exportar tipos concretos quando uma interface basta — retornar interface, aceitar interface
- SEMPRE tratar errors explicitamente — NUNCA usar `_` para ignorar errors
- QUANDO um package importar mais de 5 packages internos, ENTAO reavaliar dependencias (sinal de acoplamento)
- QUANDO uma funcao tiver mais de 3 parametros, ENTAO usar struct de opcoes

## Enforcement

- [ ] Lint rule: `golangci-lint` com `interfacebloat`, `cyclop`, `gocognit`
- [ ] Code review: interfaces definidas no consumidor
- [ ] Code review: error handling explicito (sem `_ = err`)
- [ ] Gate PREVC: packages com mais de 10 arquivos flagados para decomposicao

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://go.dev/doc/effective_go |
| Docs externos | https://go.dev/wiki/CodeReviewComments |
| ADRs relacionadas | clean-code-go |

## Evidencias / Anexos

Exemplo de interface no consumidor (Go idiomatico):

```go
// No package que CONSOME, nao no que implementa
type UserStore interface {
    Save(ctx context.Context, user User) error
    FindByID(ctx context.Context, id string) (User, error)
}

type UserService struct {
    store UserStore
}

func NewUserService(store UserStore) *UserService {
    return &UserService{store: store}
}
```
```

- [ ] **Step 4: Write clean-code-python.md**

```markdown
---
type: adr
name: clean-code-python
description: Clean Code para Python — guardrails de legibilidade, nomes, funcoes e formatacao
scope: organizational
source: local
stack: python
category: principios-codigo
status: Aprovado
created: 2026-04-03
---

# ADR — Clean Code para Python

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Python
- **Categoria:** Principios de Codigo

---

## Contexto

Codigo legivel reduz bugs, facilita revisao e acelera onboarding. Sem convencoes explicitas, a IA gera codigo funcional mas inconsistente em estilo, nomes e estrutura.

## Decisao

Adotar regras de Clean Code adaptadas para Python, complementando PEP 8 com guardrails de design.

## Alternativas Consideradas

- **Apenas PEP 8** — cobre formatacao, nao design
- **Google Python Style Guide** — bom mas extenso; preferimos regras focadas
- **Clean Code adaptado** — escolhido; PEP 8 + regras de design

## Consequencias

- Codigo mais uniforme entre sessoes e agentes
- Funcoes menores e mais testaveis
- Nomes auto-documentados reduzem necessidade de comentarios

## Guardrails

- SEMPRE usar nomes descritivos que revelam intencao — `get_active_users()` nao `get_data()`
- NUNCA funcoes com mais de 20 linhas — decompor em funcoes menores
- SEMPRE uma funcao faz uma coisa — se precisar de "and" para descrever, dividir
- NUNCA mais de 3 parametros por funcao — usar dataclass ou dict tipado para agrupar
- NUNCA comentarios que repetem o codigo — comentar apenas o "por que", nunca o "o que"
- SEMPRE usar type hints em todas as assinaturas publicas

## Enforcement

- [ ] Lint rule: `ruff` com `max-complexity` e `max-function-length`
- [ ] Code review: nomes revelam intencao (nao abreviacoes ou genericos)
- [ ] Lint rule: `mypy --strict` para type hints
- [ ] Gate PREVC: funcoes > 20 linhas flagadas no Validation

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://peps.python.org/pep-0008/ |
| ADRs relacionadas | solid-python |

## Evidencias / Anexos

Nomes ruins vs bons:

```python
# Ruim
def proc(d, f):
    r = []
    for i in d:
        if f(i):
            r.append(i)
    return r

# Bom
def filter_active_users(users: list[User], is_active: Callable[[User], bool]) -> list[User]:
    return [user for user in users if is_active(user)]
```
```

- [ ] **Step 5: Write clean-code-typescript.md**

```markdown
---
type: adr
name: clean-code-typescript
description: Clean Code para TypeScript — guardrails de legibilidade, tipagem estrita e organizacao
scope: organizational
source: local
stack: typescript
category: principios-codigo
status: Aprovado
created: 2026-04-03
---

# ADR — Clean Code para TypeScript

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** TypeScript
- **Categoria:** Principios de Codigo

---

## Contexto

TypeScript combina flexibilidade de JavaScript com tipos estaticos. Sem disciplina, projetos acumulam `any`, funcoes longas e inconsistencia entre modulos.

## Decisao

Adotar Clean Code com enfase em tipagem estrita e modularidade.

## Alternativas Consideradas

- **Apenas ESLint/Prettier** — formatacao, nao design
- **Airbnb style guide** — focado em JS, nao explora tipos TS
- **Clean Code + strict TS** — escolhido

## Consequencias

- Tipos eliminam categorias inteiras de bugs em runtime
- Funcoes menores e mais previsíveis
- Imports explícitos facilitam tree-shaking

## Guardrails

- SEMPRE usar `strict: true` no tsconfig.json — sem excecoes
- NUNCA usar `any` — usar `unknown` e narrowing quando o tipo e indeterminado
- SEMPRE funcoes com no maximo 20 linhas — decompor se maior
- NUNCA mais de 3 parametros — usar objeto tipado com interface dedicada
- SEMPRE usar `readonly` para dados que nao devem mutar
- NUNCA exportar mutaveis — exportar funcoes puras ou readonly

## Enforcement

- [ ] tsconfig.json: `strict: true`
- [ ] Lint rule: `@typescript-eslint/no-explicit-any` error
- [ ] Lint rule: `max-lines-per-function` com limite 20
- [ ] Code review: sem barrel exports desnecessarios

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| ADRs relacionadas | solid-typescript |

## Evidencias / Anexos

```typescript
// Ruim: parametros soltos, any, mutavel
export let config: any = {};
function process(a: any, b: any, c: any, d: any) { ... }

// Bom: tipado, readonly, agrupado
interface ProcessOptions {
  readonly input: string;
  readonly format: OutputFormat;
  readonly validate: boolean;
}
export function processData(options: ProcessOptions): Result { ... }
```
```

- [ ] **Step 6: Write clean-code-go.md**

```markdown
---
type: adr
name: clean-code-go
description: Clean Code para Go — guardrails de simplicidade, error handling e formatacao idiomatica
scope: organizational
source: local
stack: go
category: principios-codigo
status: Aprovado
created: 2026-04-03
---

# ADR — Clean Code para Go

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Go
- **Categoria:** Principios de Codigo

---

## Contexto

Go preza simplicidade e explicitness. Codigo Go idiomatico e diferente de outras linguagens — error handling explicito, sem excecoes, sem generics excessivos.

## Decisao

Clean Code adaptado ao Go idiomatico, seguindo Effective Go e Code Review Comments.

## Alternativas Consideradas

- **Uber Go Style Guide** — bom mas muito opinado para uso universal
- **Effective Go apenas** — referencia, nao guardrails
- **Clean Code adaptado a Go** — escolhido

## Consequencias

- Codigo consistente com o ecossistema Go
- Error handling explicito previne falhas silenciosas
- gofmt elimina debates de formatacao

## Guardrails

- SEMPRE usar `gofmt` e `goimports` — sem excecoes de formatacao
- NUNCA ignorar errors com `_` — tratar ou propagar com `fmt.Errorf("context: %w", err)`
- SEMPRE funcoes com no maximo 20 linhas — decompor se maior
- NUNCA usar `panic` para erros esperados — reservar para invariantes violadas
- SEMPRE nomear retornos apenas quando clarifica (nao por padrao)
- NUNCA init() para logica de negocio — usar construtores explicitos

## Enforcement

- [ ] Lint rule: `golangci-lint` com `errcheck`, `govet`, `staticcheck`
- [ ] CI check: `gofmt -d` sem output (tudo formatado)
- [ ] Code review: errors propagados com contexto (`%w`)
- [ ] Gate PREVC: funcoes > 20 linhas flagadas

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://go.dev/doc/effective_go |
| ADRs relacionadas | solid-go |

## Evidencias / Anexos

```go
// Ruim: error ignorado
data, _ := json.Marshal(user)

// Bom: error propagado com contexto
data, err := json.Marshal(user)
if err != nil {
    return fmt.Errorf("marshalling user %s: %w", user.ID, err)
}
```
```

- [ ] **Step 7: Run tests to check progress**

Run: `node --test tests/validation/test-adr-structural.mjs`
Expected: Template frontmatter tests should pass for these 6 files. Directory tests pass. README index test may still fail until all templates are listed.

- [ ] **Step 8: Commit**

```bash
git add .context/templates/adrs/principios-codigo/
git commit -m "feat(adr): add code principles templates (SOLID + Clean Code for Python, TypeScript, Go)"
```

---

## Task 4: ADR Templates — Qualidade & Testes (4 files)

**Agent:** documentation-writer
**Tests:** unit (structural — from Task 1)

**Files:**
- Create: `.context/templates/adrs/qualidade-testes/tdd-python.md`
- Create: `.context/templates/adrs/qualidade-testes/tdd-typescript.md`
- Create: `.context/templates/adrs/qualidade-testes/tdd-go.md`
- Create: `.context/templates/adrs/qualidade-testes/code-review.md`

- [ ] **Step 1: Write tdd-python.md**

```markdown
---
type: adr
name: tdd-python
description: TDD obrigatorio para Python — RED-GREEN-REFACTOR com pytest, sem mocks de banco
scope: organizational
source: local
stack: python
category: qualidade-testes
status: Aprovado
created: 2026-04-03
---

# ADR — TDD para Python

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Python
- **Categoria:** Qualidade & Testes

---

## Contexto

Testes escritos apos implementacao tendem a cobrir apenas happy path. TDD garante que cada funcionalidade e testavel por design e que bugs sao detectados antes de commitar.

## Decisao

TDD obrigatorio: RED-GREEN-REFACTOR para toda funcionalidade nova, usando pytest como framework.

## Alternativas Consideradas

- **Testes pos-implementacao** — cobertura superficial, testes adaptados ao codigo
- **BDD com behave** — overhead de linguagem natural sem beneficio proporcional
- **TDD com pytest** — escolhido; ciclo rapido, fixtures poderosas

## Consequencias

- Todo codigo nasce testavel
- Commits de teste precedem commits de implementacao (verificavel no git log)
- Ciclo mais disciplinado, menos debugging

## Guardrails

- SEMPRE escrever o teste antes da implementacao — commit do teste deve preceder commit do codigo
- NUNCA usar mocks para banco de dados — usar banco real (SQLite in-memory ou testcontainers)
- SEMPRE nomear testes descritivamente: `test_should_reject_negative_price` nao `test_price`
- NUNCA testes que verificam apenas `assert result is not None` — verificar valores concretos
- QUANDO um bug for reportado, ENTAO escrever teste que reproduz o bug ANTES de corrigir

## Enforcement

- [ ] Git log: commits de teste (`test:`) devem preceder commits de feat (`feat:`)
- [ ] CI check: coverage minimo de 80% para novos modulos
- [ ] Code review: testes verificam comportamento, nao implementacao
- [ ] Gate PREVC: TDD ordering verificado no Validation phase

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://docs.pytest.org/ |
| ADRs relacionadas | solid-python, clean-code-python |

## Evidencias / Anexos

Ciclo RED-GREEN-REFACTOR:

```python
# RED: teste falha
def test_should_calculate_discount_for_premium_users():
    user = User(tier="premium")
    result = calculate_discount(user, amount=100.0)
    assert result == 15.0  # 15% discount

# GREEN: implementacao minima
def calculate_discount(user: User, amount: float) -> float:
    if user.tier == "premium":
        return amount * 0.15
    return 0.0

# REFACTOR: melhorar sem mudar comportamento
DISCOUNT_RATES = {"premium": 0.15, "standard": 0.05}

def calculate_discount(user: User, amount: float) -> float:
    rate = DISCOUNT_RATES.get(user.tier, 0.0)
    return amount * rate
```
```

- [ ] **Step 2: Write tdd-typescript.md**

```markdown
---
type: adr
name: tdd-typescript
description: TDD obrigatorio para TypeScript — RED-GREEN-REFACTOR com vitest/jest, sem mocks de banco
scope: organizational
source: local
stack: typescript
category: qualidade-testes
status: Aprovado
created: 2026-04-03
---

# ADR — TDD para TypeScript

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** TypeScript
- **Categoria:** Qualidade & Testes

---

## Contexto

Mesma motivacao do TDD para Python: testes pos-implementacao sao superficiais. TypeScript com tipos fortes + TDD cria uma rede de seguranca dupla.

## Decisao

TDD obrigatorio com vitest (preferencial) ou jest, integracao real com banco.

## Alternativas Consideradas

- **Jest apenas** — maduro mas lento para projetos grandes
- **Vitest** — rapido, compativel com Jest API, ESM nativo
- **Vitest preferencial, Jest aceitavel** — escolhido

## Consequencias

- Testes rapidos (vitest hot reload)
- TypeScript garante tipos, TDD garante comportamento
- Banco real via testcontainers ou SQLite

## Guardrails

- SEMPRE escrever teste antes da implementacao — RED-GREEN-REFACTOR
- NUNCA usar mocks para banco de dados — usar banco real (testcontainers, SQLite)
- SEMPRE usar `describe`/`it` com nomes descritivos em ingles
- NUNCA testes com `expect(result).toBeTruthy()` como unica asserção — verificar valores
- QUANDO testar funcoes async, ENTAO sempre usar `await` e testar rejeicoes explicitamente

## Enforcement

- [ ] Git log: commits test: precedem feat:
- [ ] CI check: coverage minimo 80%
- [ ] Lint rule: `vitest/expect-expect` para garantir assercoes
- [ ] Gate PREVC: TDD ordering verificado

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://vitest.dev/ |
| ADRs relacionadas | solid-typescript, clean-code-typescript |

## Evidencias / Anexos

```typescript
// RED
describe("UserService", () => {
  it("should reject duplicate email", async () => {
    const repo = new InMemoryUserRepo();
    await repo.save({ email: "a@b.com", name: "Alice" });
    const service = new UserService(repo);

    await expect(
      service.createUser({ email: "a@b.com", name: "Bob" })
    ).rejects.toThrow("Email already exists");
  });
});
```
```

- [ ] **Step 3: Write tdd-go.md**

```markdown
---
type: adr
name: tdd-go
description: TDD obrigatorio para Go — RED-GREEN-REFACTOR com testing nativo e table-driven tests
scope: organizational
source: local
stack: go
category: qualidade-testes
status: Aprovado
created: 2026-04-03
---

# ADR — TDD para Go

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Go
- **Categoria:** Qualidade & Testes

---

## Contexto

Go tem framework de testes nativo (`testing`) e convencao forte de table-driven tests. TDD em Go e natural: arquivos `_test.go` no mesmo package.

## Decisao

TDD obrigatorio com `testing` nativo e table-driven tests como padrao.

## Alternativas Consideradas

- **testify** — assertions mais ricas mas dependency extra
- **testing nativo** — zero deps, padrao da comunidade
- **testing nativo + testify quando necessario** — escolhido

## Consequencias

- Zero dependencias para testes basicos
- Table-driven tests cobrem multiplos cenarios com pouco codigo
- `go test -race` detecta data races automaticamente

## Guardrails

- SEMPRE escrever `_test.go` antes do arquivo de implementacao
- NUNCA usar mocks para banco — usar banco real ou interfaces com implementacao in-memory
- SEMPRE usar table-driven tests para funcoes com multiplos cenarios
- NUNCA ignorar `-race` flag — executar `go test -race ./...` no CI
- QUANDO testar concorrencia, ENTAO usar `t.Parallel()` e `-race`

## Enforcement

- [ ] CI check: `go test -race -cover ./...`
- [ ] Git log: `_test.go` commitado antes do `.go` correspondente
- [ ] Code review: table-driven para 3+ cenarios
- [ ] Gate PREVC: coverage minimo 80%

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://go.dev/doc/tutorial/add-a-test |
| ADRs relacionadas | solid-go, clean-code-go |

## Evidencias / Anexos

```go
func TestCalculateDiscount(t *testing.T) {
    tests := []struct {
        name     string
        tier     string
        amount   float64
        expected float64
    }{
        {"premium user", "premium", 100.0, 15.0},
        {"standard user", "standard", 100.0, 5.0},
        {"unknown tier", "unknown", 100.0, 0.0},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := CalculateDiscount(tt.tier, tt.amount)
            if got != tt.expected {
                t.Errorf("got %v, want %v", got, tt.expected)
            }
        })
    }
}
```
```

- [ ] **Step 4: Write code-review.md**

```markdown
---
type: adr
name: code-review
description: Checklist de code review universal — guardrails para revisao de codigo em qualquer stack
scope: organizational
source: local
stack: universal
category: qualidade-testes
status: Aprovado
created: 2026-04-03
---

# ADR — Code Review

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Qualidade & Testes

---

## Contexto

Code review sem checklist e inconsistente — depende do humor e experiencia do revisor. Guardrails de revisao garantem baseline de qualidade.

## Decisao

Checklist obrigatorio de code review aplicavel a qualquer stack.

## Alternativas Consideradas

- **Sem checklist** — revisao ad hoc, inconsistente
- **Checklist por linguagem** — muito granular para manter
- **Checklist universal** — escolhido; cobre principios, nao sintaxe

## Consequencias

- Revisoes mais rapidas e consistentes
- Juniors aprendem o que verificar
- IA aplica checklist automaticamente na fase Review

## Guardrails

- SEMPRE verificar se testes existem E passam antes de aprovar
- SEMPRE verificar se nomes sao descritivos (funcoes, variaveis, arquivos)
- NUNCA aprovar codigo com TODO/FIXME sem issue associada
- NUNCA aprovar secrets hardcoded (API keys, passwords, tokens)

## Enforcement

- [ ] Gate PREVC: Review phase usa este checklist
- [ ] CI check: scan para TODO/FIXME sem issue link
- [ ] CI check: scan para patterns de secrets (regex)

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| ADRs relacionadas | tdd-python, tdd-typescript, tdd-go |

## Evidencias / Anexos

Checklist resumido para PR review:

1. Testes existem e passam?
2. Nomes revelam intencao?
3. Funcoes sao curtas (< 20 linhas)?
4. Sem secrets hardcoded?
5. Sem TODO/FIXME orfaos?
6. Segue padrao arquitetural do projeto?
```
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/validation/test-adr-structural.mjs`
Expected: 10 template files pass frontmatter checks. Directory tests pass.

- [ ] **Step 6: Commit**

```bash
git add .context/templates/adrs/qualidade-testes/
git commit -m "feat(adr): add quality and testing templates (TDD Python/TS/Go + code review)"
```

---

## Task 5: ADR Templates — Arquitetura (3 files)

**Agent:** documentation-writer
**Tests:** unit (structural — from Task 1)

**Files:**
- Create: `.context/templates/adrs/arquitetura/layered-architecture.md`
- Create: `.context/templates/adrs/arquitetura/hexagonal-architecture.md`
- Create: `.context/templates/adrs/arquitetura/microservices-vs-monolith.md`

- [ ] **Step 1: Write layered-architecture.md**

```markdown
---
type: adr
name: layered-architecture
description: Arquitetura em camadas — Controller-Service-Repository com regras de dependencia
scope: organizational
source: local
stack: universal
category: arquitetura
status: Aprovado
created: 2026-04-03
---

# ADR — Arquitetura em Camadas (Layered)

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Arquitetura

---

## Contexto

Sem separacao de camadas, logica de negocio se mistura com acesso a dados e apresentacao. Mudancas em uma area quebram outras. A IA tende a colocar tudo junto quando nao ha guia explicito.

## Decisao

Adotar arquitetura Controller-Service-Repository como padrao para aplicacoes backend.

## Alternativas Consideradas

- **Sem padrao** — rapido no inicio, caos depois
- **Hexagonal** — mais flexivel mas mais complexo para projetos simples
- **Layered** — escolhido; simples, bem compreendido, adequado para maioria dos projetos

## Consequencias

- Separacao clara de responsabilidades
- Camadas testaveis independentemente
- Trade-off: mais arquivos e boilerplate

## Guardrails

- SEMPRE separar em 3 camadas: Controller (entrada) -> Service (logica) -> Repository (dados)
- NUNCA a camada Controller deve acessar Repository diretamente — sempre via Service
- NUNCA a camada Service deve conhecer detalhes de HTTP (request, response, headers)
- SEMPRE a camada Repository retorna entidades de dominio, nao rows/documents crus
- NUNCA logica de negocio no Controller — delegar ao Service
- QUANDO precisar de validacao, ENTAO validar no Service (regras de negocio) e no Controller (formato de entrada)

## Enforcement

- [ ] Code review: Controllers nao importam Repositories
- [ ] Code review: Services nao importam frameworks HTTP
- [ ] Lint rule: dependencia de camadas (se disponivel na stack)
- [ ] Gate PREVC: verificar imports entre camadas

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| ADRs relacionadas | hexagonal-architecture |

## Evidencias / Anexos

```
Controller Layer          Service Layer           Repository Layer
  ┌─────────┐             ┌─────────┐             ┌─────────┐
  │ Parse   │──Request──>│ Validate│──Entity───>│ Query   │
  │ HTTP    │             │ Execute │             │ Persist │
  │ Return  │<──Response──│ Compose │<──Entity────│ Map     │
  └─────────┘             └─────────┘             └─────────┘
```
```

- [ ] **Step 2: Write hexagonal-architecture.md**

```markdown
---
type: adr
name: hexagonal-architecture
description: Arquitetura Hexagonal (Ports & Adapters) — dominio isolado de infraestrutura
scope: organizational
source: local
stack: universal
category: arquitetura
status: Aprovado
created: 2026-04-03
---

# ADR — Arquitetura Hexagonal (Ports & Adapters)

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Arquitetura

---

## Contexto

Quando a logica de negocio depende diretamente de frameworks, bancos ou APIs externas, trocar qualquer um desses requer reescrever o core. Hexagonal isola o dominio.

## Decisao

Para projetos com dominio rico ou multiplas integracoes, usar Ports & Adapters.

## Alternativas Consideradas

- **Layered** — mais simples mas permite vazamento de infra no dominio
- **Clean Architecture (Uncle Bob)** — similar mas com mais camadas
- **Hexagonal** — escolhido; balance entre isolamento e simplicidade

## Consequencias

- Dominio 100% testavel sem infraestrutura
- Adapters intercambiaveis (trocar Postgres por DynamoDB sem mudar dominio)
- Mais interfaces e mais indirection

## Guardrails

- SEMPRE separar em: Domain (core), Ports (interfaces), Adapters (implementacoes)
- NUNCA o Domain deve importar packages de infraestrutura (ORM, HTTP, SDK)
- SEMPRE definir Ports como interfaces no Domain — Adapters implementam
- NUNCA Adapters devem conter logica de negocio — apenas traducao/mapeamento
- QUANDO criar um novo adapter, ENTAO implementar a Port correspondente e testar contra a mesma suite
- SEMPRE testar o Domain com Ports fake/in-memory antes de testar com Adapters reais

## Enforcement

- [ ] Code review: Domain package nao importa infra
- [ ] Lint rule: dependencia unidirecional (domain <- ports <- adapters)
- [ ] Gate PREVC: Domain testavel com 100% in-memory

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| ADRs relacionadas | layered-architecture |

## Evidencias / Anexos

```
          ┌──────── Adapters ────────┐
          │                          │
     HTTP ─┤    ┌──── Ports ────┐    ├─ PostgreSQL
          │    │               │    │
  GraphQL ─┤    │    Domain    │    ├─ Redis
          │    │   (pure biz   │    │
     gRPC ─┤    │    logic)    │    ├─ S3
          │    │               │    │
      CLI ─┤    └──────────────┘    ├─ SQS
          │                          │
          └──────────────────────────┘
```
```

- [ ] **Step 3: Write microservices-vs-monolith.md**

```markdown
---
type: adr
name: microservices-vs-monolith
description: Framework de decisao Microservices vs Monolith — criterios objetivos para escolha
scope: organizational
source: local
stack: universal
category: arquitetura
status: Aprovado
created: 2026-04-03
---

# ADR — Microservices vs Monolith

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Arquitetura

---

## Contexto

A decisao entre microservices e monolith impacta toda a infraestrutura, deployment, e complexidade operacional. Sem criterios objetivos, a IA pode sugerir microservices para um MVP ou monolith para um sistema distribuido.

## Decisao

Framework de decisao baseado em criterios objetivos, nao em hype.

## Alternativas Consideradas

- **Sempre microservices** — over-engineering para projetos pequenos
- **Sempre monolith** — limita escala organizacional
- **Framework de decisao** — escolhido; baseado em contexto

## Consequencias

- Decisoes justificadas por criterios, nao por preferencia
- IA recomenda arquitetura adequada ao contexto
- Evita premature distribution

## Guardrails

- NUNCA recomendar microservices para equipes com menos de 3 desenvolvedores
- NUNCA recomendar microservices sem infraestrutura de observabilidade (logs, traces, metrics)
- SEMPRE comecar com monolith modular (bounded contexts internos) — migrar para microservices quando necessario
- QUANDO o sistema precisar escalar componentes independentemente, ENTAO considerar extrair microservice
- QUANDO dois times precisarem deployer independentemente, ENTAO considerar separar

## Enforcement

- [ ] Gate PREVC: decisao de arquitetura documentada em ADR de projeto
- [ ] Code review: bounded contexts respeitados (sem imports cruzados)

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| ADRs relacionadas | layered-architecture, hexagonal-architecture |

## Evidencias / Anexos

Criterios de decisao:

| Criterio | Monolith | Microservices |
|----------|----------|---------------|
| Equipe | < 10 devs | > 10 devs, multiplos times |
| Dominio | Bem definido | Bounded contexts claros |
| Deploy | Release unificada | Deploy independente necessario |
| Escala | Uniforme | Componentes com carga diferente |
| Infra | Simples | Kubernetes, service mesh, observability |
```
```

- [ ] **Step 4: Commit**

```bash
git add .context/templates/adrs/arquitetura/
git commit -m "feat(adr): add architecture templates (layered, hexagonal, microservices-vs-monolith)"
```

---

## Task 6: ADR Templates — Seguranca (3 files)

**Agent:** documentation-writer
**Tests:** unit (structural — from Task 1)

**Files:**
- Create: `.context/templates/adrs/seguranca/owasp-top10.md`
- Create: `.context/templates/adrs/seguranca/secrets-management.md`
- Create: `.context/templates/adrs/seguranca/least-privilege.md`

- [ ] **Step 1: Write owasp-top10.md**

```markdown
---
type: adr
name: owasp-top10
description: OWASP Top 10 como baseline de seguranca — guardrails contra vulnerabilidades mais comuns
scope: organizational
source: local
stack: universal
category: seguranca
status: Aprovado
created: 2026-04-03
---

# ADR — OWASP Top 10

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Seguranca

---

## Contexto

A maioria das vulnerabilidades em producao pertence ao OWASP Top 10. Sem guardrails explicitos, a IA pode gerar codigo com SQL injection, XSS, ou autenticacao fraca.

## Decisao

OWASP Top 10 como baseline obrigatorio de seguranca para todo codigo que aceita input externo.

## Alternativas Consideradas

- **Security review manual** — inconsistente, depende do revisor
- **SAST tools apenas** — detectam patterns, nao logica
- **OWASP Top 10 + tools** — escolhido; guardrails humanos + automacao

## Consequencias

- Baseline de seguranca universal
- IA nunca gera patterns vulneraveis conhecidos
- Requer conhecimento basico de seguranca

## Guardrails

- NUNCA concatenar input do usuario em queries SQL — SEMPRE usar parametrized queries / prepared statements
- NUNCA renderizar input do usuario sem sanitizacao — SEMPRE escapar HTML/JS (XSS)
- NUNCA armazenar senhas em plain text — SEMPRE usar bcrypt/argon2 com salt
- NUNCA expor stack traces ou mensagens de erro internas ao usuario — retornar mensagens genericas
- NUNCA desabilitar CSRF protection em formularios web
- SEMPRE validar e sanitizar TODA entrada do usuario no boundary do sistema
- SEMPRE usar HTTPS para toda comunicacao — NUNCA HTTP em producao
- QUANDO implementar autenticacao, ENTAO usar bibliotecas maduras (nao implementar crypto do zero)
- QUANDO retornar dados ao usuario, ENTAO filtrar campos sensiveis (password, tokens, PII)
- NUNCA logar dados sensiveis (passwords, tokens, PII) — mascarar antes de logar

## Enforcement

- [ ] SAST: scan automatico no CI (semgrep, snyk, ou equivalente)
- [ ] Code review: queries parametrizadas, sem concatenacao
- [ ] Code review: outputs sanitizados
- [ ] Gate PREVC: security-auditor agent valida no Validation phase
- [ ] Dependency check: `npm audit` / `pip audit` / `govulncheck` no CI

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://owasp.org/www-project-top-ten/ |
| ADRs relacionadas | secrets-management, least-privilege |

## Evidencias / Anexos

Patterns vulneraveis vs seguros:

```python
# VULNERAVEL: SQL injection
cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")

# SEGURO: parametrized query
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```
```

- [ ] **Step 2: Write secrets-management.md**

```markdown
---
type: adr
name: secrets-management
description: Gestao de secrets — NUNCA hardcode, vault/env-vars, rotacao
scope: organizational
source: local
stack: universal
category: seguranca
status: Aprovado
created: 2026-04-03
---

# ADR — Secrets Management

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Seguranca

---

## Contexto

Secrets (API keys, passwords, tokens) hardcoded em codigo sao a causa #1 de leaks em repositorios publicos. A IA pode gerar exemplos com secrets reais se nao tiver guardrails.

## Decisao

Zero secrets em codigo — sempre via environment variables ou secret managers.

## Alternativas Consideradas

- **Arquivo .env commitado** — facil de vazar
- **Secret manager apenas** — complexo para projetos pequenos
- **Env vars + secret manager** — escolhido; progressivo

## Consequencias

- Zero risco de leak via git
- Requer setup de env vars por ambiente
- Rotacao de secrets sem redeploy

## Guardrails

- NUNCA commitar secrets em arquivos (codigo, config, .env) — SEMPRE via environment variables
- SEMPRE ter `.env` no `.gitignore` — sem excecoes
- NUNCA logar valores de secrets — logar apenas "secret loaded: true/false"
- SEMPRE usar secret manager em producao (AWS Secrets Manager, Vault, GCP Secret Manager)
- QUANDO precisar de secrets em CI/CD, ENTAO usar secrets nativo da plataforma (GitHub Secrets, GitLab CI Variables)

## Enforcement

- [ ] Pre-commit hook: scan para patterns de secrets (detect-secrets, gitleaks)
- [ ] CI check: gitleaks no pipeline
- [ ] Code review: sem strings que parecem API keys / tokens
- [ ] .gitignore: `.env*` presente

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| ADRs relacionadas | owasp-top10, least-privilege |

## Evidencias / Anexos

```python
# ERRADO: secret no codigo
API_KEY = "sk-1234567890abcdef"

# CERTO: environment variable
import os
API_KEY = os.environ["API_KEY"]  # falha se nao configurada (fail-fast)
```
```

- [ ] **Step 3: Write least-privilege.md**

```markdown
---
type: adr
name: least-privilege
description: Principio do menor privilegio — IAM minimo, acesso restrito, zero trust
scope: organizational
source: local
stack: universal
category: seguranca
status: Aprovado
created: 2026-04-03
---

# ADR — Principio do Menor Privilegio

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Seguranca

---

## Contexto

Permissoes excessivas amplificam o impacto de qualquer vulnerabilidade. Um servico com permissao de admin no banco pode deletar tudo se comprometido. A IA tende a usar wildcards e full-access por conveniencia.

## Decisao

Principio do menor privilegio obrigatorio para IAM, banco, APIs e file system.

## Alternativas Consideradas

- **Admin para tudo** — conveniente, perigoso
- **Role-based sem auditoria** — melhor, mas sem visibilidade
- **Least privilege + auditoria** — escolhido

## Consequencias

- Blast radius minimizado
- Mais trabalho de configuracao inicial
- Auditoria possibilita resposta a incidentes

## Guardrails

- NUNCA usar wildcards em IAM policies (`*` em actions ou resources) — especificar exatamente
- SEMPRE criar roles/users com permissoes minimas para a tarefa
- NUNCA compartilhar credenciais entre servicos — cada servico tem sua propria identidade
- SEMPRE usar roles (IAM roles, service accounts) em vez de access keys quando possivel
- QUANDO criar permissao de banco, ENTAO dar apenas SELECT/INSERT/UPDATE necessarios — NUNCA GRANT ALL

## Enforcement

- [ ] IaC review: nenhum `*` em IAM actions/resources
- [ ] Code review: cada servico tem credencial propria
- [ ] Audit: revisao trimestral de permissoes
- [ ] Gate PREVC: security-auditor verifica IAM policies

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| ADRs relacionadas | owasp-top10, secrets-management |

## Evidencias / Anexos

```json
// ERRADO: wildcard
{
  "Effect": "Allow",
  "Action": "s3:*",
  "Resource": "*"
}

// CERTO: minimo necessario
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::my-bucket/data/*"
}
```
```

- [ ] **Step 4: Commit**

```bash
git add .context/templates/adrs/seguranca/
git commit -m "feat(adr): add security templates (OWASP Top 10, secrets management, least privilege)"
```

---

## Task 7: ADR Templates — Infraestrutura (5 files)

**Agent:** documentation-writer
**Tests:** unit (structural — from Task 1)

**Files:**
- Create: `.context/templates/adrs/infraestrutura/iac-terraform.md`
- Create: `.context/templates/adrs/infraestrutura/iac-cdk.md`
- Create: `.context/templates/adrs/infraestrutura/cicd-github-actions.md`
- Create: `.context/templates/adrs/infraestrutura/cicd-gitlab-ci.md`
- Create: `.context/templates/adrs/infraestrutura/aws-data-lake.md`

- [ ] **Step 1: Write iac-terraform.md**

```markdown
---
type: adr
name: iac-terraform
description: Infrastructure as Code com Terraform — modules, state remoto, plan antes de apply
scope: organizational
source: local
stack: terraform
category: infraestrutura
status: Aprovado
created: 2026-04-03
---

# ADR — IaC com Terraform

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Terraform
- **Categoria:** Infraestrutura

---

## Contexto

Infraestrutura criada manualmente via console e irreproducivel, nao auditavel e propensa a drift. IaC com Terraform garante reproducibilidade e versionamento.

## Decisao

Terraform como ferramenta padrao de IaC. Toda infraestrutura deve ser definida em codigo.

## Alternativas Consideradas

- **Console manual** — rapido, irreproducivel
- **CloudFormation** — lock-in AWS
- **CDK** — melhor DX, mais complexo
- **Terraform** — escolhido; multi-cloud, ecossistema maduro

## Consequencias

- Infraestrutura versionada e auditavel
- Mudancas revisadas via PR antes de apply
- Requer aprendizado de HCL

## Guardrails

- NUNCA criar recursos via console ou CLI ad-hoc — SEMPRE via Terraform
- SEMPRE usar remote state (S3 + DynamoDB lock para AWS)
- SEMPRE executar `terraform plan` e revisar antes de `terraform apply`
- NUNCA usar `terraform apply -auto-approve` em producao
- SEMPRE organizar em modules reutilizaveis — nao monolitos de 1000+ linhas
- SEMPRE usar variables e outputs — NUNCA hardcode de valores
- QUANDO importar recurso existente, ENTAO usar `terraform import` e documentar no commit

## Enforcement

- [ ] CI: `terraform plan` automatico em PRs
- [ ] CI: `terraform validate` + `tflint` em todo push
- [ ] Code review: sem hardcode de IDs, ARNs, ou IPs
- [ ] Gate PREVC: plan review obrigatorio antes de apply

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://developer.hashicorp.com/terraform/docs |
| ADRs relacionadas | least-privilege, aws-data-lake |

## Evidencias / Anexos

```hcl
# Module reutilizavel
module "s3_bucket" {
  source = "./modules/s3"

  bucket_name = var.data_lake_bucket
  versioning  = true
  encryption  = "AES256"

  tags = var.common_tags
}
```
```

- [ ] **Step 2: Write iac-cdk.md**

```markdown
---
type: adr
name: iac-cdk
description: Infrastructure as Code com AWS CDK — Constructs L2+, tipagem forte, sem CloudFormation raw
scope: organizational
source: local
stack: cdk
category: infraestrutura
status: Aprovado
created: 2026-04-03
---

# ADR — IaC com AWS CDK

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** CDK
- **Categoria:** Infraestrutura

---

## Contexto

CDK permite definir infraestrutura em linguagens familiares (TypeScript, Python) com tipagem forte e abstrações de alto nivel.

## Decisao

AWS CDK como alternativa a Terraform para times que preferem TypeScript/Python para IaC.

## Alternativas Consideradas

- **Terraform** — multi-cloud, HCL separado
- **CloudFormation YAML** — verbose, sem abstrações
- **CDK** — escolhido quando time ja usa TS/Python e projeto e AWS-only

## Consequencias

- IaC na mesma linguagem do app
- Abstrações L2 reduzem boilerplate
- Lock-in AWS

## Guardrails

- SEMPRE usar Constructs L2 ou L3 — NUNCA CfnResource (L1) diretamente exceto quando L2 nao existe
- SEMPRE separar stacks por dominio (NetworkStack, DataStack, ComputeStack)
- NUNCA hardcode de account IDs ou regions — usar `cdk.Aws.ACCOUNT_ID` e `cdk.Aws.REGION`
- SEMPRE usar `cdk diff` antes de `cdk deploy`
- SEMPRE habilitar `termination_protection` em stacks de producao
- NUNCA deploy sem CI — SEMPRE via pipeline CDK Pipelines

## Enforcement

- [ ] CI: `cdk diff` automatico em PRs
- [ ] CI: `cdk synth` valida template sem deploy
- [ ] Code review: sem L1 constructs desnecessarios
- [ ] Code review: sem hardcode de account/region

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://docs.aws.amazon.com/cdk/v2/guide/ |
| ADRs relacionadas | least-privilege |

## Evidencias / Anexos

```typescript
// L2 construct (preferido)
const bucket = new s3.Bucket(this, "DataLake", {
  versioned: true,
  encryption: s3.BucketEncryption.S3_MANAGED,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

// L1 construct (evitar)
const cfnBucket = new s3.CfnBucket(this, "DataLake", { ... });
```
```

- [ ] **Step 3: Write cicd-github-actions.md**

```markdown
---
type: adr
name: cicd-github-actions
description: CI/CD com GitHub Actions — reusable workflows, secrets via OIDC, caching
scope: organizational
source: local
stack: github-actions
category: infraestrutura
status: Aprovado
created: 2026-04-03
---

# ADR — CI/CD com GitHub Actions

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** GitHub Actions
- **Categoria:** Infraestrutura

---

## Contexto

CI/CD integrado ao GitHub simplifica o pipeline. Sem padrao, cada repo tem workflow diferente.

## Decisao

GitHub Actions como CI/CD padrao para repositorios no GitHub.

## Alternativas Consideradas

- **Jenkins** — complexo de manter, self-hosted
- **GitLab CI** — bom para GitLab, nao para GitHub
- **GitHub Actions** — escolhido; nativo, reusable workflows

## Consequencias

- Pipeline como codigo no repo
- Reusable workflows reduzem duplicacao
- Custo por minuto de execucao

## Guardrails

- SEMPRE usar reusable workflows (`.github/workflows/`) para steps comuns (test, build, deploy)
- NUNCA usar secrets em plain text nos workflows — SEMPRE via `secrets.` ou OIDC federation
- SEMPRE usar cache para dependencias (`actions/cache` ou cache nativo do setup-*)
- NUNCA `push` trigger para branches de producao sem pull_request gate
- SEMPRE pinnar actions por SHA, nao por tag (`uses: actions/checkout@abc123` nao `@v4`)

## Enforcement

- [ ] Code review: workflows usam reusable workflows quando possivel
- [ ] Code review: secrets via OIDC, nao access keys
- [ ] Audit: actions pinnadas por SHA
- [ ] Gate PREVC: pipeline funcional antes de merge

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://docs.github.com/en/actions |
| ADRs relacionadas | secrets-management |

## Evidencias / Anexos

```yaml
# Reusable workflow
name: CI
on: [push, pull_request]
jobs:
  test:
    uses: ./.github/workflows/reusable-test.yml
    secrets: inherit
```
```

- [ ] **Step 4: Write cicd-gitlab-ci.md**

```markdown
---
type: adr
name: cicd-gitlab-ci
description: CI/CD com GitLab CI — stages padrao, cache de dependencias, artifacts
scope: organizational
source: local
stack: gitlab-ci
category: infraestrutura
status: Aprovado
created: 2026-04-03
---

# ADR — CI/CD com GitLab CI

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** GitLab CI
- **Categoria:** Infraestrutura

---

## Contexto

GitLab CI integrado ao GitLab com runners configuráveis. Sem padrao, pipelines variam entre projetos.

## Decisao

GitLab CI como CI/CD padrao para repositorios no GitLab.

## Alternativas Consideradas

- **Jenkins** — complexo, self-hosted
- **GitHub Actions** — nao nativo para GitLab
- **GitLab CI** — escolhido; nativo, potente

## Consequencias

- `.gitlab-ci.yml` centraliza pipeline
- Runners self-hosted ou shared
- Artifacts e environments nativos

## Guardrails

- SEMPRE definir stages padrao: `test`, `build`, `deploy`
- SEMPRE usar cache para dependencias (node_modules, .pip, vendor)
- NUNCA deploy sem stage de test passar primeiro
- SEMPRE usar variables para configuracao de ambiente — NUNCA hardcode
- NUNCA usar `when: manual` sem `allow_failure: false` em stages criticos

## Enforcement

- [ ] Code review: stages em ordem correta (test antes de deploy)
- [ ] Code review: cache configurado
- [ ] Audit: sem secrets hardcoded no .gitlab-ci.yml
- [ ] Gate PREVC: pipeline verde antes de merge

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://docs.gitlab.com/ee/ci/ |
| ADRs relacionadas | secrets-management |

## Evidencias / Anexos

```yaml
stages:
  - test
  - build
  - deploy

test:
  stage: test
  cache:
    paths: [node_modules/]
  script:
    - npm ci
    - npm test
```
```

- [ ] **Step 5: Write aws-data-lake.md**

```markdown
---
type: adr
name: aws-data-lake
description: AWS Data Lake / Lakehouse — S3+Glue+Athena, formato Parquet, particionamento por data
scope: organizational
source: local
stack: aws
category: infraestrutura
status: Aprovado
created: 2026-04-03
---

# ADR — AWS Data Lake / Lakehouse

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** AWS
- **Categoria:** Infraestrutura

---

## Contexto

Arquitetura Lakehouse combina a flexibilidade de Data Lakes (S3) com a estrutura de Data Warehouses (schema-on-read via Glue Catalog + Athena). Sem padroes, dados ficam desorganizados, queries lentas, e custos explodem.

## Decisao

Adotar arquitetura Lakehouse na AWS com S3 (storage), Glue (catalogacao/ETL), Athena (queries), e formato Parquet como padrao.

## Alternativas Consideradas

- **Data Warehouse puro (Redshift)** — caro, menos flexivel para dados semi-estruturados
- **Data Lake sem catalogo** — dados viram "data swamp"
- **Lakehouse S3+Glue+Athena** — escolhido; custo-beneficio, serverless, escalavel

## Consequencias

- Storage barato e duravel (S3)
- Queries ad-hoc sem provisionar cluster (Athena serverless)
- ETL gerenciado (Glue)
- Requer disciplina de particionamento e formato

## Guardrails

- SEMPRE usar formato Parquet para dados analiticos — NUNCA CSV ou JSON para tabelas de consulta
- SEMPRE particionar dados por data (year/month/day) no S3
- NUNCA criar tabelas no Glue Catalog sem partition keys definidas
- SEMPRE usar compressao Snappy para Parquet (default do ecossistema)
- NUNCA provisionar EMR para jobs que Glue Spark Job resolve
- SEMPRE organizar buckets S3 em camadas: `raw/`, `processed/`, `curated/`
- QUANDO dados raw chegarem em JSON/CSV, ENTAO converter para Parquet na camada processed via Glue Job
- SEMPRE definir schema no Glue Catalog ANTES de fazer queries no Athena

## Enforcement

- [ ] IaC review: tabelas Glue com partition keys
- [ ] CI check: novos uploads S3 usam extensao .parquet (validar no pipeline de ingestao)
- [ ] Code review: ETL jobs produzem Parquet com Snappy
- [ ] Code review: queries Athena usam filtro de particao (evitar full scan)
- [ ] Audit: custos Athena — queries sem filtro de particao geram alerta

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://docs.aws.amazon.com/athena/ |
| Docs externos | https://docs.aws.amazon.com/glue/ |
| ADRs relacionadas | iac-terraform, iac-cdk, least-privilege |

## Evidencias / Anexos

Estrutura de S3:

```
s3://company-data-lake/
├── raw/                    # Dados brutos (JSON, CSV, logs)
│   └── events/
│       └── year=2026/
│           └── month=04/
│               └── day=03/
│                   └── events-001.json.gz
├── processed/              # Dados transformados (Parquet)
│   └── events/
│       └── year=2026/
│           └── month=04/
│               └── day=03/
│                   └── part-00000.parquet
└── curated/                # Dados agregados/modelados
    └── daily_metrics/
        └── year=2026/
            └── month=04/
                └── metrics.parquet
```

Query eficiente no Athena (usa particao):

```sql
-- BOM: filtra por particao
SELECT event_type, count(*)
FROM events
WHERE year = '2026' AND month = '04'
GROUP BY event_type;

-- RUIM: full scan (caro)
SELECT * FROM events;
```
```

- [ ] **Step 6: Run tests — all 21 templates should pass**

Run: `node --test tests/validation/test-adr-structural.mjs`
Expected: All template frontmatter, directory, and README tests pass. Skill integration tests still fail (skills not modified yet).

- [ ] **Step 7: Commit**

```bash
git add .context/templates/adrs/infraestrutura/
git commit -m "feat(adr): add infrastructure templates (Terraform, CDK, GitHub Actions, GitLab CI, AWS Data Lake)"
```

---

## Task 8: ADR Repo Scaffold

**Agent:** documentation-writer
**Tests:** unit (structural — from Task 1)

**Files:**
- Create: `templates/adr-repo-scaffold/README.md`
- Create: `templates/adr-repo-scaffold/.github/PULL_REQUEST_TEMPLATE.md`

- [ ] **Step 1: Write scaffold README.md**

```markdown
# ADR Templates — [Nome do Time]

Repositorio de Architecture Decision Records organizacionais.
Usado como fonte de templates pelo DevFlow (`/devflow prd`).

## Como Usar

### No DevFlow

Ao rodar `/devflow prd`, quando perguntado sobre ADRs:
1. Escolha "Sim, tenho um repositorio de ADRs"
2. Informe a URL deste repositorio

O DevFlow clona os templates e recomenda os relevantes com base na stack do projeto.

### Manualmente

Copie os templates relevantes para `.context/docs/adrs/` do seu projeto.

## Estrutura

```
principios-codigo/     — SOLID, Clean Code, por linguagem
qualidade-testes/      — TDD, code review, por linguagem
arquitetura/           — Layered, Hexagonal, Microservices
seguranca/             — OWASP, secrets, least privilege
infraestrutura/        — IaC, CI/CD, cloud patterns
```

## Como Contribuir

1. Crie uma branch: `feat/adr-<nome>`
2. Adicione o template na categoria correta
3. Use o formato padrao (veja qualquer template existente como referencia):
   - YAML frontmatter com: type, name, description, scope, stack, category, status, created
   - Secoes: Contexto, Decisao, Alternativas, Consequencias, **Guardrails**, **Enforcement**
4. Abra um PR usando o template de PR

## Formato dos Guardrails

Regras imperative, concretas, verificaveis:

- `SEMPRE ...` — obrigacao
- `NUNCA ...` — proibicao
- `QUANDO ... ENTAO ...` — condicional

## Manutencao

- Revise templates trimestralmente
- Marque templates obsoletos como `status: Substituido` com `superseded_by`
- Nao delete templates substituidos — mantenha para historico
```

- [ ] **Step 2: Write PR template**

Create `templates/adr-repo-scaffold/.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Nova ADR Template

**Nome:** <!-- slug do template, ex: solid-python -->
**Categoria:** <!-- principios-codigo | qualidade-testes | arquitetura | seguranca | infraestrutura -->
**Stack:** <!-- python | typescript | go | aws | universal | ... -->

## Checklist

- [ ] Frontmatter YAML completo (type, name, description, scope, stack, category, status, created)
- [ ] Secao Contexto preenchida
- [ ] Secao Decisao com justificativa
- [ ] Secao Alternativas com motivos de descarte
- [ ] Secao Consequencias (positivas + trade-offs)
- [ ] Secao Guardrails com regras SEMPRE/NUNCA/QUANDO
- [ ] Secao Enforcement com checks verificaveis
- [ ] Exemplo de codigo na secao Evidencias
- [ ] Template testado localmente (frontmatter valido)
```

- [ ] **Step 3: Commit**

```bash
git add templates/adr-repo-scaffold/
git commit -m "feat(adr): add repo scaffold for team ADR repositories"
```

---

## Task 9: Modify prd-generation Skill

**Agent:** architect
**Tests:** unit (structural — from Task 1)

**Files:**
- Modify: `skills/prd-generation/SKILL.md`

- [ ] **Step 1: Add Stack Interview step after Step 4 (Interview User)**

In `skills/prd-generation/SKILL.md`, after the existing Step 4 (Interview User) section and before Step 5 (Synthesize), add a new step:

```markdown
## Step 4.5: Entrevista STACK

Apos a entrevista do PRD, coletar informacoes sobre a stack tecnica do projeto.

**Perguntas (uma por vez, multipla escolha):**

1. "Quais sao as linguagens principais do projeto?"
   - (A) Python
   - (B) TypeScript
   - (C) Go
   - (D) Java
   - (E) Rust
   - (F) Outra (especificar)
   - Aceita multiplas respostas.

2. "Qual cloud provider?"
   - (A) AWS
   - (B) GCP
   - (C) Azure
   - (D) Nenhum / on-premise

3. "Qual padrao de arquitetura?"
   - (A) Layered (Controller-Service-Repository)
   - (B) Hexagonal (Ports & Adapters)
   - (C) Microservices
   - (D) Monolith modular
   - (E) Event-Driven
   - (F) Ainda nao definido

4. "Usa Infrastructure as Code?"
   - (A) Terraform
   - (B) AWS CDK
   - (C) Pulumi
   - (D) Nenhum

5. "Qual CI/CD?"
   - (A) GitHub Actions
   - (B) GitLab CI
   - (C) Jenkins
   - (D) Nenhum / outro

Salvar as respostas como secao **Stack** no PRD:

```markdown
## Stack

| Aspecto | Escolha |
|---------|---------|
| Linguagens | Python, TypeScript |
| Cloud | AWS |
| Arquitetura | Layered |
| IaC | Terraform |
| CI/CD | GitHub Actions |
```
```

- [ ] **Step 2: Add ADR Interview and Recommendation steps after Step 9 (Save PRD)**

After the existing Step 9 (Save PRD) and before Step 10 (Handoff), add:

```markdown
## Step 9.5: Entrevista ADRs

Apos salvar o PRD, oferecer adocao de ADRs organizacionais.

### Pergunta fonte

"Sua equipe ja possui um repositorio padrao de ADRs (Architecture Decision Records)?"

**(A)** Sim, tenho um repositorio
   → Solicitar URL do repositorio git (ex: `github.com/org/context-adrs-nexuz`)
   → Clonar/copiar templates do repositorio para `.context/templates/adrs/`
   → Usar como fonte de templates

**(B)** Nao, quero usar os templates padrao do DevFlow
   → Verificar se `.context/templates/adrs/` existe
   → Se nao existe, copiar de `templates/` do DevFlow (kit inicial)
   → Usar templates locais

**(C)** Nao, quero criar um repositorio de ADRs para meu time
   → Gerar scaffold usando `templates/adr-repo-scaffold/` como base
   → Perguntar nome do time para o repo: `context-adrs-<team>`
   → Perguntar se quer publicar no GitHub (`gh repo create`)
   → Apos criar, usar o scaffold como fonte

**(D)** Nao quero usar ADRs neste projeto
   → Pular para Step 10 (Handoff)

### Recomendacao

Apos definir a fonte de templates:

1. Ler todos os templates disponiveis em `.context/templates/adrs/`
2. Cruzar com a Stack do PRD (Step 4.5):
   - Para cada template, verificar se `stack` do frontmatter corresponde a alguma resposta da stack
   - Templates com `stack: universal` sao sempre recomendados
3. Apresentar lista com checkbox:
   ```
   Com base no seu PRD (Python + AWS + Terraform), recomendo estas ADRs:
   ✅ SOLID para Python — principios de codigo
   ✅ Clean Code para Python — legibilidade
   ✅ TDD para Python — qualidade obrigatoria
   ✅ OWASP Top 10 — seguranca baseline
   ✅ Secrets Management — gestao de segredos
   ✅ IaC com Terraform — infraestrutura
   ✅ AWS Data Lake — padroes Lakehouse
   ⬜ Hexagonal Architecture — nao detectado no PRD
   ```
4. Usuario aceita/rejeita cada uma

### Instanciacao

Para cada template aceito:
1. Copiar para `.context/docs/adrs/` com numeracao sequencial (001, 002, ...)
2. Gerar `.context/docs/adrs/README.md` com indice:
   ```markdown
   # ADRs do Projeto

   Decisoes arquiteturais ativas neste projeto.
   A IA consulta este indice durante o context gathering do PREVC Planning.

   ## ADRs Ativas

   | # | Titulo | Escopo | Status | Guardrails | Stack |
   |---|--------|--------|--------|------------|-------|
   | 001 | SOLID para Python | Organizacional | Aprovado | 8 regras | Python |
   | ... | ... | ... | ... | ... | ... |

   ## Como a IA usa estas ADRs

   1. No inicio do Planning phase, a IA le este README
   2. Identifica ADRs relevantes pela stack e categoria
   3. Le os guardrails das ADRs aplicaveis
   4. Aplica como restricoes durante brainstorming, design e implementacao
   5. No Validation phase, verifica compliance com os guardrails
   ```
3. Adicionar referencia no PRD:
   ```markdown
   ## ADRs Associados
   - [001 - SOLID para Python](.context/docs/adrs/001-solid-python.md)
   - [002 - TDD para Python](.context/docs/adrs/002-tdd-python.md)
   ```
```

- [ ] **Step 3: Update checklist to include new steps**

Update the checklist at the top of the skill to add the new steps:

```markdown
## Checklist

You MUST create a task for each of these items and complete them in order:

1. **Detect mode** — Modo A (new) or Modo B (existing)
2. **Gather context** — invoke `devflow:context-awareness`
3. **Analyze existing state** (Modo B only) — map what already exists
4. **Interview user** — Socratic process, one question at a time
5. **Interview STACK** — collect tech stack information
6. **Synthesize** — cross-reference code analysis with interview
7. **Generate PRD** — apply template, RICE, MoSCoW
8. **Decompose into phases** — invoke `devflow:feature-breakdown`
9. **Present for approval** — section by section
10. **Save PRD** — write to `.context/plans/<project>-prd.md`
11. **Interview ADRs** — recommend and instantiate organizational ADRs
12. **Handoff** — announce readiness for PREVC of first pending phase
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/validation/test-adr-structural.mjs`
Expected: `prd-generation should reference ADR interview` test passes.

- [ ] **Step 5: Commit**

```bash
git add skills/prd-generation/SKILL.md
git commit -m "feat(adr): add stack interview and ADR recommendation to prd-generation skill"
```

---

## Task 10: Modify prevc-planning Skill

**Agent:** architect
**Tests:** unit (structural — from Task 1)

**Files:**
- Modify: `skills/prevc-planning/SKILL.md`

- [ ] **Step 1: Add ADR reading to Step 1 (Gather Project Context)**

In `skills/prevc-planning/SKILL.md`, extend Step 1 in all three modes to include ADR reading:

After the existing Full Mode block in Step 1, add:

```markdown
### All Modes — ADR Guardrails Loading

After gathering base context, check for active ADRs:

1. Check if `.context/docs/adrs/README.md` exists
2. If yes:
   a. Read the README index to identify active ADRs
   b. For each ADR with status `Aprovado`, read the **Guardrails** section
   c. Collect all guardrails as constraints for the brainstorming process
   d. Announce: "Loaded N guardrails from M active ADRs."
3. If no: continue without ADR constraints (ADRs are opt-in)

**Important:** Guardrails from ADRs are treated as hard constraints during brainstorming:
- The brainstorming MUST NOT propose alternatives already rejected in ADRs
- The design MUST comply with all active guardrails
- If a guardrail conflicts with the task requirements, flag the conflict to the user instead of silently violating

**Hierarchy:** Project ADRs (`scope: project`) override Organizational ADRs (`scope: organizational`) for the same topic.
```

Also add to the Lite Mode section:

```markdown
- `.context/docs/adrs/README.md` — active ADR guardrails (if exists)
```

- [ ] **Step 2: Run tests**

Run: `node --test tests/validation/test-adr-structural.mjs`
Expected: `prevc-planning should reference ADR reading` test passes.

- [ ] **Step 3: Commit**

```bash
git add skills/prevc-planning/SKILL.md
git commit -m "feat(adr): add ADR guardrails loading to prevc-planning context gathering"
```

---

## Task 11: Modify prevc-validation Skill

**Agent:** architect
**Tests:** unit (structural — from Task 1)

**Files:**
- Modify: `skills/prevc-validation/SKILL.md`

- [ ] **Step 1: Add ADR compliance check as Step 2.5**

In `skills/prevc-validation/SKILL.md`, after Step 2 (Spec Compliance) and before Step 3 (Test Coverage Review), add:

```markdown
## Step 2.5: ADR Guardrails Compliance

Check if the implementation complies with active ADR guardrails.

### When to run
Only if `.context/docs/adrs/README.md` exists and has active ADRs.

### Process

1. Read `.context/docs/adrs/README.md` — get list of active ADRs
2. For each ADR with status `Aprovado`:
   a. Read the **Guardrails** section
   b. For each guardrail rule (SEMPRE/NUNCA/QUANDO):
      - Check if the implementation violates the rule
      - For code guardrails: scan relevant files for violations
      - For architecture guardrails: verify structure matches
   c. For each **Enforcement** item:
      - Verify if the enforcement mechanism exists (CI check, lint rule, etc.)
3. Report findings:

```markdown
### ADR Compliance: PASS/FAIL

| ADR | Guardrails | Violations | Status |
|-----|-----------|------------|--------|
| 001 - SOLID Python | 8 | 0 | PASS |
| 002 - TDD Python | 5 | 1 | FAIL |
| 003 - AWS Data Lake | 8 | 0 | PASS |

**Violations:**
- ADR 002, rule "NUNCA usar mocks para banco": found mock in `tests/test_user.py:45`
```

4. If any violations found: return to Execution phase to fix.

### Full Mode
```
agent({ action: "orchestrate", agents: ["code-reviewer"], task: "adr-compliance" })
```
The code-reviewer agent performs ADR compliance checking against the guardrails.
```

- [ ] **Step 2: Update checklist to include ADR compliance**

Update the checklist at the top of the skill:

```markdown
## Checklist

1. **Run full test suite** — all tests must pass
2. **Spec compliance check** — implementation matches the approved design
3. **ADR guardrails compliance** — implementation respects active ADR guardrails
4. **Test coverage review** — verify adequate coverage for new code
5. **Security validation** — check for OWASP top 10 and domain-specific risks
6. **Performance check** — no obvious regressions (if applicable)
7. **Gate check** — all validations pass = ready to advance
```

- [ ] **Step 3: Update gate check section**

Add to the gate check requirements:

```markdown
- ADR compliance verified (if ADRs active)
```

And update the validation summary template:

```markdown
### ADR Compliance: PASS/N/A (X guardrails checked, Y violations)
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/validation/test-adr-structural.mjs`
Expected: `prevc-validation should reference ADR compliance` test passes.

- [ ] **Step 5: Commit**

```bash
git add skills/prevc-validation/SKILL.md
git commit -m "feat(adr): add ADR guardrails compliance check to prevc-validation"
```

---

## Task 12: Modify context-awareness and context-sync Skills

**Agent:** architect
**Tests:** unit (structural — from Task 1)

**Files:**
- Modify: `skills/context-awareness/SKILL.md`
- Modify: `skills/context-sync/SKILL.md`

- [ ] **Step 1: Add ADR directory to context-awareness**

In `skills/context-awareness/SKILL.md`, in the Lite Mode section, add after item 5 (Tooling):

```markdown
6. **ADR Guardrails:** `.context/docs/adrs/README.md`
   - Active architectural decisions and guardrails
   - Read README index, then relevant ADRs by stack/category
```

Also add to the Context Output Format section:

```markdown
### Active ADR Guardrails
- [list of guardrails from relevant ADRs]
```

- [ ] **Step 2: Add ADR sync to context-sync**

In `skills/context-sync/SKILL.md`, add a new section after Step 3c (Sync Workflow Directory):

```markdown
## Step 3d: Sync ADR Index

Update `.context/docs/adrs/README.md` to reflect current ADR state.

### When running full sync or `docs` scope:

1. Check if `.context/docs/adrs/` exists
2. If yes:
   a. Scan all `.md` files in `.context/docs/adrs/` (excluding README.md)
   b. Parse frontmatter of each ADR (name, status, scope, stack, category)
   c. Count guardrails rules (lines matching `^- (SEMPRE|NUNCA|QUANDO)`)
   d. Regenerate README.md index table with current data
   e. Report changes
3. If no: skip (ADRs are opt-in)

### Report for ADR scope:
```markdown
### ADRs
- .context/docs/adrs/ — [exists | not found]
- README.md — [regenerated | up-to-date | created]
- Active ADRs: [count]
- Total guardrails: [count]
```
```

Also update the Step 2 scope table:

```markdown
| `docs` | Apenas docs + ADRs | `.context/docs/`, `.context/docs/adrs/` |
```

- [ ] **Step 3: Run tests — ALL should pass**

Run: `node --test tests/validation/test-adr-structural.mjs`
Expected: ALL tests pass — templates exist, frontmatter valid, README index complete, skills modified.

- [ ] **Step 4: Commit**

```bash
git add skills/context-awareness/SKILL.md skills/context-sync/SKILL.md
git commit -m "feat(adr): add ADR support to context-awareness and context-sync skills"
```

---

## Task 13: Final Integration Test Run

**Agent:** test-writer
**Tests:** unit + integration (full suite)

- [ ] **Step 1: Run ADR structural tests**

Run: `node --test tests/validation/test-adr-structural.mjs`
Expected: ALL tests pass (templates, frontmatter, README, scaffold, skill integration).

- [ ] **Step 2: Run existing test suite to verify no regressions**

Run: `node --test tests/validation/test-structural.mjs`
Expected: ALL existing tests pass (no regressions).

- [ ] **Step 3: Run full test suite**

Run: `node --test tests/`
Expected: ALL tests pass.

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "test(adr): verify full ADR system integration — all tests passing"
```
