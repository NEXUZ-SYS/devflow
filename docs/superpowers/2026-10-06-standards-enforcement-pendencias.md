# Enforcement de standards — pendências depois da entrega

Este documento lista o que ficou em aberto quando o enforcement determinístico de standards
(ADR-015) foi entregue, em outubro de 2026. Nada aqui impede o uso da feature; cada item diz o
que falta, onde está e por que importa. A origem é a revisão final da branch (código e
segurança), a medição num projeto real e as decisões do dono do repositório.

Para o que a feature faz e como usá-la, veja `docs/guia-enforcement-standards.md`. Os limites que
o usuário precisa conhecer já estão lá, em "Limites e resíduos conhecidos" e "Não verificado em
ambiente real"; este documento é a lista de trabalho de quem mantém o plugin.

## 1. Ações do dono do repositório, na configuração do GitHub

A garantia do gate neste repositório depende de duas configurações da branch `main` que só um
administrador faz:

- Marcar como required status checks os seis jobs de `.github/workflows/test.yml`:
  `sinal: unit`, `sinal: integration`, `sinal: e2e`, `sinal: lint`, `sinal: standards` e
  `guards (anti-tamper, independentes de verify.lint)`.
- Ligar "Require review from Code Owners". O `.github/CODEOWNERS` dá dono a `/scripts/`, a
  `/assets/standards/` e aos arquivos da catraca. Com um dono só, que também é o autor dos PRs,
  é esperado que esses PRs precisem de bypass de administrador; isso não foi conferido no GitHub.
- Considerar "Require branches to be up to date before merging" na `main`. O gate julga o PR
  contra a ponta da branch de destino no momento em que roda, e o `test.yml` é disparado pelos
  eventos do PR e pelo push na `main`, que roda sobre a própria `main`: um PR que passou antes
  de um standard virar `block` na `main` não é julgado de novo por isso. Não foi conferido no
  GitHub se esse resultado antigo continua valendo para o merge, nem se a opção faz o sinal
  rodar de novo antes dele.

## 2. Antes do primeiro release que leve o gate

- **Migrar os linters que o plugin ainda entrega no protocolo antigo.** São os três standards
  default com mais de uma regra e os dezoito dos perfis `odoo` e `nxz`
  (`assets/standards/profiles/*/machine/`). No protocolo antigo o linter devolve um achado por
  arquivo, sem linha, e a catraca desses standards conta por arquivo: uma violação nova num
  arquivo que já tem uma aceita não bloqueia. O `check` e o `baseline init` avisam quando isso
  acontece. A migração troca regra e mensagem desses linters; o projeto que já tem baseline
  refaz o aceite de cada standard com `baseline reinit <std> --reason "…"`.
- **Rodada em ambiente real.** Nada rodou em GitHub nem em GitLab de verdade. Falta conferir:
  se o checkout da merge ref com histórico completo traz a branch base; os campos da API de
  reviews que a aprovação do override usa (`commit_id`, `submitted_at`,
  `performed_via_github_app`); a semântica real do `CODEOWNERS`; o que acontece ao renomear o
  rótulo; o job do GitLab inteiro. No GitLab, em especial: se o pipeline de um merge request do
  próprio projeto usa a configuração de CI da branch do merge request; se "Pipelines must
  succeed" aceita um pipeline em que o job `devflow-standards` não existe; se uma variável
  definida no YAML vence as predefinidas que o job lê (a documentação do GitLab diz que sim); se
  o job, vindo de um arquivo incluído, basta para o GitLab criar o pipeline de merge request
  num projeto cujo `.gitlab-ci.yml` não tem regra própria de merge request (a documentação é
  ambígua: sem o pipeline o gate não roda e nada acusa erro); se quem tem papel de Developer
  troca a base do job rodando o pipeline do merge request com variáveis de pipeline (a
  documentação diz que elas vencem as predefinidas); e qual resultado "Pipelines must succeed"
  usa quando há pipeline de branch e pipeline de merge request no mesmo merge request (a
  documentação registra uma condição de corrida, e é o que se espera num projeto cujos jobs
  não têm `rules:`). Nos dois: se um resultado verde continua valendo para o merge depois que a
  branch de destino anda ou que o destino do PR é trocado. No GitHub: o workflow entregue ao
  cliente não escuta a edição do PR, que é por onde se espera que chegue a troca de base;
  conferir, e decidir se ele deve rodar nesse evento. Falta também uma sessão real do Claude
  Code (o `ask` do guard em modo headless e em subagent), uma do omp (a mensagem de bloqueio,
  as normas da sessão e o diretório de sessão de um subagent em worktree) e uma passada em
  macOS, Windows e bash 3.2.
