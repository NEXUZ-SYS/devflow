---
type: adr
name: framework-profile-scoped-standards
description: Artefatos condicionais a framework (Standards e skills) moram sob assets/<classe>/profiles/<fw>/ e são copiados no init — localização é o contrato de registro; perfis não contribuem agents
scope: organizational
source: local
stack: universal
category: principios-codigo
status: Proposto
version: 1.2.0
created: 2026-06-09
supersedes: []
refines: [002-adopt-standards-triple-layer-v1.0.0]
protocol_contract: null
decision_kind: firm
summary: "Artefatos condicionais a um framework moram num subdir bundled assets/<classe>/profiles/<fw>/ e são COPIADOS para o .context/ do projeto quando o perfil casa. A v1.1.0 generaliza a regra de Standards para SKILLS e enuncia a razão dura: o Claude Code REGISTRA todo skills/<nome>/ e agents/<nome>.md do plugin em todo projeto, sem opt-out — logo LOCALIZAÇÃO É O CONTRATO DE REGISTRO, e morar em skills/ significa estar no vocabulário global. A v1.2.0 corrige a precisão dessa premissa sem alterar a decisão: o que não tem opt-out é o REGISTRO; a superfície de MENU tem (user-invocable: false) e a invocação pelo modelo também (disable-model-invocation: true). Nenhuma das duas desregistra a skill, então nenhuma substitui mover o artefato para o subdir de perfil. A v1.1.0 também REVOGA a contribuição de agents por perfil (mecanismo da v1.13.0, nunca ADR-ado): criar agente de projeto é exclusividade do dotcontext; profiles/<fw>.yaml perde a chave agents: e ganha skillBindings:, que liga cada skill a um papel de agente de projeto via frontmatter skills:. Fica explícita a distinção que reconcilia com o ADR-006: devflow MATERIALIZA contribuições de perfil (cópia verbatim rastreada por proveniência), mas não AUTORA conteúdo em agents/skills do .context/. A allowlist do sandbox origin:default (anti-RCE do ADR-007) permanece byte-idêntica."
---

# ADR 008 — Artefatos por perfil de framework: localização é o contrato de registro (copiados no init; sandbox SI-4 universal inalterado)

## Contexto

O ADR-002 estabeleceu o Standard triple-layer (Markdown + frontmatter + linter). O ADR-007 consolidou a **biblioteca de Standards default** universais (~21 `.md` + 13 linters bundled), carregada via `loadStandardsMerged()` como `origin:"default"` em **todo** projeto, com um sandbox SI-4 que trava linters `origin:"default"` na allowlist `<plugin>/assets/standards/machine/` (invariante anti-RCE: `.js` bundled-only, nunca fetchado).

A v1.13.0 introduziu **perfis de framework** (`profiles/<fw>.yaml`, lidos por `detect-framework.mjs`): mapeamento data-driven que, ao detectar um framework no projeto (ex.: Odoo via `__manifest__.py`), contribui **agents** e **skills** extras, **copiados** para `.context/` no `project-init`/`context-sync`.

Faltava um equivalente para **Standards**: regras de enforcement específicas de um framework (ex.: disciplina de ORM, escaping QWeb, higiene de manifest no Odoo) que **não** devem rodar em projetos de outro stack. Pôr essas regras no set universal `assets/standards/` faria o hook lintar regra de OWL/l10n_br em projeto não-Odoo (e o audit S7 do standards-builder as marcaria como lib-centric). Era preciso um mecanismo **condicional por framework**, sem relaxar o sandbox crítico do set universal.

### Contexto adicional da v1.1.0 — a razão dura do subdir

