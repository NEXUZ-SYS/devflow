---
type: adr
name: deterministic-standards-enforcement
description: Standards passam de lembrete a gate — engine único, nível block/warn/review por std e por regra, baseline com catraca, hook síncrono bloqueante e CLI para pre-commit, CI e fase V.
scope: organizational
source: local
stack: universal
category: agent-harness
status: Aprovado
version: 1.1.0
created: 2026-09-26
supersedes: []
refines: [002-adopt-standards-triple-layer-v1.0.0]
protocol_contract: null
decision_kind: firm
summary: "Os linters dos standards deixam de ser nudge async e viram gate: um standards-engine único (raiz do plugin pelo import.meta.url; hooks, CLI, verify-gate) resolve nível block|warn|review por std e por regra, compara com um baseline multiconjunto que só encolhe e bloqueia só violação nova de nível block. Hook falha aberto; CLI/CI/fase V falham fechado. Só o humano aumenta o baseline ou rebaixa nível; a catraca tem camadas locais (atrito) e o gate do CI contra o merge-base (garantia)."
---

# ADR — Enforcement determinístico de standards

- **Data:** 2026-09-26
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** universal (hooks bash + Node; Claude Code e omp)
- **Categoria:** Agent Harness

---

## Contexto

Linters dos standards rodam no `PostToolUse` registrado com `async: true` e terminam
sempre em `exit 0` (`hooks/post-tool-use`). Saída de hook async chega ao modelo só no
turno seguinte e não bloqueia. Nenhum pre-commit, CI ou gate de fase roda esses
linters; o sinal `lint` da ADR-013 é o lint do projeto. Resultado: standard é
lembrete. Caso de um projeto real (2026-09-22): 68 desvios de norma após a Fase 0 com DevFlow.

## Drivers

- Norma precisa valer sem depender da atenção do agente
- Projeto em curso tem violações legadas
- Defaults do plugin podem estar errados (ULID/UUID v4)
- Portabilidade Claude Code + omp
- Agente não pode "aceitar" a própria violação

## Decisão

Um `standards-engine` único (`scripts/lib/standards-engine.mjs`) resolve os standards
aplicáveis por `applyTo`, roda os linters no sandbox SI-4, classifica os achados por
nível e compara com o baseline. Consumidores: hooks, CLI `devflow standards` e
`verify-gate` (sinal `standards`).

- **Raiz do plugin:** o engine e o `verify-run` a derivam do próprio `import.meta.url`
  (trust-anchor), nunca de `CLAUDE_PLUGIN_ROOT`; todo consumidor vê o mesmo conjunto.
- **Nível:** `enforcement.level` (`block|warn|review`) por std, `enforcement.rules`
  por `ruleId`. Default por origem: `devflow-default` = `warn`, `local` = `block`.
  `maxLevel` = o nível mais alto que alguma regra do std atinge. Achado `advisory`
  (linha `ADVISORY` ou legado multi-regra) resolve para `warn` antes de
  `enforcement.level`, a menos que `enforcement.rules[ruleId]` o eleve.
- **Baseline com catraca:** `.context/engineering/standards/baseline.json`
  (`version: 1`); impressão digital sem número de linha; **multiconjunto** — cada entrada
  tem `count` e o excedente é violação nova; `prune` só encolhe; aumentar exige o operador
  no terminal dele, por `baseline accept --reason` (uma ocorrência) ou `baseline reinit <std>
  --reason` (refaz as entradas de um standard com os achados atuais; as que não mudaram e as
  dos outros standards ficam intactas; arquivo sem entrada anterior só entra com
  `--allow-new-paths`).
- **`machine/` fora do check:** o engine não analisa o que está sob `machine/` dos standards
  do projeto (canônico e legado): são os linters do projeto, e a saída do protocolo
  (`console.log`) já os faria violar outro standard. A exclusão mora no engine, e por isso
  hook, CLI, gate e a análise da árvore da base veem o mesmo conjunto. O baseline não registra
  achado ali; entrada antiga com esse caminho sai no `prune`.
- **Hooks:** `post-tool-use-lint` síncrono roda só std de `maxLevel` `block` e devolve
  `decision: "block"` para violação nova; `warn`/`review` rodam no async. O
  `pre-tool-use` emite toda decisão por uma única função que serializa com `json.dumps`.
  O contexto injetado (resumo pré-edição, `session-start-norms`, `SubagentStart`) é
  emoldurado com nonce e tem teto de 9000 caracteres por campo.
