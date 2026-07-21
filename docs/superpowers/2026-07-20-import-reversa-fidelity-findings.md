# Investigação de fidelidade — `import-reversa` contra Reversa real (dimensionamento)

**Data:** 2026-07-20 · **Contexto:** antes de rodar o plano E2E, dimensionar os achados F1–F6.
**Método:** rodar a lib pura (`runPipeline`, só-leitura) contra **dois** projetos Reversa reais, mesma versão (**v1.2.43**), e contrastar com o que a lib assume.
**Fontes:** `reversa-com-attio` (modo forward) · `reversa-modulo-odoo-17-okr` (modo reverse) — ambas read-only, nunca mutadas.

---

## 1. Causa-raiz (o achado que reorganiza tudo)

Os seis achados F1–F6 **não são bugs independentes**. São sintomas de **uma lacuna estrutural única**:

> **O importador cobre apenas o modo _forward/greenfield_ do Reversa. O modo _reverse/brownfield_ (engenharia reversa de um sistema existente) não é suportado — e degenera silenciosamente em vez de falhar.**

O Reversa emite **layouts de saída diferentes por modo de operação**, e o importador (skill + lib + fixture sintético) foi calibrado só no forward.

### Evidência: contraste, mesma versão v1.2.43

| Sinal | `reversa-com-attio` (**forward**) | `reversa-modulo-odoo-17-okr` (**reverse**) |
|---|---|---|
| `_reversa_forward/` | 15 features (`NNN-slug/`) | **vazio** |
| `_reversa_sdd/<x>/spec.md` | ✅ 18 specs reais | ❌ inexistente |
| decisões | `_decisions/paradigm-decision.md` | `adrs/*.md` + `<módulo>/decisions.md` |
| reconstruction-plan | tem tabela `## Marcos demonstráveis` (M1–M7) | usa `## Ordem de build (bottom-up)` |
| taxonomia `_reversa_sdd/` | por **feature** | por **artefato de análise** (`architecture.md`, `c4-*`, `erd-complete.md`, `code-analysis.md`, `traceability/`, `adrs/`, `user-stories/`) + **módulo** (`to_okr/`, `to_okr_project/`) |
| soul | (n/d) | `.reversa/documentation/assets/data/soul.json` |
| `state.target.kind` | (greenfield) | `remote-odoo-live-preview` |

**Resultado do pipeline (mesma lib, mesma versão):**

| | forward (attio) | reverse (okr) |
|---|---|---|
| features | **20** (18 reais + 2 stub) | 6 (**todas fantasma/stub**) |
| tasks / milestones | 21 / **7** | 11 / **0** |
| PRD | **1571 B** (faseado) | **211 B** (vazio) |
| stories.yaml | 1497 B | 3635 B |
| planSkeletons | 20 | 6 |

No forward o importador **entrega valor** (features, ondas, PRD faseado). No reverse ele **roda sem erro mas produz lixo estruturado** — o pior tipo de falha, porque parece ter funcionado.

---

## 2. Achados reclassificados + dimensionados

Cada achado: **o que a lib faz** → **o que o Reversa real tem** → **correção** → **nível/esforço**.

Níveis: **N0** detectar+avisar (honestidade) · **N1** suporte reverse mínimo (aproveita o que já é parseável) · **N2** fidelidade plena reverse.

| # | Achado | O que a lib faz | O que o real tem | Correção proposta | Nível · Esforço |
|---|---|---|---|---|---|
| **F0** | *(novo)* modo reverse não detectado | `detect` só checa presença de `.reversa/`+`sdd/forward`; não distingue modo | `_reversa_forward/` vazio + `code-analysis.md`/`erd-complete.md`/`traceability/` + `target.kind` reverse | adicionar **detecção de modo** e rotear parsers; se reverse e sem suporte, **avisar** (não degenerar) | **N0** · S |
| **F1** | readiness falso-red, 6 features-fantasma | `listFeatureDirs(_reversa_sdd)` = todo subdir vira "feature com spec.md" | subdirs são **categorias de análise** (`adrs/`,`user-stories/`,`traceability/`,`flowcharts/`) + **módulos** (`to_okr/`,`to_okr_project/`) | classificar subdir: análise→preservar; módulo (tem `requirements.md`+`tasks.md`)→feature | **N1** · M |
| **F2** | features reais perdidas | `parseSddSpec` lê `<feat>/spec.md` | módulos usam `requirements.md`+`design.md`+`decisions.md`+`tasks.md` (spec completa, marcadores 🟢🟡🔴 nativos) | parser reverse de feature-módulo; `requirements.md` como spec; `tasks.md` (T-NN) como tarefas | **N1** · M |
| **F3** | 0 ADRs (**afeta os DOIS modos**) | `parseDecisions` só casa `## D-NN —` em `_decisions/paradigm-decision.md` | attio: `## 5. Decisão ✅` (não casa) · okr: **`adrs/0001-*.md` já formatados** (Status/Contexto/Decisão/Consequências) + `<módulo>/decisions.md` (D-01…D-16) | ler `adrs/*.md` direto (copiar/linkar, não derivar); parser tolerante do `paradigm-decision.md` | **N1** · S (adrs prontos) / M (paradigm) |
| **F4** | 0 milestones no reverse | `MILE_ROW_RE` exige `\| M \| T \| demo \|` | reverse usa `## Ordem de build (bottom-up)` (bloco de código com ordem) | parser da "Ordem de build" → ondas; senão degrada honesto (1 onda + aviso `mapDegraded`) | **N1** · S |
| **F5** | soul não encontrado | `parseSoul` lê `.reversa/soul.md` | reverse: `.reversa/documentation/assets/data/soul.json` | fallback de path/formato (md **ou** json) | **N1** · S |
| **F6** | gaps/questions/US ignorados | não há parser p/ `gaps.md`, `questions.md`, `user-stories/` | okr: `gaps.md` (lacunas), `user-stories/*.md` (US-NN + AC), `<módulo>/questions.md` | alimentar `ir.gaps` de `gaps.md`/`questions.md`; US como referência preservada/linkada | **N2** · M |