A v1.0.0 justificava o subdir por um motivo de **loader** (`readStandardsFromDir` não recursa). Operando o mecanismo apareceu razão mais dura: o Claude Code **registra todo `skills/<nome>/SKILL.md`** e **todo `agents/<nome>.md` como agent type**, em **todo** projeto, sem opt-out. Logo **a localização é o contrato de registro** — morar em `skills/` é *estar no vocabulário global*, independentemente do perfil; o gating governa só a **cópia** para `.context/`, nunca o registro. Evidência: o próprio repo do DevFlow (bridge Node/bash, zero Odoo) expunha `devflow:odoo-*`, `devflow:nxz-go-test` e o agent type `devflow:Odoo Specialist`, enquanto os 15 `std-odoo-*` já sob `assets/standards/profiles/odoo/` **nunca vazaram** — o padrão da v1.0.0 estava certo, só não fora aplicado a skills e agents.

### Contexto adicional da v1.2.0 — três superfícies, um único opt-out ausente

A v1.1.0 dizia que a skill "vira comando sem opt-out": conclusão certa, argumento errado. O loader de plugin do Claude Code 2.1.231 (`let z = a["user-invocable"], V = (z === void 0 ? true : …)`) e o dispatch (`if (g.userInvocable === false)`) separam três superfícies:

| Superfície | Opt-out? | Mecanismo |
|---|---|---|
| **Registro** / vocabulário exposto ao modelo | **Não** | — |
| Menu de slash / digitação pelo usuário | Sim | `user-invocable: false` |
| Invocação pelo modelo | Sim | `disable-model-invocation: true` |

Nenhum dos dois opt-outs desregistra: a skill de framework segue carregada e ocupando o vocabulário do modelo em todo projeto — o defeito que esta ADR endereça. O enunciado correto é *registrada* sem opt-out, e o subdir de perfil continua sendo o único mecanismo que resolve.

## Decisão

1. **A biblioteca default passa a comportar conjuntos *profile-scoped*.** Um perfil declara seus Standards em `profiles/<fw>.yaml` na chave `standards:` (lista de ids), espelhada num `MANIFEST.txt` do subdir do perfil.

2. **Os arquivos moram num subdir bundled ignorado pelo loader universal.** `assets/standards/profiles/<fw>/std-<id>.md` + `machine/std-<id>.js`. O `readStandardsFromDir` do loader universal lê só `*.md` do **topo** de `assets/standards/` e não recursa em subdiretórios — então o subdir `profiles/` nunca é carregado como default universal.

3. **Ativação por cópia no init/sync (origin:project), não live-merge.** Quando o perfil casa, `project-init`/`context-sync` **copiam** `std-<id>.md` + `machine/std-<id>.js` para `.context/engineering/standards/` (+`machine/`) do projeto. Lá viram `origin:"project"` e rodam sob o sandbox de linter do **projeto** (`contextPaths(projectRoot).standardsMachine`), que já os permite. É o mesmo modelo de cópia usado para as skills de perfil (item 7).

4. **O sandbox `origin:"default"` (anti-RCE do ADR-007) NÃO muda.** Live-merge dos linters profile-scoped exigiria estender a allowlist `origin:"default"` para incluir `assets/standards/profiles/*/machine/` — abrindo a superfície de segurança que o ADR-007 fecha. Rejeitado em favor da cópia, que mantém o sandbox crítico **byte-idêntico**.

5. **`profiles/<fw>.yaml` ganha também `stacks:`** — wishlist de docs versionados (`lib`/`version`/`discoveryHints`/`applyTo`), semeada no `manifest.yaml` de stacks do **projeto** como entradas `mcpIndexed: true` (via `devflow stacks add`). O scrape real para o store global do `docs-mcp-server` é follow-up do usuário. O manifest do self-repo permanece vazio (bridge plugin).

6. **Integridade garantida por teste.** O trio `profiles/<fw>.yaml standards:` ↔ `MANIFEST.txt` ↔ arquivos em disco é verificado por `tests/integration/test-profile-standards-integrity.mjs` (sem órfãos; todo id tem `.md`+`.js`).

