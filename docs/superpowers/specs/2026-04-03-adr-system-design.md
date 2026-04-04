# Design: Sistema de ADRs como Guardrails para IA

**Data:** 2026-04-03
**Status:** Proposto
**Scale:** MEDIUM (P -> R -> E -> V)

---

## Problema

Decisoes arquiteturais sao tomadas em conversas, PRDs e specs, mas nao existe um mecanismo formal para:

1. **Documentar o "por que"** — a memoria institucional de por que as coisas sao do jeito que sao se perde entre sessoes
2. **Guardrails ativos** — a IA nao tem regras operacionais explicitas derivadas de decisoes passadas, podendo re-propor alternativas ja rejeitadas ou violar padroes estabelecidos
3. **Padronizacao entre projetos** — cada projeto comeca do zero, sem herdar boas praticas organizacionais (SOLID, TDD, seguranca, IaC)
4. **Padronizacao entre times** — equipes diferentes nao compartilham um baseline de decisoes arquiteturais

## Solucao

Sistema de ADRs em duas camadas integrado ao DevFlow:

- **Camada 1 — ADRs Organizacionais (templates):** Boas praticas segmentadas por stack/dominio que qualquer projeto herda. Vivem em `.context/templates/adrs/` ou em repositorios git externos de times.
- **Camada 2 — ADRs de Projeto (instanciadas):** Decisoes especificas do projeto. Vivem em `.context/docs/adrs/`.

Ativacao automatica: apos o `/devflow prd`, o sistema analisa o PRD gerado, cruza com a stack detectada, e recomenda ADRs organizacionais ao usuario.

## Decisoes

| Decisao | Escolha | Justificativa |
|---------|---------|---------------|
| Formato ADR | Template atual + Guardrails + Enforcement | Manter compatibilidade com template existente; seções extras transformam docs passivos em regras ativas |
| Localizacao templates | `.context/templates/adrs/` | Separado dos docs do projeto; herdavel via repo externo |
| Localizacao instanciadas | `.context/docs/adrs/` | Dentro do dotcontext; `buildSemantic` e `getPhaseDocs` ja varrem esse diretorio |
| Segmentacao | Por stack/dominio (ex: `solid-python.md`) | Mais especifico que generico; guardrails concretos por linguagem |
| Ativacao pela IA | Automatica via indice `adrs/README.md` | IA le o indice no context gathering, consulta ADRs relevantes pela stack |
| Granularidade | Macro + filhas sob demanda | Comeca com ADR guarda-chuva, cria granulares quando decisoes reais surgem |
| Fonte de templates | Kit inicial local + repositorios git externos por time | Kit base vem com DevFlow; times podem manter seu proprio repo de ADRs |
| Entrevista de stack | Integrada ao `/devflow prd` como passo separado | Apos gerar o PRD, entrevista stack e recomenda ADRs |

## Arquitetura

### Estrutura de diretorios

```
.context/
├── templates/
│   └── adrs/                              # Camada 1 — Organizacionais
│       ├── README.md                      # Indice dos templates disponiveis
│       ├── principios-codigo/
│       │   ├── solid-python.md
│       │   ├── solid-typescript.md
│       │   ├── solid-go.md
│       │   ├── clean-code-python.md
│       │   ├── clean-code-typescript.md
│       │   └── clean-code-go.md
│       ├── qualidade-testes/
│       │   ├── tdd-python.md
│       │   ├── tdd-typescript.md
│       │   ├── tdd-go.md
│       │   └── code-review.md
│       ├── arquitetura/
│       │   ├── layered-architecture.md
│       │   ├── hexagonal-architecture.md
│       │   └── microservices-vs-monolith.md
│       ├── seguranca/
│       │   ├── owasp-top10.md
│       │   ├── secrets-management.md
│       │   └── least-privilege.md
│       └── infraestrutura/
│           ├── iac-terraform.md
│           ├── iac-cdk.md
│           ├── cicd-github-actions.md
│           ├── cicd-gitlab-ci.md
│           └── aws-data-lake.md
│
└── docs/
    └── adrs/                              # Camada 2 — Projeto
        ├── README.md                      # Indice com status e guardrails count
        ├── 001-solid-python.md            # Instanciada do template
        ├── 002-tdd-python.md
        └── 003-lakehouse-aws.md           # ADR especifica do projeto
```

### Repositorio externo de ADRs (time/squad)

```
# Repo: github.com/org/context-adrs-nexuz
adrs/
├── README.md                              # Indice + instrucoes de uso
├── principios-codigo/
│   ├── solid-python.md
│   └── solid-typescript.md
├── qualidade-testes/
│   └── tdd-python.md
├── seguranca/
│   └── owasp-top10.md
└── infraestrutura/
    └── aws-data-lake.md
```