- **Atrito do guard de Bash.** O guard heurístico pede confirmação em casos legítimos: mensagem
  de commit que cita `rm` ou `=>`, fixture em `/tmp`, heredoc que menciona um caminho da catraca
  (`scripts/lib/standards-ratchet-bash.mjs`, `hooks/pre-tool-use-ratchet`).

Depois desse release:

- **Instalar neste repositório o job fixo do gate** (`assets/standards/ci/github-actions.yml`,
  com a versão do plugin em `.context/bin/devflow-plugin.ref`). Hoje o sinal `standards` do
  `test.yml` roda o código do gate que vem no próprio PR, porque ainda não existe um release
  para onde o pin apontar.

## 3. Pedido do dono

- **A auditoria de ADR aceitar ADRs maiores.** O check de densidade reprova acima de 120 linhas.
  A ADR-008 e a ADR-015 passam do limite e registram a exceção no próprio arquivo. Decidir um
  limite novo ou outra regra (por exemplo, por versão acumulada) em `scripts/adr-audit.mjs`.

## 4. Defeitos conhecidos em código anterior a esta entrega

Cada um pede um PR próprio.

Três deles contrariam guardrails da ADR-015 e estão registrados nela como desvios conhecidos: o
`eject` que lê a raiz do plugin do ambiente, o `session-start` principal sem moldura e o campo do
`post-tool-use` acima do teto. A conferência das guardrails na validação desta entrega os
apontou; corrigi-los é o que tira as exceções da ADR.

- **O `session-start` principal injeta as guardrails de ADR sem moldura e acima do teto.** O
  bloco de guardrails entra no contexto com o texto cru das ADRs, num campo de mais de 22 mil
  caracteres (`hooks/session-start`). A ADR-015 manda emoldurar todo corpo de ADR injetado e não
  passar de 9000 caracteres por campo; o que esta entrega emoldura e limita são os canais que
  ela criou.
- **Resíduos do lock de arquivo.** O teste instável "withLock serializa escrita concorrente" foi
  corrigido (lock recém-criado, ainda vazio, era dado como abandonado), e com ele o lock do
  `adr-update-index`, que nunca segurava. Ficaram três pontos no `withLock` das duas cópias
  (`scripts/lib/instinct-store.mjs` e `scripts/adr-update-index.mjs`), apontados por leitura do
  código e não reproduzidos: a remoção de um lock abandonado não é atômica (dois concorrentes
  que encontram o mesmo lock de dono morto podem ambos removê-lo, e o segundo apaga o lock que o
  primeiro acabou de criar); um erro `EEXIST` lançado pela função protegida é tratado como
  disputa pelo lock e a função roda de novo; e a liberação apaga o `.lock` sem conferir se ainda
  é o próprio, o que atinge o dono que passou do prazo de 30 s. O código do lock segue duplicado
  nos dois arquivos.
- **Standard com faixa de versão de framework nunca se aplica.** O loader
  (`scripts/lib/standards-loader.mjs`) não lê o campo `framework`, então a checagem de versão
  sempre falha fechada (ADR-008).
- **`..` contorna a proteção de branch.** `is_nonproject_path` e a exceção de `.context/plans`,
  em `hooks/pre-tool-use`, aceitam caminho com `..`.
