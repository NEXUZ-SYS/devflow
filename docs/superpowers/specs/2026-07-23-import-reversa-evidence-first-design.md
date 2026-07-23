# Importador Reversa → DevFlow: de transpiler a carga de evidência

**Data:** 2026-07-23
**Estado:** design aprovado, pendente de plano de implementação
**Substitui, no que conflita:** `docs/superpowers/specs/2026-06-13-importador-reversa-devflow-design.md`
**Contexto anterior:** `docs/superpowers/2026-07-20-import-reversa-fidelity-findings.md`, `docs/superpowers/2026-07-20-import-reversa-f0-backlog.md`

---

## 1. O problema

O importador foi construído como **transpiler**: lê os artefatos do Reversa e deriva deles um plano DevFlow (PRD faseado, `stories.yaml`, `plans.json`). O backlog F0 tratou as falhas como bugs de parsing e propôs corrigi-las em três níveis (N0 detectar, N1 suporte reverse, N2 fidelidade plena).

O enquadramento estava errado. O planejamento é competência do DevFlow — fase P do PREVC, com brainstorming e humano no loop. Derivar plano por regex a partir de documento de terceiro produz, na melhor das hipóteses, um rascunho pior do que o que a fase P produziria; na pior, produz lixo com aparência de sucesso.

O redesenho: **o importador carrega evidência; o Planning autora o plano.**

### 1.1 Medições que motivam a mudança

Lib pura (`runPipeline`, só-leitura) contra os dois projetos Reversa reais, ambos v1.2.43, em 2026-07-23:

| | `reversa-com-attio` (forward) | `reversa-modulo-odoo-17-okr` (reverse) |
|---|---|---|
| features | 20 | 8 (**todas fantasma**) |
| tasks / milestones | 21 / 7 | 11 / **0** |
| decisions / ADRs emitidos | 0 / **0** | 0 / **0** |
| PRD | 1571 B | **211 B** (vazio) |
| bytes preservados no espelho | **1,2%** | **0,0%** |

**Aproveitamento do acervo (OKR):** de 45 arquivos / 207 KB em `_reversa_sdd/`, o importador abre **1** (`reconstruction-plan.md`) — 4,0% dos bytes.

**O corpus é vivo.** Entre 2026-07-21 e 2026-07-23, o `_reversa_sdd/` do OKR foi de 45 arquivos / 207 KB para **73 arquivos / 475 KB**: o pipeline `/reversa-migrate` completou (6/6 agentes, `status: complete`) e produziu 20 artefatos novos. Re-importação é caso comum, não exceção.

### 1.2 Três achados não registrados no backlog F0

**A. O gate N0 não é mecânico.** `write.mjs`, `readiness.mjs` e `consistency.mjs` não consultam `mode`. Verificado em tmpdir descartável: com `mode: "reverse"`, `writeArtifacts` gravou 12 arquivos sem consultar nada, incluindo `.context/plans/adrs.md` e `.context/plans/user-stories.md` — planos para diretórios que não são features. O controle existe na prosa da skill, não no mecanismo.

**B. Bug do marco sintético (afeta os dois modos).** Com 0 marcos parseáveis, `mapTasksToMilestones` atribui `milestone: null` a todas as tarefas; `emitPrd` sintetiza um `M1` e filtra por `t.milestone === "M1"` — nada casa, PRD sai vazio. `emitStories` trata o mesmo `null` corretamente e emite as 11 tarefas. **Os dois artefatos discordam sobre o mesmo IR.** E `mapDegraded` permanece `false` (a condição exige `milestones.length > 0`), então o aviso previsto na Etapa 4 do `SKILL.md` nunca dispara.

**C. O `state.json` é manifesto autoritativo ignorado.** `parseState` lê 5 campos. O arquivo declara `target.modules` (a lista de features), `redator_progress` com `units_total` e os arquivos produzidos, `checkpoints.*.files[]` por fase, `detective.adrs: 5`, `gaps_remaining: 0`, `confidence_overall: "~81%"`.

