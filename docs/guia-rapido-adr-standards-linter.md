# Guia Rápido — ADR, Standards e Linter no dia a dia

Manual de bolso para usar os três artefatos da camada de contexto do DevFlow num
projeto novo. Se você acabou de rodar `/devflow init` e não sabe quando criar
o quê — comece aqui.

---

## Os três artefatos em uma frase

| Artefato | O que é | Pergunta que responde | Onde vive |
|---|---|---|---|
| **ADR** | registro de uma **decisão** arquitetural | *"por que escolhemos X em vez de Y?"* | `.context/adrs/NNN-adr-*.md` |
| **Standard** | uma **regra operacional** cross-cutting | *"como o código deve parecer agora?"* | `.context/standards/std-*.md` |
| **Linter** | o **sensor executável** da regra | *"este arquivo respeita o standard?"* | `.context/standards/machine/std-*.js` |

A relação entre eles:

```
   ADR  ──justifica──▶  STANDARD  ──força──▶  LINTER
 (decisão)            (regra de hoje)      (verificação automática)
```

- A **ADR** diz *por que* — é histórico, raramente muda, registra alternativas descartadas.
- O **Standard** diz *como* — é regra viva sobre um **concern operacional** (validação de borda, tratamento de erro, naming…), **não** sobre uma lib.
- O **Linter** é o braço automático — roda sozinho quando você edita código e avisa quando a regra é violada.

> Ponto-chave: um Standard descreve um **concern**, não uma biblioteca. Você cria
> `std-runtime-validation` (concern), não `std-zod` (lib). A lib é detalhe que a
> ADR registra; a regra operacional é estável mesmo que a lib mude.

---

## Quando criar cada um

```
Tomei uma decisão arquitetural (framework, lib, padrão, protocolo)?
        │
        ├── SIM ─▶ crie uma ADR     "crie um ADR para <decisão>"
        │              │
        │              └─▶ a ADR tem Guardrails/Enforcement que valem como
        │                  regra contínua de código?
        │                       │
        │                       ├── SIM ─▶ crie/atualize um STANDARD do concern
        │                       └── NÃO ─▶ só a ADR basta
        │
        └── NÃO, é só uma convenção de código (naming, organização, erro…)?
                   │
                   └─▶ crie um STANDARD direto (sem ADR — concern stand-alone)

O LINTER você implementa depois, dentro do machine/std-*.js do standard,
quando a regra for verificável estaticamente.
```

Regras práticas:

- **ADR sem Standard** é normal — nem toda decisão vira regra de lint.
- **Standard sem ADR** é normal — concerns cross-cutting (`std-error-handling`, `std-naming-conventions`) não precisam de uma decisão registrada.
- **Standard com Linter** é o ideal — mas enquanto o linter for stub, mantenha `weakStandardWarning: true` no frontmatter (débito visível, não bloqueia).

---

## O dia a dia dentro do PREVC

Os três artefatos aparecem em fases diferentes do workflow:

| Fase PREVC | O que acontece com ADR / Standard / Linter |
|---|---|
| **P — Planning** | `adr-filter` seleciona só as ADRs relevantes à task (reduz ruído de contexto). Se a task **toma** uma decisão nova, registre uma ADR. |
| **R — Review** | Revisa se o plano respeita Guardrails das ADRs ativas. |
| **E — Execution** | Ao editar/criar um arquivo, o **hook PostToolUse** roda os linters dos standards cujo `applyTo` casa o arquivo — feedback `VIOLATION:` chega no contexto na hora. |
| **V — Validation** | Step 2.5: código cumpre os Guardrails das ADRs. Step 2.6: as ADRs tocadas passam o audit estrutural. Standards passam o audit S1-S7. |
| **C — Confirmation** | Se a branch criou/mudou ADR ou Standard, isso entra no README + bump. |

O **linter não é uma skill** — é automático. Você não o invoca; ele dispara a
cada `Edit`/`Write` num arquivo coberto por um `applyTo`.

---