- **O `session-start` principal morre quando uma ADR aprovada não tem `stack:`.** O hook sai
  com erro e a sessão começa sem contexto. Conferir se ainda se reproduz.
- **Caractere de controle no nome do arquivo invalida o JSON do `hooks/post-tool-use`.** É a
  mesma classe do defeito corrigido no `pre-tool-use` nesta entrega. O hook é assíncrono e falha
  aberto: perde-se o contexto, não uma decisão. O campo também pode passar de 9000 caracteres
  quando há muitos achados `warn`.
- **O canal antigo de aviso pós-edição** (`scripts/lib/edit-nudge.mjs`) repete o que o contexto
  pré-edição já entrega, decide a aplicabilidade pelo caminho absoluto (um `applyTo` como
  `src/**` nunca casa) e marca como entregue o standard que não coube no orçamento.
- **`eject`.** Lê a raiz do plugin de `CLAUDE_PLUGIN_ROOT` ou do diretório atual, em vez da raiz
  confiável que o resto do engine usa, e por isso falha fora de uma sessão do Claude Code; sem
  `--with-linter`, grava o standard sem linter (`scripts/devflow-standards.mjs`).
- **`standards new` grava no layout antigo** (`.context/standards/`).
  `skills/standards-builder/SKILL.md` e `scripts/lib/standard-from-adr.mjs` ainda ensinam o
  protocolo antigo de linter.
- **`run-linter` recusa linter legítimo quando a raiz está atrás de um symlink** (o `/private`
  do macOS): o caminho real é comparado com a raiz lógica.
- **O guard de Bash e MCP não trata `.context/.devflow.yaml` como arquivo da catraca**, nem
  `node_modules` sob `.context/`; o guard de Edit/Write e o gate tratam.
- **`check` resolve caminho explícito contra a raiz do projeto**, não contra o diretório atual;
  e diretório, caminho fora do projeto ou symlink pendurado saem 0 sem examinar nada.
- **O anti-loop não dispara para caminho relativo com mais de 512 caracteres**
  (`scripts/lib/standards-streak.mjs` grava truncado e compara com o inteiro).
- **A fase V local assume `origin/main` como base** (`scripts/lib/verify-run.mjs`); em projeto
  com outra branch base a comparação da catraca é feita contra a base errada.
- **No omp, o contexto injetado entra como mensagem de usuário no início do histórico.** É
  limitação do canal.

## 5. Melhorias de produto que a medição mostrou

A medição está em `docs/research/2026-09-standards-baseline-projeto-real.md`.

- **Custo do `check --all`.** Cerca de 32 s de relógio e 250 s de CPU em 890 arquivos e 26
  standards, sem cache, com a máquina carregada. É o custo da fase V e do CI, e no CI o gate
  analisa também a base do PR: só os arquivos dela que têm entrada no baseline.
- **Orçamento de contexto.** Num projeto com 21 standards `block`, o `SessionStart` (9000
  caracteres) entrega 3 como resumo e 7 como ponteiro; 11 ficam de fora. No contexto pré-edição
  cabem 2 resumos por arquivo, em parte porque o preâmbulo da moldura se repete a cada bloco
  (`scripts/lib/untrusted-frame.mjs`). Quinze standards aplicáveis não têm o resumo entregue por
  nenhum canal.
- **Falsos positivos sistemáticos dos linters default.** `SELECT *` em chamada de função SQL que
  devolve conjunto; helper de negação de ORM lido como booleano negativo; `--x` de propriedade
  CSS lido como travessão; ternário entre duas classes de estilo lido como plural escrito à mão;
  string com a palavra `enum` lida como declaração.
- **Atualizar o plugin deixa o PR da atualização vermelho no gate**, porque o sync regrava os
  linters e o shim do projeto. O gate poderia reconhecer a cópia fiel de um asset do plugin
  fixado como atualização, sem exigir o override.
- **Mensagem estável como contrato dos linters default.** Mudar o texto de uma mensagem muda a
  impressão digital e invalida o baseline de quem promoveu o standard; hoje só o `ruleId` é
  garantido estável (ADR-007).