### 1.3 O achado que reorganiza o design: o handoff

O Reversa produz um artefato canônico de handoff, com template e checklist de validação próprios:

```
.claude/skills/reversa-migrate/references/templates/handoff.md    (5.2 KB)
.claude/skills/reversa-migrate/references/handoff-checklist.md    (2.1 KB)
```

O `handoff.md` real traz frontmatter tipado (`schemaVersion`, `kind: handoff`, `producedBy`, `hash`), ordem de leitura de 16 documentos, tabela de artefatos produzidos com status, bloqueadores explícitos, itens referidos à codificação (`RC-01…RC-05`) e próximos passos.

**É o índice que o design anterior propunha construir do zero — com fidelidade melhor.**

Mais: os 18 `.md` de `migration/` têm frontmatter com `kind:` e `producedBy:`, e `migration/.state.json` lista 30 artefatos com hash. Contra 1 de 43 arquivos com frontmatter no acervo de análise mais antigo.

### 1.4 O corpus tem três camadas, não uma

| Camada | Onde | Natureza |
|---|---|---|
| **Controle** | `.reversa/` | `state.json`, `soul.md`, `plan.md`, `chronicle.md`, `version` |
| **Evidência** | `_reversa_sdd/*.md` | análise; sem frontmatter; metadados em blockquote de prosa |
| **Design** | `migration/` (OKR) ou `_plan/` + `_decisions/` (attio) | saída projetada, tipada, com decisões humanas registradas |

A camada de design tem forma diferente por projeto e por pipeline. Exige resolução em cascata, não caminho fixo.

---

## 2. Decisões

| # | Decisão | Escolha |
|---|---|---|
| D1 | O que o importador emite por conta própria | **Híbrido** — converte só o que é 1:1 real (ADRs); o resto é evidência; o plano nasce no Planning |
| D2 | Onde a evidência aterrissa | **Espelho + promoção curada** — espelho imutável é a verdade de origem; promoção às camadas DDC é curada via `devflow:knowledge` |
| D3 | Seam com o PREVC | **Fluxo contínuo** — o importador termina invocando o Planning com a âncora na mesa |
| D4 | O que o DevFlow faz com o ledger de confiança | **Restrição do plano** — evidência 🟡 gera passo de verificação atrelado, observado na fase V (ADR-013) |
| D5 | Vale para os dois modos | **Uniforme** — forward e reverse seguem o mesmo caminho; o modo vira metadado de proveniência |
| D6 | Conflitos internos do corpus | **Detecta e apresenta** — primeira pauta do brainstorming; não bloqueia |
| D7 | Como tratar a camada de design | **Âncora + RC e parity tests estruturados** — o handoff é pauta principal; RC viram restrições candidatas; `.feature` entram declarados |

### 2.1 Racional das decisões não óbvias

**D1 (híbrido, não "tudo como rascunho").** Um rascunho pré-preenchido carregaria adiante, em silêncio, defeitos que estão na fonte: os IDs `T-01…T-08` colidem entre `to_okr` e `to_okr_project`; os `BR-NN` são locais por unit com numeração global divergente em `domain.md`; e há planos concorrentes no corpus. Um humano no Planning resolve; um emitter não.

**D2 (espelho, não distribuição automática).** Gerar frontmatter para 43 documentos de terceiro e injetá-los como knowledge do projeto acumula dois problemas: inflação de contexto (475 KB entrando no orçamento de todo Planning) e superfície de injeção — que o invariante M1 do próprio importador já reconhece.

**D5 (uniforme, com custo declarado).** No forward a derivação **não é invenção**: o attio tem tabela `## Marcos demonstráveis` real (M1–M7, ancorados em T04/T08/T10…). Adotar o caminho uniforme troca automação real por curadoria nesse caso. A alternativa — dois pipelines — significa manter duas suítes e duas fixtures para sempre, e a dívida de fixture é a causa-raiz de todos os defeitos aqui.