Primeiro consumidor: o **perfil Odoo**, com 17 `std-odoo-*` (Tier 1 forte, Tier 2 parcial, Tier 3 NXZ `weakStandardWarning`).

### Acrescentado na v1.1.0

7. **A regra generaliza para qualquer artefato condicional a framework**, sob o padrão canônico `assets/<classe>/profiles/<fw>/`. As **skills** de perfil passam a `assets/skills/profiles/<fw>/<slug>/`, copiadas para `.context/skills/<slug>/` sob detecção — saindo do namespace global. Os Standards ficam onde estão.

8. **Perfis DEIXAM de contribuir agents.** A chave `agents:` sai de `profiles/<fw>.yaml` e `frameworkContributions()` para de agregá-la. **Criar agente de projeto é exclusividade do dotcontext.** O mecanismo veio da v1.13.0 e nunca teve ADR própria; esta versão o revoga.

9. **Materializar ≠ autorar** — reconcilia com o ADR-006 (*"NUNCA mover ou criar arquivos em `docs/`, `agents/`, `skills/`, `plans/` via mecanismos devflow"*), que ao pé da letra proibiria a cópia que esta ADR sanciona. Leitura coerente: o devflow **MATERIALIZA** contribuições de perfil (cópia verbatim rastreada por proveniência) mas **não AUTORA** conteúdo ali. Agente escrito à mão no plugin e depositado no projeto viola a segunda metade; skill copiada verbatim, não.

10. **O vínculo skill↔agente é declarado, não inferido.** `profiles/<fw>.yaml` ganha `skillBindings: { <papel>: [<slugs>] }`; o sync grava `skills: [...]` no frontmatter do agente, de forma **aditiva e idempotente**, reaplicada a cada execução. `dispatchKeywords` passa a mapear keyword → **papel de agente de projeto**, nunca um agente do plugin.

## Alternativas Consideradas

- **Pôr os Standards de framework no set universal `assets/standards/`** — fariam lint em todo projeto, inclusive não-Odoo; lib-centric (S7 WARN). Rejeitado.
- **Live-merge profile-scoped como `origin:"framework-default"` com nova allowlist** — abriria a allowlist do sandbox `origin:"default"`, relaxando o anti-RCE do ADR-007. Rejeitado por segurança.
- **Cópia no init para `.context/` (origin:project), sandbox universal intocado** ✓ — condicional por framework, consistente com as skills de perfil, sem tocar na superfície crítica.
- **Só documentar as regras em skill (sem linter)** — perde enforcement em CI/hook. Rejeitado.

- **v1.1.0** — **Manter as skills em `skills/` e filtrar no registro** — **impossível**: não há opt-out (nem frontmatter, nem manifest). Rejeitado por impossibilidade verificada, não por preferência.
- **Diretório raso `assets/skills/<slug>/`** — perde a origem por perfil (necessária a `skillsWithOrigin` e à detecção de órfão) e diverge do layout dos Standards. Rejeitado.
- **Deletar os artefatos de framework** — perderia conhecimento validado e quebraria projetos-cliente sem ganho: o defeito é o registro, não a existência. Rejeitado.
- **Relocar os agents de perfil em vez de revogá-los** ✗ — manteria o plugin autorando agente de projeto (ADR-006). Rejeitado.

## Consequências

**Positivas**
- Enforcement de framework ativado **só** onde se aplica; set universal permanece limpo e genuinamente cross-cutting.
- Zero mudança na superfície de segurança do set universal (sandbox `origin:"default"` byte-idêntico).
- Mecanismo data-driven e extensível: novo framework = novo `profiles/<fw>.yaml` + subdir, sem mudar código.
- Reusa o pipeline de cópia já existente para as skills de perfil.
- *(v1.1.0)* O namespace global volta a conter **só** capacidades do bridge, sob uma regra única de localização válida para toda classe de artefato condicional.

