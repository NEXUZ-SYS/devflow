---
type: adr
name: default-standards-library
description: Standards default passam a ser materializados no projeto (.md + machine/*.js) via sync de procedência, em vez de apenas live-loaded do plugin
scope: organizational
source: local
stack: universal
category: principios-codigo
status: Proposto
version: 3.0.0
created: 2026-09-02
supersedes: [007-default-standards-library-v2.2.0]
refines: [002-adopt-standards-triple-layer-v1.0.0]
protocol_contract: null
decision_kind: firm
summary: "Evolução major: os standards default aplicáveis deixam de existir apenas dentro do plugin e passam a ser materializados em .context/engineering/standards/ do projeto — .md e machine/*.js — por project-init, context-sync e uma rotina periódica, todos delegando ao provenance-sync. O modelo anterior (live-merge exclusivo, cópia só via eject manual) foi escolhido porque não havia como atualizar cópias sem drift; o provenance-sync (v1.23.0) passou a existir depois e remove essa razão. O live-merge NÃO é removido — continua sendo o caminho pelo qual um default novo vale imediatamente. Os invariantes de fetch da v2.2.0 permanecem literais: machine/*.js seguem nunca sendo fetchados da rede; a materialização copia do bundle local."
---

# ADR 007 — Standards default materializados no projeto via sync de procedência

## Contexto

Da v1.0.0 à v2.2.0 esta ADR consolidou um modelo: os ~26 standards default vivem em
`assets/standards/` do plugin, são *live-merged* por `loadStandardsMerged` em tempo de
lint, e **nunca** tocam o filesystem do projeto; customizar exige `devflow standards
eject <id>`, manual e um por vez. A razão de não copiar está registrada e era concreta:
**não existia mecanismo para atualizar uma cópia sem drift**. Um "standards-reconcile"
foi explicitamente recusado, e corretamente — reconciliação sem proveniência ou
sobrescreve a edição do usuário ou congela o artefato.

Três custos se acumularam: **invisibilidade** (nada em `.context/` revela os 26
standards que governam o projeto — não há o que revisar em PR nem o que outra IA leia
sem o plugin), **editabilidade apenas teórica** (o `eject` exige um comando por
standard e quase nunca roda) e **zero autonomia** (sem o plugin, nem texto nem
enforcement).

O que mudou: o **`provenance-sync`** (`scripts/lib/provenance-sync.mjs`, v1.23.0,
2026-06-17) passou a existir e resolve exatamente o problema que fundamentava a
recusa — distingue deploy intocado (atualiza) de edição local (preserva e reporta)
por hash, com registry histórico. Já governa skills e standards de perfil (ADR-008)
e o scaffold de CI (ADR-012). A premissa da decisão anterior deixou de ser verdadeira.

## Decisão

1. **Os defaults aplicáveis são materializados** em `.context/engineering/standards/`
   (`.md` **e** `machine/*.js`) por `project-init`, `context-sync` e uma rotina
   periódica, todos delegando ao mesmo `applySync`: um código, três gatilhos.
2. **Seleção por aplicabilidade real:** um default entra se **algum caminho real do
   repositório** casa com seu `applyTo`, pelo mesmo predicado do lint — casar contra
   caminhos reais, e não extensões sintetizadas, é o que impede um projeto sem `src/`
   de receber os standards `src/**`.
3. **A cópia do `.md` reescreve `enforcement.linter`** para a forma canônica do projeto
   (`engineering/standards/machine/std-<id>.js`), porque `resolveAndCheckSandbox` resolve
   o path contra bases diferentes por origem.
4. **O `provenance-sync` ganha `transform`:** o `pluginHash` é computado sobre os bytes
   **transformados**, não sobre os de origem.
5. **`gen-known-hashes` indexa `assets/standards/` raiz** — hoje excluída — com backfill
   sobre o histórico de commits.
6. **Escape hatch** `standards.materialize: false` em `.devflow.yaml` (parser do
   ADR-011), default ligado.

## Preservações

O **live-merge não é removido:** segue ativo e é o caminho pelo qual um default novo do
plugin vale **imediatamente**, antes de qualquer materialização — o merge por id
(projeto ganha do default) faz a cópia sombrear o bundlado sem mudança no loader. Os
invariantes da v2.2.0 permanecem **literais**, e a distinção importa:
`update-default-standards.sh` segue fetchando **apenas `.md`**, e `machine/*.js`
continuam **nunca sendo buscados da rede** — a materialização copia os `.js` do
**bundle local do plugin**, já revisado no release, operação distinta do fetch remoto
que o guardrail anti-RCE proíbe. SI-4, trust-anchor, fail-closed e o sandbox
origin-aware ficam byte-idênticos.

## Alternativas Consideradas

- **Manter live-load exclusivo (status quo v2.2.0)** — preserva o TCB e custa zero,
  mas mantém os três custos; falhou por uso, não por design.
- **Cópia congelada no init** — simples, e reintroduz o drift que a recusa original
  evitava: um projeto de março nunca receberia o std novo.
- **Copiar só o `.md`, linters seguem no plugin** — preserva o TCB integralmente,
  mas o projeto segue sem enforcement quando o plugin não está presente.
- **✓ (escolhida) Materialização com sync de procedência** — entrega visibilidade,
  editabilidade, autonomia e enforcement local, e a atualização é resolvida pelo
  mecanismo que passou a existir.

## Consequências

**Positivas.** Os três custos do Contexto caem: os standards viram artefato revisável em
PR, o enforcement sobrevive sem o plugin, e customizar deixa de exigir comando por id.

**Negativas, aceitas.** De 17 a 26 arquivos a mais em `.context/engineering/`, até 20
deles `.js` executáveis invocados a cada Edit/Write: a superfície de execução muda do
TCB do plugin para o repo, em paridade com o que o ADR-008 já estabeleceu para os
linters de perfil. A divergência é **detectada e reportada** por hash, não bloqueada —
a variante fail-closed fica adiada, não esquecida. Um projeto que adota linguagem nova
só recebe os standards dela na passada seguinte da rotina (≤7 dias).

## Guardrails

- SEMPRE reescrever `enforcement.linter` para o caminho canônico do projeto ao materializar
  — NUNCA para `null`, que num default enforçado desliga 20 linters silenciosamente.
- SEMPRE computar o hash de procedência sobre os bytes **transformados** — NUNCA sobre
  os de origem, que classificariam todo projeto como `edited` já na primeira passada,
  congelando o sync.
- NUNCA fetchar `machine/*.js` da rede: a materialização copia do bundle **local**
  do plugin; o guardrail anti-RCE da v2.2.0 permanece literal e intacto.
- SEMPRE honrar `standards.local.yaml` `disable:` — id desabilitado não é escrito.
- SEMPRE manter o live-merge ativo — é ele que faz um default novo valer antes de a
  materialização convergir.
- QUANDO o hash de um linter materializado divergir do bundlado ENTÃO reportar no
  sync e no doctor — NUNCA sobrescrever silenciosamente.
- NUNCA materializar standard de perfil por esta via — perfis seguem o ADR-008.

## Enforcement

- [ ] Teste: após materializar um default enforçado, `enforcement.linter` != `null` e o linter **executa**
- [ ] Teste: `transform` idempotente; 2ª passada é `current`; edição local vira `edited` e é preservada
- [ ] Teste (regressão): `gen-known-hashes` indexa a raiz `assets/standards/` e `update-default-standards.sh` segue sem fetchar `.js`
- [ ] Teste: `standards.materialize: false` é no-op; id em `disable:` não é materializado

## Evidências

**Referências internas:** spec `docs/superpowers/specs/2026-09-02-standards-materialize-on-init-design.md` · `scripts/lib/provenance-sync.mjs` (v1.23.0) como mecanismo habilitante · ADR-002 (standards em 3 camadas, refinada) · ADR-008 (artefatos de perfil copiados — precedente de `origin: project` para linters) · ADR-011 (parser único de `.devflow.yaml`) · ADR-012 (scaffold verbatim governado por proveniência de hash). Substitui `007-default-standards-library-v2.2.0`, cujos invariantes de fetch e sandbox são preservados integralmente.