**D7 (estruturado, não convertido).** Converter Gherkin em teste DevFlow não é 1:1 — o alvo é `unittest` do Odoo, e o mapeamento passa por decisão de design. Fazer isso no importador reintroduziria o transpiler. **Registrar não é converter.**

---

## 3. Arquitetura

### 3.1 Pipeline

```
Antes:  detect → parse → map → validate-plan → reconcile → emit(PRD,stories,plans,ADRs) → write
Depois: detect → resolve-handoff → classify → ledger → consistency → convert(ADRs) → land → invoke Planning
```

### 3.2 Unidades

| Unidade | Destino | Papel |
|---|---|---|
| `detect.mjs` | mantém | `isReversa`; já aceita `sdd` **ou** `forward` |
| `mode.mjs` | rebaixado | metadado de proveniência, não gate de aborto |
| `handoff.mjs` | **novo** | resolve a âncora em cascata; extrai ordem de leitura, tabela de artefatos, bloqueadores, próximos passos, itens RC |
| `classify.mjs` | **novo** | classificação em dois níveis com `kindSource` auditável |
| `ledger.mjs` | **novo** | agrega 🟢🟡🔴; absorve RC como constraints; lê tags `@paridade`/`@conformidade` |
| `readiness.mjs` | **dissolvido** | a pergunta "pronto para transpilar?" deixa de existir |
| `consistency.mjs` | reapontado | valida evidência, não IR derivado |
| `emitters/adrs.mjs` | reescrito | lê `adrs/*.md` reais; para de derivar de `_decisions/` |
| `emitters/index.mjs` | **novo, pequeno** | aponta ao handoff; registra o que ele não cobre; não duplica |
| `emitters/preserve.mjs` | reescrito | espelho preservando estrutura, com envelope |
| `write.mjs` | mantém + layout-aware | guards preservados; destino de ADR detectado |
| `prd.mjs`, `stories.mjs`, `plans.mjs`, `map.mjs` | **removidos** | — |
| `ir.mjs` | remodelado | de IR-de-plano para IR-de-evidência |

### 3.3 Resolução da âncora (cascata)

1. Artefato com `kind: handoff` em frontmatter (hoje: `_reversa_sdd/migration/handoff.md`)
2. `_reversa_sdd/_plan/implementation-plan.md` (forma do attio)
3. `_reversa_sdd/reconstruction-plan.md` (fallback)
4. **Nenhuma** → registra ausência explícita; o Planning começa só da evidência

O caso 4 é comportamento de primeira classe, não erro. Sem âncora, não se inventa plano.

### 3.4 Classificação em dois níveis

**Autoritativo** (preferido): frontmatter `kind:` → `migration/.state.json` artifacts map → tabela de artefatos do handoff.
**Heurístico** (fallback): só para o que sobrou sem tipo.

Cada artefato carrega `kindSource` (`frontmatter` | `manifest` | `handoff-table` | `heuristic`), tornando a classificação auditável.

Isto elimina as features-fantasma na raiz. Não é `listFeatureDirs` corrigido — é tipagem autoritativa. Prova de que a heurística degrada: as features-fantasma foram de 7 para 8 quando `screens/` apareceu.

### 3.5 IR de evidência

```
project      ← state.json
provenance   ← mode, versão do Reversa, pipelines detectados
handoff      ← âncora resolvida (ou ausência explícita)
artifacts[]  ← path, kind, kindSource, camada DDC sugerida, confiança, hash
ledger       ← contagens 🟢🟡🔴 + constraints[] (RC-NN → alvo, risco, origem)
testInputs[] ← .feature: cenários, tags, alvo declarado — sem conversão
adrs[]       ← convertidos de adrs/*.md
conflicts[]  ← divergências internas do corpus
```

### 3.6 Consequências

- **`readiness` removido, não consertado.** O falso-red (`global: red`, 7 stubs) vinha de perguntar se a fonte estava pronta para transpilar. Some o gate, o falso-positivo e o código.
- **Bug do marco sintético some por construção.** Não há `emitPrd`. Resolve nos dois modos sem correção dedicada.
- **O gate mecânico muda de alvo.** A escrita passa a produzir espelho fiel + índice — correto nos dois modos. O que precisa de guarda mecânica é a **fronteira do espelho**, que `write.mjs` já implementa e testa.