**Negativas**
- Os Standards de perfil só passam a valer após `init`/`sync` copiá-los (não são live como os universais). Aceitável — consistente com as skills de perfil.
- Cópia cria snapshots no projeto que podem divergir do bundle ao longo do tempo; `context-sync` reconcilia sem sobrescrever customizações.
- *(v1.1.0)* **BREAKING**: comandos `devflow:<skill-de-framework>` e o agent type do perfil somem; deploys anteriores viram órfãos no `.context/` do cliente. E o efeito principal — o desaparecimento do namespace — **não é observável por teste automatizado** (depende do Claude Code reindexar): o teste de disjunção é proxy estrutural, a confirmação é manual.

**Riscos aceitos**
- Drift entre o `.md`/`.js` copiado e o bundle do plugin — mitigado pelo `context-sync` (cópia incremental, não sobrescreve edição do projeto; respeita `standards.local.yaml disable:`).
- Órfão no trio yaml/MANIFEST/arquivos — mitigado pelo teste de integridade (fail-closed no CI).

## Guardrails

- SEMPRE manter os Standards de perfil em `assets/standards/profiles/<fw>/` (subdir) — NUNCA soltos em `assets/standards/`, senão o loader universal os carrega em todo projeto.
- NUNCA estender a allowlist do sandbox `origin:"default"` para incluir `profiles/*/machine/` — os linters de perfil rodam como `origin:"project"` após cópia (anti-RCE do ADR-007 preservado).
- SEMPRE manter o trio `profiles/<fw>.yaml standards:` ↔ `MANIFEST.txt` ↔ arquivos sincronizado — todo id declarado tem `.md` + `machine/.js`; sem órfãos.
- SEMPRE copiar (nunca live-merge) os Standards de perfil no `project-init`/`context-sync`, sem sobrescrever Standard já customizado pelo projeto e respeitando `standards.local.yaml disable:`.
- SEMPRE semear a wishlist `stacks:` do perfil no manifest do PROJETO como `mcpIndexed`, nunca no manifest do self-repo (bridge plugin, vazio por design).
- NUNCA nomear um Standard de perfil por módulo/subsistema (`std-odoo-pos`) — concern-framed sempre (regra que atravessa módulos).

- **v1.1.0** — SEMPRE manter artefato condicional a framework sob `assets/<classe>/profiles/<fw>/` — NUNCA em `skills/` ou `agents/` do plugin, que são namespace global **registrado** sem opt-out.
- **v1.2.0** — NUNCA usar `user-invocable: false` (ou `disable-model-invocation: true`) como substituto de mover artefato de framework para `assets/<classe>/profiles/<fw>/` — esconder da superfície não desregistra, e o artefato segue carregado em todo projeto.
- **v1.2.0** — QUANDO um texto afirmar que o namespace de plugin não tem opt-out, ENTÃO dizer de qual superfície se trata (registro / menu / invocação pelo modelo) — só a primeira é verdadeiramente sem opt-out.
- NUNCA um perfil contribuir `agents:` — criar agente de projeto é exclusividade do dotcontext.
- SEMPRE calcular o destino da cópia explicitamente por slug — NUNCA derivá-lo do path relativo da origem (derivar produziria `.context/assets/skills/profiles/...`).
- QUANDO um artefato for retirado do bundle, ENTÃO tratar o deploy remanescente como órfão: preservar e reportar, com remoção só sob confirmação humana (coerente com o ADR-012).
- SEMPRE validar frontmatter gravado em agente de projeto com o parser do **próprio dotcontext** — NUNCA com `pyyaml`, que dá falso-OK enquanto um campo mal-tipado descarta o frontmatter inteiro.

## Enforcement