### O que já está pronto para aproveitar (baixo custo, alto ganho)
- **ADRs reais** (`adrs/*.md`) — já no formato ADR; hoje viram 0 emitidos. Copiar/linkar é quase de graça (**F3/N1**).
- **Marcadores de confiança nativos** 🟢 CONFIRMADO / 🟡 INFERIDO / 🔴 LACUNA — vocabulário idêntico ao `fidelity-report` do DevFlow; a lib tem `scanMarkers` mas aponta para o `spec.md` inexistente. Redirecionar para `requirements.md` reaproveita tudo (**F2**).
- **`tasks.md` (T-NN)** com "origem no legado" — plano de execução pronto, mais rico que o `reconstruction-plan` genérico.

---

## 3. Recomendação

1. **N0 primeiro, sempre (barato e honesto).** Detecção de modo + aviso quando o reverse não é plenamente suportado. Elimina a falha silenciosa — hoje o importador "conclui" entregando PRD vazio e 0 ADRs, o que é pior que recusar. Isto sozinho já protege o cliente.
2. **N1 é o alvo de valor.** A maior parte do conteúdo reverse **já é parseável** com adaptação de path/heurística (features-módulo, ADRs prontos, ordem de build, soul.json). Esforço agregado ~M; destrava importação reverse útil.
3. **N2 é polimento** (gaps/US/traceability → `.context/engineering/`), fazer sob demanda.

> **F3 é o único achado que também degrada o modo suportado (forward):** nenhum Reversa real casa o formato de decisão esperado (só o fixture sintético). Corrigir F3 melhora **os dois** modos. Priorizar.

### Nota sobre a suíte de testes (dívida de fixture)
Os 96 testes passam porque o `makeReversaFixture` sintético modela **só** o layout forward idealizado — que nem o attio real casa 100% (decisões). **Recomendação:** adicionar fixtures reais (perfis `reverse` e `forward-real`) baseados em amostras de `attio`/`okr`, senão a suíte continua verde sobre um contrato que os projetos reais não cumprem.

---

## 4. Impacto no plano de teste (`2026-07-20-e2e-import-reversa-plan.md`)

A investigação **valida e reforça** o plano — e adiciona eixos:
- Usar **attio como controle positivo** (forward: deve importar com features/milestones/PRD) e **okr como caso reverse** (expõe a lacuna). O contraste é a métrica.
- Novo probe **IMP-DET-9 / IMP-BEH-9 — detecção de modo & degradação honesta:** o importador reconhece reverse e **avisa** (N0), em vez de entregar importação vazia declarando sucesso. Hoje: **MISS esperado** (não existe).
- Reetiquetar F1–F6 no defect-log como sintomas de **F0 (modo reverse não suportado)** — um item de backlog guarda-chuva no devflow, com N0/N1/N2 como fases.

---

## Anexo — comandos do contraste (do checkout devflow, só-leitura)

```bash
cd /home/walterfrey/Documentos/code/devflow
for P in reversa-com-attio reversa-modulo-odoo-17-okr; do
  echo "== $P =="
  node --input-type=module -e '
  import { runPipeline } from "./scripts/reversa-import/pipeline.mjs";
  const r=runPipeline({sourceDir:process.argv[1], now:"2026-07-20T12:00:00.000Z"});
  console.log("readiness", r.readiness.global, "| features", r.ir.features.length,
    "| milestones", r.ir.milestones.length, "| adrs", r.artifacts.adrs.length,
    "| prd", r.artifacts.prd.length+"B");
  ' "/home/walterfrey/Documentos/code/$P"
done
```