---

## 4. Aterrissagem

### 4.1 Layout de destino

```
.context/
├── imported/reversa/
│   ├── <estrutura da origem, byte-a-byte>
│   ├── INDEX.md
│   └── manifest.json
├── engineering/adrs/   (layout v2)  ou  adrs/  (layout v1)
└── workflow/           ← o importador NÃO escreve aqui
```

O destino das ADRs é **detectado** (presença de `.context/engineering/` ou `.layout-version ≥ 2`), não hardcoded.

> **Achado adjacente, correção separada:** `skills/adr-builder/SKILL.md` declara `.context/adrs/` canônico e "NEVER elsewhere", mas `skills/migration/SKILL.md` move `.context/adrs/ → .context/engineering/adrs/` na migração DDC v2. O doc do `adr-builder` está desatualizado. Fora do escopo desta feature.

### 4.2 Espelho: estrutura preservada, com envelope

O `planPreserve` atual conhece **dois nomes de arquivo** (`spec.md`, `screens.md`) e os achata em `<slug>/spec.md`. Resultado medido: 1,2% dos bytes no attio, 0,0% no OKR (8 de 8 entradas apontando para arquivos inexistentes).

O espelho passa a copiar a árvore com os nomes que ela tem:

```
_reversa_sdd/migration/parity_tests/04-matriz-rbac.feature
  → .context/imported/reversa/_reversa_sdd/migration/parity_tests/04-matriz-rbac.feature
```

Isto é requisito funcional, não estética: as 16 referências relativas da ordem de leitura do handoff só resolvem se a estrutura existir.

**Envelope.** Necessário: `_reversa_sdd/` + `_reversa_forward/` do attio somam **354 arquivos / 17,1 MB** — e `_reversa_sdd/screenshots/` sozinho é **16,3 MB (95%)**, com 107 PNGs e 75 YMLs de transcrição. Copiar a árvore inteira levaria 16 MB de imagem para dentro de `.context/`.

A regra é por **escopo, tipo e tamanho** — não por lista de diretórios (que seria frágil: `screenshots/` vive *dentro* de `_reversa_sdd/`).

**Escopo considerado:**
- `_reversa_sdd/**` e `_reversa_forward/**` — integralmente
- de `.reversa/`, apenas: `state.json`, `soul.md`, `plan.md`, `chronicle.md`, `version`
- fora do escopo, nunca visitado: `.reversa/_browser_profile/`, `.reversa/context/captures/`, `.reversa/documentation/`

**Disposição, dentro do escopo:**

| Condição | Disposição |
|---|---|
| Texto (`.md`, `.yml`, `.yaml`, `.json`, `.feature`, `.txt`) ≤ 256 KB | `mirrored` — copiado com caminho e nome originais |
| Texto > 256 KB | `linked` |
| Qualquer binário (`.png`, `.jpg`, `.mp4`, …), de qualquer tamanho | `linked` |

`linked` = registrado no INDEX com caminho absoluto na origem, tamanho e hash; não copiado. A referência e a verificação de integridade ficam; o peso não.

**Efeito medido** (regra aplicada ao corpus real do attio): **1,8 MB `mirrored`, 15,2 MB `linked`** — de 17,1 MB. O volume espelhado é maior do que só os `.md` porque os 75 YMLs de transcrição de `screenshots/` são texto e entram (menos um, de 718 KB, que passa do teto e vira `linked`); são evidência legítima, não asset. O OKR espelha praticamente tudo: nenhum de seus textos chega perto do teto (maior é `target_business_rules.md`, 26,6 KB).

O teto de 256 KB é configurável, não constante mágica.

Guards do `write.mjs` continuam por cima: nada fora de `.context/`, symlink recusado, sobrescrita só com confirmação.