- **Dois jobs no CI** — um consulta a API com o token, outro roda o gate sem segredo — se times
  no `CODEOWNERS` passarem a ser requisito.
- **O `gate` emitir o aviso de protocolo antigo**, como o `check` e o `baseline init` já fazem.
- **`baseline accept` aceitar mais de uma ocorrência por chamada.**

## 6. Limpeza de código apontada na revisão final

- "O que é arquivo da catraca" está definido em seis lugares (`standards-ratchet.mjs`,
  `standards-guard.mjs`, `standards-ratchet-bash.mjs`, `hooks/pre-tool-use-ratchet`, o fallback
  de `hooks/pre-tool-use` e `standards-gates.mjs`); só o par bash e JavaScript dos marcadores tem
  teste de paridade.
- Duplicações: o comando do plugin montado em três módulos; as expressões de dono e de SHA em
  dois; a lista de arquivos `CODEOWNERS` em dois; os helpers de diretório real em dois.
- Arquivos grandes: `scripts/lib/standards-check-cli.mjs` (o `gate` pede módulo próprio),
  `scripts/lib/standards-ratchet.mjs` e `hooks/pre-tool-use`, que dispara cerca de oito
  processos por edição (os 0,5 s medidos).
- A chave de sessão tem dois formatos (`hooks/pre-tool-use` e `standards-hook-cli.mjs`) e o
  campo do caminho no evento é lido de três jeitos.
- `scripts/lib/run-linter-cli.mjs` e `runLintersFor` só são usados por testes.
- No CLI, flags globais (`--force`, `--yes`, `--with-linter`, `--keep-old`) nunca chegam a
  "opção desconhecida", e os subcomandos antigos saem com 1 em erro, o mesmo código de
  "violação".
- Com bloqueio, os erros de linter e os avisos da mesma execução somem da saída do hook
  síncrono; o span de telemetria conta achados, não linters.
- As guardrails de ADR são lidas de forma diferente pelo bash e pelo JavaScript em dois casos
  (arquivo em CRLF; duas seções de guardrails).
- `hooks/README.md` não lista os quatro hooks novos, e
  `.context/plans/standards-enforcement-context-delivery.md` ficou com o progresso desatualizado.
- Cinco arquivos de teste têm o caractere U+202E literal; convém escapá-lo.
- As regras de sombra para arquivo novo em `machine/` (`shadowReason`, em
  `scripts/lib/standards-ratchet.mjs`) ficaram redundantes depois da regra "arquivo novo em
  `machine/` é violação da catraca": fora da adoção o arquivo novo já é violação e a sombra só
  muda o texto da mensagem; na adoção a base não tem irmão para sombrear. O teste `I3b`
  (`tests/integration/test-standards-gate-r1.mjs`) já não isola a detecção de sombra: ele
  afirma o exit 1 e o caminho na saída, e passa mesmo com a detecção removida. Decidir entre
  tirar as regras de sombra ou fazer o teste afirmar o motivo da mensagem.
- O ramo de componente opaco na decisão de adoção (`opaqueComponent`, na mesma decisão em
  `scripts/lib/standards-ratchet.mjs`) não tem teste. Sob `--ci` ele nem chega a decidir: link
  ou submódulo no caminho dos standards fecha antes, com exit 3; só age no modo local.

## 7. Apontado na re-revisão de segurança

- **O gate não compara com a base o que um linter importa de fora de `machine/`.** Ele compara
  `machine/` e os `node_modules` sob `.context/` (`scripts/lib/standards-ratchet.mjs`). Um pacote
  no `node_modules` da raiz ou um import relativo para fora de `machine/` fica de fora: um PR
  altera esse arquivo, desliga o linter e passa com a catraca íntegra. O guia manda o linter ser
  autocontido e declara o resíduo; falta o gate seguir os imports do linter, ou recusar linter
  que importe de fora.