## Projeto novo: do zero ao primeiro ciclo

```
1. /devflow init
   └─ scaffold de .context/ (adrs/, standards/, docs/…)

2. Você decide algo — ex: "vamos validar I/O externo com Zod"
   └─ "crie um ADR para adoção de Zod na validação de borda"
      → gera .context/adrs/001-adr-zod-frontend-v1.0.0.md
        com seções Decisão, Guardrails, Enforcement

3. O adr-builder (Step 5e) sugere: "isso toca o concern runtime-validation —
   criar um standard?"
   └─ "crie o standard runtime-validation enriquecido pela ADR-001"
      → devflow standards new --concern=runtime-validation --enrich-from-adr=001
      → gera .context/standards/std-runtime-validation.md
             .context/standards/machine/std-runtime-validation.js (stub)

4. (opcional) Implemente a regra real no machine/std-runtime-validation.js
   └─ enquanto for stub, mantenha weakStandardWarning: true

5. A partir daqui, toda edição de .ts/.tsx/.py dispara o linter
   automaticamente — você recebe VIOLATION: ... se quebrar a regra.
```

Depois do primeiro ciclo, o padrão se repete: decisão → ADR → (talvez) Standard → Linter.

---

## Cheat sheet de comandos

**ADR** (skill `devflow:adr-builder`, ou comando `/devflow-adr`)

| Quero… | Diga / rode |
|---|---|
| Registrar uma decisão | `"crie um ADR para <decisão>"` |
| Auditar uma ADR | `"audita a ADR-001"` |
| Evoluir uma ADR (patch/minor/major) | `"evolve a ADR-001 para minor"` |

**Standard** (skill `devflow:standards-builder`) — modo padrão é **FROM-CONCERN**

| Quero… | Rode |
|---|---|
| Criar standard de um concern | `devflow standards new --concern=<id>` |
| Criar e puxar guardrails de ADRs | `devflow standards new --concern=<id> --enrich-from-adr=<csv>` |
| Auditar um standard (S1-S7) | `devflow standards audit <id>` |
| Achar ADRs de um concern | `devflow standards search --by-concern=<id>` |
| Achar standards que citam uma ADR | `devflow standards search --by-guardrail=<adr-slug>` |
| Migrar standard lib-centric → concern | `devflow standards new --migrate=<lib>` |
| Validar todos os standards | `devflow standards verify` |

> O modo `--from-adr` (1 standard por lib) ainda existe, mas é **legado** —
> emite warning e gera standards lib-centric. Prefira `--concern`.

**Linter** — não tem comando: roda no hook PostToolUse. Para testar manualmente:

```
node .context/standards/machine/std-<id>.js <arquivo>
# exit 0 = ok · exit 1 + "VIOLATION: ..." = violação
```

---

## Erros comuns

| Erro | Correção |
|---|---|
| Criar `std-zod`, `std-pytest` (nome de lib) | Use o concern: `std-runtime-validation`, `std-test-discipline`. Audit S7 avisa se o id casa uma lib. |
| Copiar a `## Decisão` da ADR para o `## Princípios` do standard | Standard tem prosa própria (operacional). A ADR só alimenta `## Linter` via Guardrails/Enforcement. |
| Standard sem linter e sem `weakStandardWarning` | Declare `weakStandardWarning: true` OU implemente o linter — senão vira warning em `verify`. |
| `applyTo` com negação `!` ou extglob `+(...)` | Só o subset SI-5: `**`, `*`, `?`, `{a,b}`. Liste o que se aplica, não o que se exclui. |
| Achar que o linter roda em qualquer lugar | Linter SI-4: só em `.context/standards/machine/**`, só Node, timeout 5s. |

---

## Referência

- Standards — guia de autoria: `.context/standards/README.md`
- ADRs — índice: `.context/adrs/README.md`
- Decisão arquitetural da camada: ADR-002 (`adopt-standards-triple-layer`)
- Skills: `devflow:adr-builder`, `devflow:standards-builder`, `devflow:adr-filter`