**In-place:** espelha também. O projeto OKR não é repositório git — sem histórico, e com origem móvel, o espelho é o único ponto de congelamento do que o plano assumiu.

### 4.3 INDEX.md

Curto por design. Por artefato: caminho no espelho, `kind`, `kindSource`, camada DDC sugerida, confiança, hash. Mais: âncora resolvida (qual, por qual regra), `conflicts[]`, resumo do ledger.

### 4.4 O que o Planning recebe

Orçamento de contexto é decisão de design: 475 KB e crescendo não cabem em prompt algum.

1. **A âncora** — o `handoff.md` (10,7 KB), inteiro
2. **`conflicts[]`** — primeira pauta do brainstorming
3. **Resumo do ledger** — contagens + `RC-01…RC-05` como constraints com alvo e risco
4. **`testInputs[]`** — os `.feature` declarados: cenários, tags, alvo (ponteiro, não conteúdo)
5. **O INDEX** — mapa do resto, puxável sob demanda

O corpus permanece no espelho, acessível, fora do prompt.

### 4.5 Invocação e enquadramento

O `import-reversa` termina chamando `prevc-flow`, com instrução explícita: **o handoff é rascunho sob revisão, não plano aprovado.**

O reforço do invariante M1 fica mais importante aqui do que antes: o handoff é texto de terceiro **endereçado a um agente de codificação** e contém imperativos diretos ("implemente por camada", "não introduza camada de serviço", "jamais descreva como paridade"). Entra como **proposta a avaliar**, nunca como comando a obedecer. `stripInjection` continua; a moldura de apresentação deve deixar o status de rascunho inequívoco.

### 4.6 Re-importação

`manifest.json` guarda hash por arquivo; `reimport-diff.mjs` já existe. Na re-importação: mostra o que mudou/sumiu na origem; **nunca** sobrescreve sem confirmação. ADR convertida e depois editada no destino é preservada — o diff avisa, o humano decide.

### 4.7 Degradação

| Situação | Comportamento |
|---|---|
| Origem não é Reversa | erro com `reasons`; nada escrito |
| Nenhuma âncora | degrada explícito; Planning parte só da evidência |
| Artefato sem tipo | heurística, marcado `kindSource: heuristic` |
| Conflitos no corpus | vão para a pauta; não bloqueiam |
| Espelho vs. WIP no destino | confirmação; nunca apaga |

---

## 5. Testes

### 5.1 A dívida de fixture é a causa-raiz

**101/101 verde** hoje, sobre um `makeReversaFixture` sintético que modela só o forward idealizado. Todos os defeitos desta análise passaram por baixo dessa suíte. Corrigir o código sem corrigir a fixture reproduz o problema na próxima versão do Reversa.

A fixture não cobre nem o forward real: o attio usa `## 5. Decisão — ✅ APROVADA por Walter`, e `pending-decisions.md` usa `## D1 — …` (heading, não bullet `- D-NN:`). Nenhum casa os regexes de `parsers/decisions.mjs` — **0 decisões nos dois projetos**, confirmado empiricamente.

### 5.2 Quatro perfis de fixture

Derivados dos reais, **não cópias** (os projetos Reversa são read-only; o sandbox E2E é intocável).

| Perfil | Modela | Cobre |
|---|---|---|
| `forward-real` | attio | `_reversa_forward/NNN-slug/`, `_decisions/paradigm-decision.md` no formato real, `_plan/`, tabela `## Marcos demonstráveis` |
| `reverse-analysis` | OKR pré-migração | artefatos de análise, dirs-módulo, `adrs/*.md` prontos, sem `spec.md` |
| `reverse-migration` | OKR hoje | `migration/` com `kind:`, `handoff.md`, `.state.json`, `parity_tests/` |
| `no-anchor` | degradação | só `reconstruction-plan.md`, sem handoff |

### 5.3 Cobertura

TDD obrigatório: RED → GREEN → REFACTOR. Testes reais, não content checks.