- **Catraca em camadas:** guard semântico no Edit/Write (mesmo parser do loader, antes e
  depois), guard heurístico em Bash/NotebookEdit/MCP, CLI que exige terminal interativo
  para aumentar a catraca, e `gate` no CI contra a base (baseline, enforcement
  efetivo com a aplicabilidade por faixa de versão — parte ainda inerte, ver "Riscos
  aceitos" —, linters do projeto, `verify.standards`).
  As locais são atrito; o CI é a garantia. Sem `--ci`, a violação vira nota. Sob `--ci` a
  base é um `refs/…` completo ou SHA e tem de ser ancestral do HEAD (o gate roda sobre o
  merge do PR); o check linta os blobs do HEAD, sem atributos nem filtros, e os caminhos da
  catraca na árvore têm de ser esses blobs. O check usa o baseline da base; o da árvore só
  vale em dois casos — sob override aprovado, e na adoção (a base não tem baseline), com
  cada entrada conferida contra o que o engine acha na árvore da base — e nunca com crédito
  pré-pago. **Crédito limitado pela base:** quando o baseline da base tem entradas, o gate
  roda os linters da base sobre os arquivos da base que têm entrada, e cada entrada só vale
  até o que eles produzem; crédito que sobrou de uma violação corrigida sem `prune` não cobre
  ocorrência do HEAD (vira nota, não violação). Sob override aprovado, a entrada que o PR
  aumentou vale pelo `count` aprovado; as demais seguem limitadas. Linter da base que falha
  num arquivo com entrada no baseline é exit 3. **Arquivo novo em `machine/` é violação**, nos
  dois layouts (canônico e legado), inclusive no que a base não usa: o check não analisa
  `machine/`, e como nota um PR estacionava ali código que viola um std `block`. No GitHub só
  entra com o override; no GitLab o job fica vermelho. Exceção única, a adoção dos standards:
  a base não tem nada em nenhum dos dois diretórios de standards (decide só a árvore da base),
  e aí o arquivo novo é nota. `node_modules` novo ou alterado sob `.context/` é violação. O
  override é rótulo + review
  `APPROVED` cujo `commit_id` é o head do PR, os dois de quem é dono, no CODEOWNERS da
  base, de todos os arquivos da catraca que o PR alterou; nunca o autor, bot ou GitHub App.
  O CODEOWNERS é lido num subconjunto de padrões (nome literal, `*` e `?` num segmento,
  `**` como segmento, barra inicial e final); `dir/*` e `/*` casam só os filhos diretos. Na
  dúvida ninguém aprova: regra fora do subconjunto, `dir/*` ou `/*` sobre arquivo aninhado,
  ou linha com dono fora do formato, depois da última regra que casa, deixam o arquivo sem
  aprovador. CODEOWNERS de 3 MB ou mais vale como ausente (o GitHub o ignora inteiro).
- **Sinal `standards`:** argv reservado `["devflow-standards", "gate"]`, resolvido pelo
  plugin; comando do projeto não é aceito. No CI do projeto-cliente, o job faz checkout do
  plugin público na versão de `.context/bin/devflow-plugin.ref` (lida da base) e roda o
  `gate` sem executar código do PR antes (ADR-012 v1.2.0); `DEVFLOW_PR_NUMBER` e
  `DEVFLOW_REPO` levam o override ao gate quando o sinal roda pelo executor. A base desse job é
  sempre a **ponta** da branch de destino. No GitLab ela vem do pipeline quando há *merged
  results pipelines*; sem elas o job busca a branch de destino no `origin` (nome validado,
  refspec completo) e, se o merge request estiver atrás do destino, sai 3 pedindo para
  atualizar a branch (rebase ou merge) ou ligar *merged results* — nunca julga pela base do
  diff do merge request, que aplicaria as regras do commit em que a branch saiu.
- **Este repositório (dogfooding):** o sinal `standards` entra na matriz do `test.yml` e roda o
  `gate` do **próprio PR**. O job fixo do cliente não é instalado aqui: depende de uma release
  que contenha o gate. O juiz é protegido pelo CODEOWNERS em `scripts/` e `assets/standards/` inteiros e pelo
  "Require review from Code Owners". Sem override: o `test.yml` não passa as variáveis de PR nem
  escuta rótulo ou review, e enfraquecer a catraca deixa o sinal vermelho.
- **Falha de infra:** contrato de saída do linter (0 limpo; 0/1 com `VIOLATION` =
  achados; o resto é erro). Hook falha aberto com aviso; CLI, CI e fase V falham fechado
  (exit 3).

## Alternativas Consideradas

- **Só linhas alteradas (diff)** — sem estado, mas erra violação não local e exige git.
- **Arquivo inteiro sem baseline** — rigoroso, mas incha PRs de projeto em curso.
- **Tudo `block` por default** — defaults genéricos bloqueariam decisões legítimas.
- **Rules nativas `.claude/rules`** — só Claude Code; arquivos derivados no projeto.
- **Engine único + nível por std/regra + baseline com catraca + hook síncrono** ✓ — portável, auditável, coerente entre hook, commit, CI e V.

## Consequências

**Positivas**
- Violação nova de nível `block` não passa por nenhuma camada
- Mesmo achado → mesmo veredito em hook, pre-commit, CI e fase V
- Dívida legada visível, versionada e decrescente

**Negativas**
- Hook síncrono soma latência à edição (orçamento ~10s, linters em paralelo)
- Protocolo de linter v2 exige migrar os 17 linters default de regra única (os 3 multi-regra ficam no legado estruturado)
- Projeto precisa rodar `baseline init` (no terminal do operador) para ativar o bloqueio
- O contexto do PreToolUse chega junto do resultado da ferramenta: na primeira edição sob cada std, a norma chega depois (medido na T23)

**Riscos aceitos**
- Sem baseline o hook de edição não bloqueia → atualizar o plugin não vira parede de bloqueios na edição. Vale só para o hook: pre-commit, CI e fase V bloqueiam mesmo sem baseline (toda ocorrência é nova), e a fase V exige `verify.standards` quando há std que pode chegar a `block`
- Pre-commit contornável com `--no-verify` → CI é a camada não contornável
- Impressão digital sem linha: com a contagem, qual das ocorrências iguais é a "nova" é arbitrário (a última por linha); o total é exato
- Guards locais (Edit/Write, Bash, CLI) são contornáveis por quem insiste (script intermediário, ofuscação, `script -qc`); a garantia é o `gate` no CI
- O override (rótulo + review preso ao commit) pressupõe que o agente não tem credencial de code owner dos caminhos da catraca
- O `baseline reinit` aceita em massa: registra os achados atuais do standard, inclusive violação nova. Arquivo sem entrada do standard no baseline da base (merge-base com a base padrão; sem ele, o HEAD) exige `--allow-new-paths` e é listado; sem commit legível, a comparação cai no baseline da árvore, com aviso; violação nova em arquivo que já tinha entrada aparece só como crescimento, e na troca de um linter do protocolo antigo para o v2 esse crescimento é indistinguível do legítimo. Os controles são o operador no terminal e, no CI, o override do dono, que o aumento de entradas continua exigindo
- Crédito limitado pela base, consequências: (1) a árvore da base é reconstruída só com o que está no git, então linter de projeto com dependência não versionada faz o `gate --ci` sair 3 em todo PR enquanto o baseline da base tiver entradas — o linter tem de ser autocontido (só `node:*` e imports relativos para dentro de `machine/`; dependência versionada, só em `node_modules` dentro de um dos dois diretórios de standards, onde o trecho de CODEOWNERS gerado lhe dá dono e o PR que a acrescenta pede override — em `.context/node_modules/`, fora deles, o override não tem aprovador e o gate fecha); (2) linter da base que falha num arquivo com entrada no baseline só se conserta na branch base, com bypass de admin; (3) reaceitar uma violação por cima de crédito sem lastro pede dois PRs — podar a base, depois aceitar; (4) a fase V local, sem `--ci`, não analisa a base e pode passar onde o CI reprova; (5) o gate custa mais: analisa também os arquivos da base com entrada no baseline
- Zona cega de `machine/`: código colocado ali não é analisado por nenhum standard, nos dois layouts e em qualquer projeto. O que a fecha é a comparação com a base no `gate` — arquivo novo, alterado ou removido é violação —, mais o `ask` do guard e o CODEOWNERS, cujo trecho gerado dá dono aos dois layouts. No GitLab não há override nem aplicação de dono: a violação deixa o job vermelho e o merge é decisão de quem mantém
- Adoção dos standards (a base não tem nada em nenhum dos dois diretórios de standards): os arquivos novos de `machine/` são só nota e não são analisados. Não há standard anterior a contornar, e o PR de adoção é revisado por inteiro
- O que um linter carrega de fora de `machine/` e de `node_modules` sob `.context/` (pacote do `node_modules` da raiz, import relativo para fora) não é comparado com a base: um PR pode alterá-lo e desligar o linter com a catraca íntegra. Por isso o linter tem de ser autocontido
- O cache pré-edição (`.context/runtime/pre-edit-cache.json`) é gravável pelo agente: forjado, suprime a ENTREGA do resumo das normas até o `PostCompact`. A decisão de bloqueio não depende dele
- A moldura de `frameProjectData` bloqueia frases por lista heurística; `- SYSTEM:`, "disregard prior instructions" e tags de largura total passam. A defesa real é o nonce de 48 bits, a neutralização e o preâmbulo "dado, não instrução"
- O job do gate usa só o `GITHUB_TOKEN` padrão (`contents` e `pull-requests: read`), nunca um PAT: em runner hospedado, qualquer código do job alcança o token. `HOME` está na allowlist do linter e dá caminho a `~/.config/gh`, `~/.git-credentials` e `~/.netrc` se o runner os tiver. Donos do CODEOWNERS são pessoas, não times (time exigiria `read:org`)
- O pin `.context/bin/devflow-plugin.ref` não é arquivo da catraca: é seguro porque o CI o lê da base e o CODEOWNERS cobre `/.context/bin/`; a cadeia depende de "Require review from Code Owners" (ação humana). Pin quebrado na base só sai com bypass de admin, e só vale a partir da release que levar o gate
- Janela de adoção: no PR que adota o gate a base ainda não tem `.context/bin/devflow-plugin.ref`, então o CI lê o pin do próprio PR — a versão do plugin que julga o PR é escolhida por ele (tag `vX.Y.Z` ou SHA de 40 dígitos) e roda com o token do job no ambiente. Por isso o PR de adoção é revisado por um dono com atenção a esse arquivo; depois do merge o pin vem da base
- A faixa de versão de framework está descrita na catraca (na decisão e na guardrail do `ask`), mas não está ativa: o loader não lê o campo `framework` do standard, então um std com `appliesFrom`/`appliesUntil` não se aplica em nenhum consumidor do engine e a comparação por faixa não decide nada. Pendência conhecida (backlog da ADR-008)
- GitLab, merge request vindo de fork: pela documentação do GitLab ("Merge request pipelines", "Use with forked projects"), o pipeline roda no projeto do fork, com a configuração de CI do fork — e, por consequência, com o `origin` do job no fork. Ali o job não é garantia: a branch de destino que ele busca é a do fork, e nenhuma conferência dentro do job protege contra um fork que edite o próprio CI. A garantia só existe quando o pipeline roda no projeto de destino, e mesmo ali a configuração de CI usada é a da branch do fork. Não exercitado num GitLab
- GitLab, o gate não protege o próprio CI. Conferido no código e no asset: o job é um arquivo do projeto, ligado por `include:`; nenhum dos dois é arquivo da catraca nem tem dono no trecho de CODEOWNERS gerado; tudo o que o plugin confere acontece dentro do job, que confia nas variáveis que lê. Da documentação do GitLab, sem execução: variável definida no YAML vence as predefinidas, e um job de mesmo nome no `.gitlab-ci.yml` se sobrepõe ao incluído; quem tem papel de Developer pode rodar o pipeline do merge request com variáveis de pipeline, que também vencem as predefinidas, salvo se "Minimum role to use pipeline variables" o impedir; com pipeline de branch e de merge request no mesmo merge request, uma condição de corrida decide qual resultado "Pipelines must succeed" usa; e regras definidas em `include:` não bastam para configurar pipelines de merge request (frase ambígua: se valer para a regra do job, que está no arquivo incluído, o gate não roda num projeto sem regra própria de merge request, e nada acusa erro). Não conferido: se o pipeline de um merge request do próprio projeto usa a configuração de CI da branch do merge request, e se "Pipelines must succeed" aceita um pipeline sem o job; se for assim, um merge request comum tira o gate do pipeline. Até conferir, o job só vale como garantia com a configuração de CI fora do alcance de quem abre o merge request.
- O veredito não é refeito quando o destino muda depois do job, nos dois CIs: a branch de destino anda depois de um resultado verde, ou o destino do PR é trocado depois dele. Conferido nos assets: o workflow do GitHub não escuta a edição do PR, e o job do GitLab só roda quando o GitLab cria o pipeline. Não conferido: se o resultado antigo continua valendo para o merge (comportamento da plataforma), e que a mitigação conhecida — exigir a branch em dia com o destino para o merge — fecha os dois casos
- Desvios conhecidos das guardrails desta ADR, em código anterior a ela (pendências em `docs/superpowers/2026-10-06-standards-enforcement-pendencias.md`): (1) o `eject` ainda lê a raiz do plugin de `CLAUDE_PLUGIN_ROOT` ou do diretório atual, contra a guardrail da raiz confiável; (2) o `session-start` principal injeta as guardrails de ADR sem moldura, num campo acima de 9000 caracteres — o que esta ADR emoldura e limita são os canais que ela cria (`session-start-norms`, `SubagentStart`, contexto pré-edição, hook síncrono e o aviso pós-edição); (3) o campo do `post-tool-use` pode passar de 9000 caracteres quando a saída dos linters `warn` e `review` se soma aos lembretes
- Fora do alcance: projeto em subdiretório do repositório, GitHub Enterprise; nada rodou em GitHub ou GitLab reais
- Na merge ref, o head do PR é reconhecido só pelos pais do HEAD (exatamente dois, o primeiro é a base): um merge com esses pais e uma árvore que não é a do merge deles não é distinguido. Fora do modelo — montá-lo exige controlar o HEAD em que o CI roda

## Guardrails

- SEMPRE resolver achados via `standards-engine`; NUNCA reimplementar lint, aplicabilidade ou nível em hook, CLI ou gate.
- SEMPRE derivar a raiz do plugin do `import.meta.url` do engine; NUNCA decidir standards por `CLAUDE_PLUGIN_ROOT`.
- SEMPRE emitir a decisão do `pre-tool-use` por `emit_decision` (um objeto, `json.dumps`); NUNCA texto ou `printf '{'` fora dela.
- NUNCA bloquear por ocorrência coberta pela contagem do baseline; SEMPRE bloquear o excedente.
- NUNCA permitir que o agente edite `baseline.json`; `pre-tool-use` nega a escrita em qualquer grafia do caminho.
- SEMPRE exigir no `baseline reinit` terminal interativo, justificativa e, para aceitar achado em arquivo sem entrada do standard no baseline da base, a flag `--allow-new-paths`; NUNCA medir caminho novo contra o baseline da árvore quando a base ou o HEAD são legíveis; NUNCA deixá-lo alterar entrada de outro standard, regravar entrada que não mudou ou que só diminuiu, nem gravar quando o linter do standard alvo saiu do contrato ou não rodou, ou quando o baseline mudou durante a execução.
- QUANDO uma edição (pelo caminho ou pelo `realpath`) enfraquecer o enforcement efetivo (nível, regra, `source`, `deprecated`, `disable:`, `applyTo`, `linter`, faixa de versão) ou tocar `machine/**`, ENTÃO o hook devolve `ask` ao humano.
- SEMPRE comparar a catraca no CI (`gate --ci`) contra a base — `refs/…` completo ou SHA, ancestral do HEAD (o gate roda sobre o merge do PR) —, lintando os blobs do HEAD sem atributos; NUNCA usar o baseline da própria branch fora de dois casos — override aprovado, ou adoção com cada entrada conferida contra a árvore da base —, NUNCA aceitar entrada com mais ocorrências do que a árvore tem (crédito pré-pago) e NUNCA deixar uma entrada valer além do que os linters da base produzem na árvore da base (crédito sem lastro), salvo o aumento aprovado pelo override.
- QUANDO um PR criar arquivo sob `machine/` dos standards do projeto (layout canônico ou legado, inclusive o que a base não usa), ENTÃO o `gate` o trata como violação da catraca; NUNCA como nota, salvo no PR de adoção dos standards — a base sem nada em nenhum dos dois diretórios de standards, decidido só pela árvore da base.
- SEMPRE comparar, no job do GitLab, com a ponta da branch de destino — a que o pipeline de *merged results* entrega ou, sem ela, a buscada do `origin` pelo nome validado, como refspec completo — e fechar (exit 3) quando o merge request está atrás dela; NUNCA usar como base a base do diff do merge request.
- SEMPRE chamar o linter com caminho relativo e tirar as raízes da mensagem antes da impressão digital.
- QUANDO um enfraquecimento for liberado, ENTÃO o override DEVE ter o rótulo `standards-ratchet-approved` E um review `APPROVED` preso ao commit (`commit_id` = head do PR, com o PR aberto; o head do PR tem de ser o HEAD em que o gate roda ou, na merge ref, o HEAD^2 — HEAD de exatamente dois pais cujo primeiro é a base), os dois de quem é dono — pela última regra que casa no CODEOWNERS da base, lido num subconjunto declarado de padrões — de TODOS os arquivos da catraca que o PR alterou em relação à base (arquivo sem regra que o cubra, com regra duvidosa depois da última que casa — fora do subconjunto, `dir/*` ou `/*` sobre arquivo aninhado, dono fora do formato —, ou com caractere de controle no nome não tem aprovador), e que não seja o autor do PR, bot nem ação feita por GitHub App.
- NUNCA aceitar comando do projeto no sinal `standards`; só o argv reservado.
- SEMPRE emoldurar (nonce + sanitize) corpo de std, knowledge ou ADR injetado no contexto; NUNCA passar de 9000 caracteres por campo.
- QUANDO a mesma impressão digital bloquear 3 vezes seguidas na sessão, ENTÃO manter o `block` e instruir a parar e perguntar ao humano; NUNCA sugerir ao agente aceitar no baseline.
- QUANDO um linter sair fora do contrato (exit 1 sem `VIOLATION`, outro código, sinal, saída > 1MB), ENTÃO é erro: o hook avisa e segue; CLI, CI e V saem com exit 3.
- SEMPRE tratar standard sem `level` pelo default de origem e linha `VIOLATION:` legada de regra única com `ruleId` = id do std sem `std-`.

## Enforcement

- [ ] Teste: unit do engine (raiz confiável sem env, nível, multiconjunto, contrato de saída do linter, orçamento que aborta, baseline do HEAD).
- [ ] Teste: propriedade do `pre-tool-use` (stdout vazio ou um JSON; mesma decisão com e sem contexto; C0 no caminho) e estrutural (`emit_decision` única).
- [ ] Teste: os 14 vetores de bypass do guard de Edit/Write e a tabela de comandos do guard de Bash.
- [ ] Teste: `gate` falha com baseline regravado, removido, nível rebaixado, `disable:`, linter alterado e `verify.standards` removido.
- [x] Teste: arquivo novo em `machine/` (canônico e legado) é violação; o override só vale com dono no CODEOWNERS da base; a adoção, decidida pela base, mantém a nota (`tests/integration/test-standards-gate-new-linter.mjs`).
- [x] Teste: `gate --ci` sai 1 com a violação reintroduzida sobre crédito sem lastro, 0 no PR que corrige sem `prune` e 3 com linter da base que falha (`tests/integration/test-standards-gate-base-credit.mjs`).
- [x] Teste: `baseline reinit` — propriedade (entradas dos outros standards idênticas; entrada que não mudou fica intacta) e CLI (recusa sem terminal, em CI, sem baseline, com argumento ou opção inválidos, com standard desconhecido, sem execução de linter e com caminho novo sem a flag; erro de linter e baseline alterado durante a execução não gravam) em `tests/lib/test-standards-baseline.mjs` e `tests/integration/test-standards-check-cli.mjs`.
- [ ] Teste: e2e com fixture (baseline → edição bloqueada → correção → `check --staged` → gate V verde) e agente adversário.
- [ ] Gate PREVC: sinal `standards` no `verify-gate` (ADR-013) obrigatório quando há std que pode chegar a `block`.
- [x] CI: sinal `standards` (`gate --ci`) na matriz do repo devflow; CODEOWNERS nos caminhos da catraca e em `scripts/` e `assets/standards/` inteiros.
- [ ] Config do repositório (ação humana): os seis checks do `test.yml` como required checks e "Require review from Code Owners" na `main`.

## Nota de densidade

O check 9 do `adr-audit` reprova este arquivo por tamanho (o limite é de 120 linhas) e **isso é
aceito** (decisão do dono do projeto, 2026-10-06). A decisão é uma só, mas é a de uma peça de
garantia: as regras do `gate` do CI, os guardrails e os riscos aceitos — os limites declarados
da garantia — ficam juntos de propósito, e compactá-los tiraria do registro o que o revisor
precisa conferir.

## Evidências / Anexos

**Fontes oficiais:** [Claude Code — Hooks reference](https://code.claude.com/docs/en/hooks) · [Claude Code — Hooks guide](https://code.claude.com/docs/en/hooks-guide)

Design: `docs/superpowers/specs/2026-09-26-standards-enforcement-context-delivery-design.md`
Design do `baseline reinit` (v1.1.0): `docs/superpowers/specs/2026-10-08-baseline-reinit-standard-design.md`

```yaml
# .context/engineering/standards/std-data-modeling.md (frontmatter)
enforcement:
  linter: machine/std-data-modeling.js
  level: warn            # block | warn | review
  rules:
    float-money: block   # override por ruleId (protocolo v2)
```