- [ ] `tests/integration/test-profile-standards-wiring.mjs` — `frameworkContributions` expõe `standards`/`stacks`; `loadProfiles` normaliza as chaves; backward-compat (perfil sem as chaves → arrays vazios).
- [ ] `tests/integration/test-profile-standards-integrity.mjs` — trio yaml↔MANIFEST↔arquivos sem órfãos (fail-closed).
- [ ] `tests/integration/test-stacks-add.mjs` — `devflow stacks add` semeia o manifest com entrada `mcpIndexed`.
- [ ] `tests/odoo-standards/*.test.mjs` — 17 linters `std-odoo-*` com fixtures BAD/GOOD (RED→GREEN).

- [x] **v1.1.0** — `test-profile-skills-not-registered.mjs` — **guard do defeito**, 4 ACs: disjunção; skill de perfil existe sob `assets/`; nenhum `SKILL.md` de `skills/` com path absoluto de máquina; `skills/` bate com `skills/MANIFEST.txt`. Os dois últimos existem porque a disjunção sozinha ignora skill que **nenhum perfil declara** — o caso `nxz-go-test`.
- [x] `test-framework-profiles-integrity.mjs` — 7 ACs: trio sem órfãos, perfil **não** declara `agents`, `skillBindings` só cita skill declarada, `dispatchKeywords` concorda nos papéis. Mutation-tested.
- [x] `test-provenance-sync.mjs` — `dest` explícito por slug (segmento, não substring); órfão por manifesto **e** `detectRetired` sobre `assets/provenance/retired.json`, que alcança classes fora do manifesto (agents); nada removido.
- [x] `test-gen-known-hashes.mjs` — relocação não altera o conjunto de hashes.
- [x] `test-detect-framework.mjs` — sem `agents`; com `skillsWithOrigin`/`skillBindings`.
- [x] `test-agent-skill-binding.mjs` — frontmatter validado pelo parser do **dotcontext**; **contenção**: papel é nome de arquivo, `isWithinDir` + recusa de symlink.
- [ ] Verificação **manual pós-release**: o plugin carregado vem do **cache do release**, não do working tree — reiniciar a sessão não basta. Só após `/devflow update`. Observação, nunca sinal verde.

## Evidências

**Referências internas:** plano `.context/plans/odoo-profile-standards.md` (spec + faseamento PREVC) · doc `docs/odoo-profile-standards.md` · `scripts/lib/standards-loader.mjs` (`loadStandardsMerged`, `readStandardsFromDir`) · `scripts/lib/run-linter.mjs` (`resolveAndCheckSandbox`, sandbox SI-4 origin-aware) · `scripts/lib/detect-framework.mjs` (`loadProfiles`/`frameworkContributions`) · `profiles/odoo.yaml`. Refina o ADR-002 (Standard triple-layer); coexiste com o ADR-007 (default standards library / sync do repo standalone), cujo invariante anti-RCE (`.js` bundled-only, allowlist `origin:"default"`) permanece intocado por esta decisão. Estende o mecanismo de perfis de framework introduzido na v1.13.0 (agents/skills) para também carregar Standards e stacks.

**Acrescentado na v1.2.0:** spec `docs/superpowers/specs/2026-08-13-slash-menu-first-command-design.md` (workflow `slash-menu-first-command`) · bundle do Claude Code **2.1.231** — loader de plugin skill/command (default de `user-invocable`), dispatch (`cmd_not_user_invocable`) e função `H8l` (comparador do menu de `/`). Lido do binário, não de documentação: o campo não consta do material público de plugins.

**Acrescentado na v1.1.0:** spec `docs/superpowers/specs/2026-08-04-deframework-plugin-namespace-design.md` (workflow PREVC `deframework-plugin-namespace`) · `scripts/lib/provenance-sync.mjs` (`resolveArtifacts`, `applySync`) · `scripts/lib/gen-known-hashes.mjs` (`distributableFiles`, `genBackfill` — hash de conteúdo, path-agnóstico). Reconcilia com o ADR-006 pela distinção materializar ≠ autorar (item 9 da Decisão) e apoia-se no ADR-012 para a política de órfão (preservar, reportar, remover só sob confirmação).
