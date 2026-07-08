---
type: adr
name: devflow-config-single-parser
description: Parser único de .devflow.yaml (scripts/lib/devflow-config.mjs) consumido por hook e skills — sem re-parse ad-hoc por consumidor.
scope: organizational
source: local
stack: universal
category: arquitetura
status: Proposto
version: 1.0.0
created: 2026-07-08
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: "Um único parser de .devflow.yaml (devflow-config.mjs) — hook e skills consomem a mesma lib, com fallback idêntico; nunca re-parsear config com grep/awk ad-hoc por consumidor."
---

# ADR — Parser único de `.devflow.yaml` (lib compartilhada)

- **Data:** 2026-07-08
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** universal (Node + hooks bash)
- **Categoria:** Arquitetura

---

## Contexto

Múltiplos consumidores leem `.context/.devflow.yaml` cada um à sua maneira: `hooks/post-tool-use` parseia `git.autoFinish`/`git.versioning` em Python/PyYAML; a skill `prevc-confirmation` re-parseia em bash (`awk -F: '{print $2}'`). Os dois **divergem** para a forma granular de `autoFinish`: a skill lê como "ausente" (menu) e o hook sem PyYAML cai em "disabled" — dois comportamentos errados para o **mesmo** YAML, dependentes de ambiente. O `awk` não remove comentário inline (mesma classe do bug do parser de `permissions.yaml`). Não há lib de config compartilhada.

## Decisão

Adotar `scripts/lib/devflow-config.mjs` como **parser único** de `.devflow.yaml`: `readAutoFinish() → 'disabled' | 'all' | { bump, commit, push, merge }` e `readVersioning() → 'local' | 'pipeline' | 'none'`, com strip de comentário inline e **fallback explícito idêntico**. Todos os consumidores (hook `post-tool-use`, skill `prevc-confirmation`, scripts) passam a usar a lib — o hook chama `node devflow-config.mjs` em vez do Python inline. Fim do re-parse por consumidor e da divergência entre ambientes.

## Alternativas Consideradas

- **Skill consome o `auto_finish_context` do hook** — sem lib nova; mais leve, mas mantém dois parsers (risco de drift).
- **Lib compartilhada só na skill** (hook fica Python inline) — meio-termo; dois parsers coexistem até um follow-up.
- **Lib única consumida por hook E skill** ✓ — um parser, um fallback, testável; elimina a divergência na raiz.

## Consequências

**Positivas**
- Parser único e testável; fallback idêntico com e sem PyYAML.
- Hook e skill alinhados; padrão para futuros consumidores de config.
- Remove classe de bug (comentário inline, granular mal-lido).

**Negativas**
- Toca o `hooks/post-tool-use` (arquivo sensível) — troca Python inline por chamada `node`.

**Riscos aceitos**
- Regressão no hook → mitigada por teste de regressão + teste de paridade hook×skill.

## Guardrails

- SEMPRE ler campos de `.devflow.yaml` via `scripts/lib/devflow-config.mjs`.
- NUNCA re-parsear `.devflow.yaml` com grep/awk/regex ad-hoc por consumidor.
- SEMPRE remover comentário inline (`\s+#.*$`) ao ler um valor de config (a lib faz isso).
- QUANDO um consumidor precisar de `autoFinish`/`versioning`, ENTÃO usar a lib, com fallback idêntico entre ambientes (com/sem PyYAML).
- NUNCA permitir que dois parsers de config divirjam.

## Enforcement

- [ ] Teste: unit da lib — escalar true/false, ausente, granular completo/parcial, comentário inline, YAML inválido→fallback.
- [ ] Teste: paridade hook×skill — mesmo YAML → mesma classificação (incl. sem PyYAML).
- [ ] Lint/guard: rejeitar re-parse ad-hoc de `.devflow.yaml` (grep por `autoFinish`/`versioning` + `awk`/`grep` fora de `devflow-config.mjs`).
- [ ] Code review: novo consumidor de config importa a lib, não re-parseia.

## Evidências / Anexos

**Fontes oficiais:** [YAML 1.2 spec](https://yaml.org/spec/1.2.2/) · [Node.js util.parseArgs](https://nodejs.org/api/util.html#utilparseargsconfig)

```js
// scripts/lib/devflow-config.mjs — contrato (parser único)
import { readFileSync } from "node:fs";
export function readAutoFinish(src) {
  const raw = stripInlineComment(getField(src, "autoFinish")); // tira "  # nota"
  if (raw === "" || raw === "false") return "disabled";
  if (raw === "true") return "all";
  return parseGranular(src); // { bump, commit, push, merge } — não-listada = false
}
// hook e skill: import { readAutoFinish } from ".../devflow-config.mjs" — nunca awk
```