Scaffold padrao para times que querem criar seu proprio repositorio de ADRs.

## Fluxo: Integracao com `/devflow prd`

```
/devflow prd
│
├─ Passo 1: Entrevista PRD
│  Fluxo normal — problema, escopo, fases, entregas, criterios
│
├─ Passo 2: Entrevista STACK
│  → "Quais linguagens principais do projeto?"
│     (opcoes: Python, TypeScript, Go, Java, Rust, outra)
│  → "Qual cloud provider?"
│     (opcoes: AWS, GCP, Azure, nenhum)
│  → "Qual padrao de arquitetura?"
│     (opcoes: Layered, Hexagonal, Microservices, Monolith, Event-Driven)
│  → "Usa Infrastructure as Code?"
│     (opcoes: Terraform, CDK, Pulumi, nenhum)
│  → "Qual CI/CD?"
│     (opcoes: GitHub Actions, GitLab CI, Jenkins, nenhum)
│
├─ Passo 3: Gera PRD
│  PRD salvo com secao Stack preenchida
│
├─ Passo 4: Entrevista ADRs
│  → "Sua equipe ja possui um repositorio padrao de ADRs?"
│
│  (A) Sim, tenho um repo
│      → Informar URL (ex: github.com/org/context-adrs-nexuz)
│      → Clona/puxa templates do repo para .context/templates/adrs/
│
│  (B) Nao, quero usar os templates padrao do DevFlow
│      → Usa .context/templates/adrs/ locais (kit inicial)
│
│  (C) Nao, quero criar um repositorio de ADRs para meu time
│      → Gera scaffold de repo git com estrutura padrao
│      → Pergunta se quer publicar no GitHub
│      → Usa o scaffold recem-criado como fonte
│
├─ Passo 5: Recomendacao
│  Cruza Stack do PRD com templates disponiveis:
│
│  "Com base no seu PRD (Python + AWS + Terraform), recomendo:"
│  ✅ SOLID para Python — principios de codigo
│  ✅ Clean Code para Python — legibilidade e manutencao
│  ✅ TDD para Python — qualidade obrigatoria
│  ✅ OWASP Top 10 — seguranca baseline
│  ✅ Secrets Management — gestao de segredos
│  ✅ IaC com Terraform — infraestrutura como codigo
│  ✅ AWS Data Lake — padroes Lakehouse
│  ⬜ Hexagonal Architecture — nao detectado no PRD
│  ⬜ CI/CD GitHub Actions — nao detectado no PRD
│
│  Usuario aceita/rejeita cada uma
│
└─ Passo 6: Instanciacao
   → Copia templates aceitos para .context/docs/adrs/
   → Numera sequencialmente (001, 002, 003...)
   → Gera README.md com indice
   → Adiciona referencia no PRD (secao "ADRs Associados")
```

## Formato: Template ADR

Baseado no template existente (`docs/.ai/templates/adr_template.md`) com extensoes para guardrails de IA.

```markdown
---
type: adr
name: <slug>
description: <descricao curta para indexacao>
scope: organizational | project
source: local | <repo-url>
stack: python | typescript | go | aws | terraform | ...
category: principios-codigo | qualidade-testes | arquitetura | seguranca | infraestrutura
status: Proposto | Aprovado | Rejeitado | Substituido
created: YYYY-MM-DD
superseded_by: <adr-slug>  # quando substituida
---

# ADR — [Titulo curto e descritivo]

- **Data:** YYYY-MM-DD
- **Status:** [Proposto | Aprovado | Rejeitado | Substituido]
- **Escopo:** [Organizacional | Projeto]
- **Stack:** [Python | TypeScript | AWS | ...]
- **Categoria:** [Principios de Codigo | Qualidade & Testes | ...]

---

## Contexto
Cenario ou problema que originou a decisao.
Para ADRs organizacionais: por que este padrao e importante universalmente.
Para ADRs de projeto: contexto especifico que levou a decisao.

## Decisao
O que foi decidido, com justificativa tecnica.
Inclui padroes, convencoes, e referencias a documentacao externa.

## Alternativas Consideradas
- **Opcao A** — motivo de descarte
- **Opcao B** — motivo de descarte
- **Opcao C** — escolhida (esta ADR)

## Consequencias
- Positivas
- Trade-offs
- Impactos colaterais

## Guardrails
Regras que a IA DEVE seguir ao trabalhar em projetos que adotam esta ADR.
Formato imperativo, concreto, verificavel.

- SEMPRE ...
- NUNCA ...
- QUANDO ... ENTAO ...

## Enforcement
Como validar que os guardrails estao sendo respeitados.
Mecanismos automaticos e manuais.

- [ ] CI check: ...
- [ ] Code review: ...
- [ ] Lint rule: ...
- [ ] Gate PREVC: ...

## Relacionamentos
| Tipo | Referencia |
|------|------------|
| PRD | [link] |
| ADRs relacionadas | [links] |
| Docs externos | [links] |

## Evidencias / Anexos
Benchmarks, diagramas, artigos de referencia, exemplos de codigo.
```

