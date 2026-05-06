---
type: adr
name: <slug-do-adr>
description: <resumo em uma linha do que esta ADR decide>
scope: organizational   # organizational | project
source: local           # local | external
stack: <linguagem/plataforma ou "universal">
category: <principios-codigo | qualidade-testes | arquitetura | seguranca | infraestrutura | protocol-contracts | agent-harness>
status: Proposto        # Proposto | Aprovado | Substituido | Descontinuado
version: 0.1.0          # semver — incrementar a cada revisão aprovada
created: YYYY-MM-DD
supersedes: []          # lista de slugs de ADRs substituídas (metadado estrutural, não conteúdo)
refines: []             # ADR-pai que esta refina (ex: SLO refina arquitetura). Metadado de navegação humana — ver Hard Rule #12
protocol_contract: null # nome do contrato + versão quando category=protocol-contracts (ex: "PosV1"); null caso contrário
decision_kind: firm     # firm | gated | reversible. "gated" marca portão de revisão futura; "reversible" marca experimento
# OPCIONAL (v1.0+) — Y-statement curto (≤ 240 chars). Quando presente, session-start
# usa este campo no <ADR_GUARDRAILS> Stage-1 disclosure ao invés do título nu.
# Recomendado para ADRs em status Aprovado quando o índice tem >5 ADRs.
summary: ""
---

# ADR — <Título Curto da Decisão>

- **Data:** YYYY-MM-DD
- **Status:** Proposto
- **Escopo:** <Organizacional | Projeto>
- **Stack:** <Python | Node | universal | ...>
- **Categoria:** <Princípios de Código | Qualidade & Testes | Arquitetura | Segurança | Infraestrutura | Protocol Contracts | Agent Harness>

---

<!--
DENSIDADE: ADR é gatilho semântico para leitor técnico (humano ou IA), não tutorial.
Total do documento: 80-120 linhas (~100 ideal). Jamais explique conceitos técnicos correntes
(SRP, FSD, tree-shaking, RBAC, idempotência, etc.) — o leitor já sabe.
-->

## Contexto

<!-- 4-6 linhas. Frases curtas. Stack + camada + dor. Sem parágrafos expositivos. -->
<Dor técnica específica desta stack nesta camada. Keywords > prosa.>

## Drivers (opcional — omitir se ≤2 forças)

<!--
OPCIONAL (v1.0+). Materializar apenas em decisões com 4+ forças concorrentes
(latência + custo + segurança + manutenção, por exemplo). Cabe nas 80–120 linhas
se bullets ≤8 palavras. Audit emite warning se a seção existir com <3 bullets.
-->

- <força técnica 1>
- <força técnica 2>
- <força técnica 3>

## Decisão

<!-- 4-6 linhas + opcionalmente 1 diagrama ASCII curto (5-8 linhas). Voz ativa afirmativa. -->
<Adoção inequívoca. Nome da stack, papel na camada, o que entra e o que não entra.>

## Preservações

<!--
OPCIONAL — materializar apenas em decisões brownfield (substituição ou evolução de sistema existente).
O que fica intocado pela decisão. Bullets curtos, keyword-heavy. Omitir a seção inteira se não aplicável.
-->

- SEMPRE manter <componente/contrato preservado>
- <pattern/módulo/API que não muda>

## Alternativas Consideradas

<!-- Uma linha por opção. Tradeoff em ≤ 12 palavras. -->
- **<Alternativa 1>** — <tradeoff curto>
- **<Alternativa 2>** — <tradeoff curto>
- **<Alternativa escolhida>** ✓ — <razão curta>

## Consequências

<!-- Bullets no formato `trigger → outcome` ou keywords. Sem parágrafos. -->

**Positivas**
- <causa → efeito>
- <keyword1, keyword2, keyword3>

**Negativas**
- <custo curto>
- <tradeoff curto>

**Riscos aceitos**
- <risco → mitigação implícita>

## Guardrails

<!-- Regras acionáveis verificáveis em code review. SEMPRE/NUNCA/QUANDO…ENTÃO. -->

- SEMPRE <regra positiva>
- NUNCA <padrão proibido>
- QUANDO <gatilho>, ENTÃO <ação>

## Enforcement

<!-- Mecanismos concretos. Ferramenta + o que verifica. -->

- [ ] Code review: <item verificável curto>
- [ ] Lint: <ferramenta + regra>
- [ ] Teste: <o que cobre>
- [ ] Gate CI/PREVC: <fase + check>

## Evidências / Anexos

<!--
Apenas fontes oficiais e RFCs. PROIBIDO: Medium, dev.to, blogs, tutoriais, Stack Overflow, YouTube.
UM único exemplo de código minimal (15-20 linhas) demonstrando o padrão, não a implementação completa.
-->

**Fontes oficiais:** [<nome>](<url-oficial>) · [<spec>](<url-oficial>)

```<linguagem>
// exemplo minimal — demonstra o padrão, não a feature
```