- **`explain`, `check <caminho>` e o contexto pré-edição não dizem que `machine/` é pulado.**
  Para um arquivo de `machine/`, o `explain` lista as normas como aplicáveis, o `check` imprime
  "nenhuma violação nova" sem ter analisado nada, e o resumo das normas é entregue na edição
  (`scripts/lib/standards-check-cli.mjs`, `scripts/lib/pre-edit-context.mjs`,
  `scripts/lib/edit-nudge.mjs`). A exclusão está só no laço de `checkFiles`
  (`scripts/lib/standards-engine.mjs`).
- **No `hooks/post-tool-use`, o bloco de atualização de handoff chega com `\n` literais** em
  vez de quebras de linha no `additionalContext`. É anterior a esta entrega e não foi
  investigado.
- **No job do GitLab, a falha no download do plugin sai com o código do git, não com 3.** Um pin
  que aponte para uma tag que o repositório do plugin não tem faz o `git fetch` do plugin
  falhar, e o job sai com o código dele (128), porque essas linhas não passam pelo `fail` do
  script (`assets/standards/ci/gitlab-ci.yml`). O job fecha do mesmo jeito; só o código foge de
  "todo erro do job é 3", e a mensagem é a do git, sem o remédio.
- **O teste estático do job do GitLab já não pega sozinho um script que monte a base com o nome
  da branch.** `tests/lib/test-standards-gates.mjs` passa com a conferência de 40 dígitos
  removida e com a base recebendo um ref montado com o nome; quem pega os dois é o CI simulado
  (`tests/integration/test-standards-gates-ci.mjs`). Convém o estático afirmar também a linha
  da conferência de 40 dígitos, a linha que tira a base do `FETCH_HEAD` e o conjunto de linhas
  que usam o nome da branch.

## 8. Apontado na revisão do `baseline reinit`

Achados da revisão de segurança do `baseline reinit` (outubro de 2026) em código anterior a ele.
Todos demonstrados por execução numa cópia do repositório.

- **O log do gate esconde entradas além da 200ª linha.** O `gate` lista no máximo 200 linhas de
  baseline, na ordem da impressão digital, que depende do caminho. Num PR que regrava um
  standard com mais de 200 entradas, quem escolhe o nome do arquivo consegue deixar a entrada
  plantada fora do log, e com o override do dono aprovado o gate sai 0 sem citá-la
  (`scripts/lib/standards-check-cli.mjs`, `GATE_MAX_BASELINE_LINES`). Quem aprova ainda vê o
  arquivo no diff do PR. Correção sugerida: listar primeiro, e sem teto, os caminhos que não
  tinham entrada daquele standard na base.
- **O `enforce` ecoa o id sem validar.** Com um standard cujo id traga texto de comando, a
  recusa por falta de terminal imprime esse texto na linha que o humano é convidado a colar; e
  "standard … não encontrado" repete ESC e quebra de linha no stderr. O `reinit` valida o
  formato antes de qualquer eco; o `enforce` pode usar a mesma expressão.
- **`baseline init`, `prune`, `accept` e `enforce` ignoram opção desconhecida.**
  `baseline init --dry-run` cria o baseline. `check`, `gate` e `reinit` recusam.
- **Arquivo não rastreado entra no baseline e trava o PR.** `init` e `reinit` analisam também os
  arquivos não rastreados; um rascunho local com violação ganha entrada, e o gate reprova o PR
  por crédito pré-pago ("aceita 1, a árvore tem 0"), mesmo com o override. Sugestão: avisar os
  caminhos não rastreados que ganharam entrada.
- **Linter que falha depois de imprimir parte dos achados é execução válida.** Se ele sai com 1
  e já imprimiu linhas `VIOLATION`, o contrato de saída o aceita, e `init`, `accept` e `reinit`
  registram só o que foi impresso.
- **Baseline "do HEAD" lido de outro repositório.** Com `GIT_DIR` apontando para outro
  repositório no ambiente do operador e o baseline ausente da árvore, a versão "do HEAD" vem de
  lá. Exige controlar o ambiente de quem roda o comando.