## Formato: README.md (indice de ADRs)

### Para templates (`.context/templates/adrs/README.md`)

```markdown
# ADR Templates Organizacionais

Templates de boas praticas segmentados por stack e dominio.
Usados pelo `/devflow prd` para recomendar ADRs ao projeto.

## Templates Disponiveis

| Categoria | Template | Stacks | Guardrails |
|-----------|----------|--------|------------|
| Principios de Codigo | solid-python | Python | 8 regras |
| Principios de Codigo | solid-typescript | TypeScript | 8 regras |
| Principios de Codigo | clean-code-python | Python | 6 regras |
| Qualidade & Testes | tdd-python | Python | 5 regras |
| Qualidade & Testes | tdd-typescript | TypeScript | 5 regras |
| Qualidade & Testes | code-review | universal | 4 regras |
| Arquitetura | layered-architecture | universal | 6 regras |
| Seguranca | owasp-top10 | universal | 10 regras |
| Seguranca | secrets-management | universal | 5 regras |
| Infraestrutura | iac-terraform | Terraform | 7 regras |
| Infraestrutura | aws-data-lake | AWS | 8 regras |

## Fonte

- **Local:** Kit inicial do DevFlow
- **Externo:** [URL do repo do time, se configurado]
```

### Para projeto (`.context/docs/adrs/README.md`)

```markdown
# ADRs do Projeto

Decisoes arquiteturais ativas neste projeto.
A IA consulta este indice durante o context gathering do PREVC Planning.

## ADRs Ativas

| # | Titulo | Escopo | Status | Guardrails | Stack |
|---|--------|--------|--------|------------|-------|
| 001 | SOLID para Python | Organizacional | Aprovado | 8 regras | Python |
| 002 | TDD para Python | Organizacional | Aprovado | 5 regras | Python |
| 003 | Lakehouse AWS | Projeto | Aprovado | 6 regras | AWS |

## Como a IA usa estas ADRs

1. No inicio do Planning phase, a IA le este README
2. Identifica ADRs relevantes pela stack e categoria da tarefa
3. Le os guardrails das ADRs aplicaveis
4. Aplica como restricoes durante brainstorming, design e implementacao
5. No Validation phase, verifica compliance com os guardrails
```

## Mecanismo de leitura pela IA

### Context Gathering (automatico)

O fluxo atual do PREVC Planning ja faz:

```
context({ action: "buildSemantic" })   → varre .context/docs/
agent({ action: "getPhaseDocs" })      → lista docs relevantes
```

Como as ADRs vivem em `.context/docs/adrs/`, sao automaticamente descobertas. O `README.md` serve como indice leve — a IA le o README, identifica quais ADRs sao relevantes pela stack/categoria, e le apenas as necessarias.

### Hierarquia de aplicacao

```
1. ADRs Organizacionais (scope: organizational)
   → Aplicam sempre, sao o baseline
   → Guardrails sao restricoes duras

2. ADRs de Projeto (scope: project)
   → Podem refinar ou especializar as organizacionais
   → Podem criar restricoes adicionais

3. Se conflito: ADR de Projeto prevalece sobre Organizacional
   → A ADR de projeto deve referenciar qual organizacional esta sobrescrevendo
   → Usar campo superseded_by no frontmatter
```

### Validacao no PREVC

| Fase | Como as ADRs sao usadas |
|------|------------------------|
| **P (Planning)** | IA le guardrails e aplica como restricoes no design. Nao propoe alternativas ja rejeitadas. |
| **R (Review)** | Reviewer valida se o design respeita os guardrails ativos. |
| **E (Execution)** | IA segue guardrails durante implementacao (ex: "NUNCA commitar secrets"). |
| **V (Validation)** | Checa compliance: cada guardrail e verificado contra o codigo produzido. |

## Componente: Scaffold de repo externo

Quando o usuario escolhe "Quero criar um repositorio de ADRs para meu time", o DevFlow gera:

```
context-adrs-<team>/
├── README.md                    # Como usar, como contribuir
├── .github/
│   └── PULL_REQUEST_TEMPLATE.md # Template para novas ADRs
├── principios-codigo/
│   └── .gitkeep
├── qualidade-testes/
│   └── .gitkeep
├── arquitetura/
│   └── .gitkeep
├── seguranca/
│   └── .gitkeep
└── infraestrutura/
    └── .gitkeep
```