- **`handoff.mjs`** — cascata na ordem correta por perfil; `no-anchor` retorna ausência explícita, não `null` silencioso
- **`classify.mjs`** — `kindSource` correto por origem; `screens/` não vira feature em `reverse-migration`; heurística só age no que não tem tipo
- **`ledger.mjs`** — contagens; RC viram constraints com alvo e risco; tags `@paridade`/`@conformidade` lidas
- **`preserve`** — árvore e nomes preservados; envelope respeitado; acima do teto vira `linked`; **e os caminhos relativos do handoff resolvem dentro do espelho**
- **`emitters/adrs`** — os 5 ADRs de `reverse-analysis` convertem; `Consequências` tem destino
- **`write`** — destino de ADR layout-aware (v1 vs v2)
- **Segurança** — traversal, symlink, `stripInjection`, `confirmOverwrite` preservados; **novo:** teste de que os imperativos do handoff entram emoldurados como proposta
- **Regressão de contrato** — golden do `INDEX.md` por perfil

Os testes de `prd`, `stories`, `plans`, `map` e `readiness` saem com as unidades. Testavam um contrato aposentado.

---

## 6. Escopo

**Dentro:** `handoff.mjs`, `classify.mjs`, `ledger.mjs`, `emitters/index.mjs`; reescrita de `adrs.mjs` e do preserve; `consistency` reapontado; `write.mjs` layout-aware; remoção de `prd`/`stories`/`plans`/`map`/`readiness`; reescrita do `SKILL.md`; os 4 perfis de fixture.

**Fora, deliberadamente:**

| Item | Por quê |
|---|---|
| Gherkin → código de teste | Registrado, não convertido — é a linha que separa isto do transpiler |
| Promoção automática às camadas DDC | D2 é curada, via `devflow:knowledge`; fluxo separado |
| Doc drift do `adr-builder` | Achado adjacente; correção própria |
| Suporte a `glab` | Lacuna conhecida, não desta feature |

---

## 7. Mudança de contrato

Isto **remove comportamento publicado**. Desde a v1.31.0 o importador emite PRD, `stories.yaml` e `plans.json`; depois disto, não emite — quem emite é o Planning.

- **Reverse:** ganho puro (a saída era vazia ou fantasma)
- **Forward:** troca real — some a derivação automática dos M1–M7 do attio, entra curadoria

Tratar como **minor com nota de breaking** no CHANGELOG; `SKILL.md` deve explicar a mudança de contrato.

---

## 8. Aberto

**Planos concorrentes no corpus do OKR, sem resolução declarada.** O `handoff.md` manda construir `okr_core`/`okr_project` com topologia "modernizar"; o `reconstruction-plan.md` descreve 11 tarefas sobre `to_okr`, fidelidade-primeiro. Os dois coexistem no disco, e o handoff **nunca declara** o outro superado. Regra "mais novo vence" seria adivinhação — são pipelines diferentes, não versões.

Isto vai para `conflicts[]` e é pauta do Planning. É o caso de uso de D6, e um exemplo de por que a reconciliação pertence ao brainstorming e não a um emitter.

**Conflito de dado menor, mesma origem:** `migration_brief.md` cita "9 record rules"; `confidence-report.md` registra a correção `9 ir.rule → 7 ir.rule (okr.node, 462–468)`.

---

## Anexo — comandos de verificação (só-leitura)

```bash
cd /home/walterfrey/Documentos/code/devflow

# Estado atual do pipeline contra os dois projetos reais
node --input-type=module -e '
import { runPipeline } from "./scripts/reversa-import/pipeline.mjs";
for (const P of ["reversa-com-attio","reversa-modulo-odoo-17-okr"]) {
  const r = runPipeline({ sourceDir: `/home/walterfrey/Documentos/code/${P}`, now: "2026-07-23T12:00:00.000Z" });
  console.log(P, r.mode, r.readiness.global, r.ir.features.length, r.ir.milestones.length,
              r.artifacts.adrs.length, r.artifacts.prd.length);
}'

# Suíte atual
node --test "tests/reversa-import/*.test.mjs"
```