O README do scaffold inclui instrucoes para o time contribuir com novos templates ADR.

## Kit Inicial — Templates incluidos no DevFlow

### Principios de Codigo
| Template | Stack | Guardrails principais |
|----------|-------|-----------------------|
| `solid-python.md` | Python | SRP em classes, DIP com abc/Protocol, OCP via Strategy |
| `solid-typescript.md` | TypeScript | SRP em classes, DIP com interfaces, OCP via generics |
| `solid-go.md` | Go | SRP em packages, DIP com interfaces implicitas, OCP via interfaces |
| `clean-code-python.md` | Python | Funcoes < 20 linhas, nomes descritivos, sem comentarios obvios |
| `clean-code-typescript.md` | TypeScript | Funcoes < 20 linhas, nomes descritivos, tipagem estrita |
| `clean-code-go.md` | Go | Funcoes < 20 linhas, error handling explicito, gofmt |

### Qualidade & Testes
| Template | Stack | Guardrails principais |
|----------|-------|-----------------------|
| `tdd-python.md` | Python | RED-GREEN-REFACTOR, pytest, sem mocks de DB |
| `tdd-typescript.md` | TypeScript | RED-GREEN-REFACTOR, vitest/jest, sem mocks de DB |
| `tdd-go.md` | Go | RED-GREEN-REFACTOR, testing nativo, table-driven tests |
| `code-review.md` | universal | Checklist de revisao, padroes de aprovacao |

### Arquitetura
| Template | Stack | Guardrails principais |
|----------|-------|-----------------------|
| `layered-architecture.md` | universal | Controller-Service-Repository, sem skip de camadas |
| `hexagonal-architecture.md` | universal | Ports & Adapters, dominio sem deps externas |
| `microservices-vs-monolith.md` | universal | Criterios de decisao, bounded contexts |

### Seguranca
| Template | Stack | Guardrails principais |
|----------|-------|-----------------------|
| `owasp-top10.md` | universal | Injection, Auth, XSS, CSRF, etc. |
| `secrets-management.md` | universal | NUNCA hardcode, vault/env-vars, rotacao |
| `least-privilege.md` | universal | IAM minimo, principle of least privilege |

### Infraestrutura
| Template | Stack | Guardrails principais |
|----------|-------|-----------------------|
| `iac-terraform.md` | Terraform | Modules, state remoto, plan antes de apply |
| `iac-cdk.md` | CDK | Constructs L2+, nao usar CloudFormation raw |
| `cicd-github-actions.md` | GitHub Actions | Reusable workflows, secrets via OIDC |
| `cicd-gitlab-ci.md` | GitLab CI | Stages padrao, cache de deps |
| `aws-data-lake.md` | AWS | S3+Glue+Athena, Parquet, particionamento |

## Arquivos modificados no DevFlow

| Arquivo | Mudanca |
|---------|---------|
| `skills/prd-generation/SKILL.md` | Adicionar Passo 2 (entrevista stack) + Passos 4-6 (entrevista e instanciacao de ADRs) |
| `skills/prevc-planning/SKILL.md` | Step 1 le `.context/docs/adrs/README.md` e aplica guardrails como restricoes |
| `skills/prevc-validation/SKILL.md` | Adicionar check de compliance com guardrails das ADRs ativas |
| `skills/context-awareness/SKILL.md` | Incluir `.context/docs/adrs/` no escopo de context gathering |
| `skills/context-sync/SKILL.md` | Sincronizar indice de ADRs ao rodar `/devflow-sync docs` |

## Arquivos novos

| Arquivo | Proposito |
|---------|-----------|
| `.context/templates/adrs/README.md` | Indice de templates organizacionais |
| `.context/templates/adrs/<categoria>/<template>.md` | ~20 templates do kit inicial |
| `.context/docs/adrs/README.md` | Indice de ADRs do projeto (gerado automaticamente) |
| `templates/adr-repo-scaffold/` | Scaffold para repositorios externos de ADR de times |

## Restricoes

- **Sem auto-merge de ADRs** — ADRs organizacionais sao sempre recomendadas, nunca aplicadas sem aprovacao do usuario
- **Sem lock-in** — templates sao Markdown puro; funcionam fora do DevFlow
- **Sem duplicacao** — se uma ADR organizacional ja foi instanciada no projeto, nao recomendar novamente
- **Idioma** — templates seguem o idioma configurado via `devflow:language` (default: pt-BR)
- **Retrocompatibilidade** — projetos sem ADRs continuam funcionando normalmente; ADRs sao opt-in via `/devflow prd`
