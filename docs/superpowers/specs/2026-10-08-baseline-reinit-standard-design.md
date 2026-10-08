# `baseline reinit`: refazer o baseline de um standard — Design

**Data:** 2026-10-08
**Workflow PREVC:** `baseline-reinit-standard` · **Escala:** MEDIUM · **Autonomia:** supervised
**Status:** aprovada pelo operador; revisada na fase R em 2026-10-08 (arquiteto: aprovado com ressalvas; segurança: o desenho se sustenta com correções), com os achados incorporados e as decisões 4 e 5 do operador; ajustada na fase V (revisão final e re-revisão de segurança), com a decisão 6 do operador
**Origem:** `docs/superpowers/2026-10-06-standards-enforcement-pendencias.md` §2 (migração dos
linters legados)

---

## 1. Problema

O baseline registra cada violação aceita por impressão digital: standard, regra, caminho e
mensagem normalizada. Quando o linter de um standard muda de regra ou de mensagem, todas as
impressões digitais desse standard mudam junto. O que estava aceito volta como violação nova e
as entradas antigas ficam órfãs.

Hoje o projeto que passa por isso não tem um caminho razoável:

- `baseline init` recusa quando já existe baseline;
- `baseline accept` aumenta uma ocorrência por chamada;
- sobra apagar o `baseline.json` e rodar `init` de novo, o que registra outra vez os achados de
  **todos** os standards, não só do que mudou.

O caso que torna isso urgente é a migração dos 21 linters que o plugin ainda entrega no
protocolo antigo (3 defaults de design e 18 dos perfis `odoo` e `nxz`). Ela troca regra e
mensagem de todos eles de uma vez. Qualquer projeto que tenha promovido um desses standards a
`block` cai na situação acima ao atualizar o plugin.

## 2. Decisões do operador (2026-10-07 e 2026-10-08)

1. A migração dos linters e este comando são **dois subprojetos, dois PRs**; o comando vem
   primeiro, para a ferramenta de transição existir quando os linters mudarem.
2. A transição ganha um **comando próprio**, em vez de só uma receita manual documentada.
3. O comando se chama **`reinit`** e vale para **qualquer standard**, não só para os que tiveram
   o linter migrado.
4. **Caminho novo é recusado por padrão.** Violação em arquivo que não tinha nenhuma entrada
   daquele standard só é aceita com a flag `--allow-new-paths` (decisão tomada depois da
   revisão de segurança).
5. Os achados da revisão entram neste PR; a re-revisão de segurança acontece na fase V, com as
   provas de conceito do auditor reexecutadas contra o código real.
6. **Caminho novo se mede contra o baseline da base** (decisão da fase V). A re-revisão de
   segurança mostrou que, medida contra o baseline da árvore, a recusa de caminho novo caía
   com uma entrada forjada pelo agente, e o `reinit` ainda apagava o rastro da forja.

A migração dos linters tem spec própria, a escrever depois desta entrega. Já está decidido para
ela: um `ruleId` por verificação nos 18 linters de perfil.

## 3. Interface

```
devflow-standards baseline reinit <std-id> --reason "<justificativa>" [--allow-new-paths]
```

| Exit | Quando |
|---|---|
| 0 | Gravou o baseline novo, ou não havia diferença a gravar |
| 2 | Uso incorreto ou ação recusada |
| 3 | Erro de execução (linter fora do contrato, baseline inválido, baseline alterado durante a execução) |

São os mesmos códigos dos outros subcomandos de `baseline`.

## 4. Comportamento

### 4.1 Pré-condições, nesta ordem

1. **Argumentos válidos.** Exatamente um `<std-id>`, que casa
   `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`; `--reason` não vazio e com até 500 caracteres; nenhuma
   opção além de `--reason` e `--allow-new-paths`. Senão: mensagem de uso, exit 2, **sem ecoar**
   nenhum valor recebido. A validação vem antes de qualquer mensagem que repita o id, pelo
   mesmo motivo do `accept`: o valor pode vir do agente e vai parar num comando que o humano
   cola no terminal. Opção desconhecida é uso incorreto, nunca ignorada: `--dry-run` não pode
   gravar. Vale também para as opções que o wrapper `devflow-standards.mjs` consome para outros
   subcomandos (`--force`, `--yes`, `--keep-old`…): ele repassa ao CLI os argumentos como
   vieram, menos o `--project=`, e com isso `check` e `gate` também passam a recusá-las.
2. **Terminal interativo e fora de CI.** Senão: recusa pelo caminho existente
   (`refuseNonInteractive`), exit 2.
3. **Baseline existe** (no arquivo ou, removido da árvore, na versão do HEAD). Senão: exit 2,
   apontando o `baseline init`.
4. **`<std-id>` é um standard efetivo do projeto**, isto é, está no mesmo conjunto que o `check`
   avalia (defaults do plugin, perfis e os do projeto, já descontados os desligados). A
   comparação é estrita: o id do standard tem de ser a mesma string. Senão: exit 2. Um standard
   removido ou desligado que ainda tenha entradas sai pelo `prune`.

Um standard real cujo id não casa o formato do item 1 não pode ser refeito por este comando; a
mensagem de uso diz qual é o formato aceito.

### 4.2 Execução

Roda **só o linter do standard alvo** sobre todos os arquivos do projeto, sem baseline.

- Se o linter sair do contrato em qualquer arquivo, o comando sai com 3 e **não grava nada**.
- Se **nenhum linter chegou a rodar** para o standard (sem linter declarado, ou o `applyTo` não
  casa nenhum arquivo), o comando recusa com exit 2 e aponta o `prune`. Ausência de execução
  não é o mesmo que "sem achados", e não pode zerar as entradas.

Os outros standards não são reavaliados, porque as entradas deles não mudam. Um linter quebrado
de outro standard não impede a operação.

### 4.3 Resultado

Cada impressão digital do standard alvo cai num de cinco casos:

| Caso | Condição | O que acontece com a entrada |
|---|---|---|
| Mantida | Mesma impressão digital, mesma contagem | Fica **intacta**: mesma justificativa, mesmo autor, mesma data |
| Alterada | Mesma impressão digital, contagem maior | Regravada com a contagem atual e a justificativa desta execução |
| Reduzida | Mesma impressão digital, contagem menor | Fica com a justificativa, o autor e a data que tinha, e a contagem atual (como no `prune`): nada entrou |
| Nova | Impressão digital que não existia | Criada com a contagem atual e a justificativa desta execução |
| Removida | Impressão digital sem achado atual | Sai |

- As entradas dos **outros** standards não são tocadas: mesmos campos, mesmos valores.
- **Sem diferença, não grava.** Se todas as entradas do standard são mantidas, o comando informa
  isso e sai com 0 sem tocar no arquivo.
- **Releitura antes de gravar.** Se o baseline mudou entre a leitura inicial e o momento de
  gravar (outro comando gravou no meio), o comando sai com 3 sem gravar.
- No arquivo, quem define a ordem é o `saveBaseline`, que já grava as entradas ordenadas por
  impressão digital. Este comando não muda isso.

### 4.4 Caminho novo

Um **caminho novo** é um arquivo com achado atual que não tinha nenhuma entrada daquele standard
no **baseline de referência**. Migração de mensagem ou de regra não cria caminho novo: os
arquivos são os mesmos. O mesmo baseline de referência decide os caminhos que ganharam
ocorrências.

O baseline de referência é o da base, que o agente não altera no PR (decisão 6):

1. o do merge-base do HEAD com `refs/remotes/origin/main`, a mesma base padrão do `gate`;
2. sem merge-base, o do HEAD;
3. sem nenhum dos dois legível (repositório sem commit, ou fora de git), o da árvore, com um
   aviso de que ele pode ter sido editado.

Base sem baseline é adoção: todo caminho conta como novo. Uma entrada que o próprio operador
aceitou antes, na mesma branch, também conta como caminho novo e pede a flag; é o custo de não
confiar no baseline da branch.

- Sem `--allow-new-paths`: o comando lista os caminhos novos, **não grava** e sai com 2,
  dizendo como repetir com a flag.
- Com `--allow-new-paths`: grava, e os caminhos novos aparecem no relato.

A lista sai inteira, sem teto de linhas.

### 4.5 Relato

- Uma linha com mantidas, novas, alteradas, removidas e reduzidas, em entradas e em ocorrências.
- Quantas execuções de linter houve, e contra qual baseline os caminhos foram comparados.
- A contagem por regra das ocorrências que entraram além do que já estava aceito.
- Os caminhos novos e os **caminhos que ganharam ocorrências** (antes → depois), sem teto.
- O aviso de protocolo legado que o `init` e o `check` já emitem, quando for o caso.

## 5. O que não muda

- **`init`, `prune` e `accept`.**
- **O gate no CI.** O PR que traz um baseline refeito aumenta entradas, e continua precisando do
  override do dono no GitHub (rótulo `standards-ratchet-approved` e review `APPROVED` no último
  commit). No GitLab não há override, e o job continua vermelho: é a limitação que o guia já
  declara, e este comando não a resolve.
- **Os guards.** O guard de Bash já pede confirmação para qualquer `devflow-standards … baseline
  …`, então o subcomando novo nasce coberto. O agente continua sem poder editar o
  `baseline.json`.
- **O formato do baseline** (versão 1).

O engine ganha um campo aditivo no resultado do `checkFiles`: quantas execuções de linter foram
despachadas. É o que permite distinguir "rodou e não achou nada" de "não rodou".

## 6. Estrutura

- **`reinitStandard(baseline, findings, stdId, { reason, by, reference })`**, função pura em
  `scripts/lib/standards-baseline.mjs`. Devolve o baseline novo e um resumo: mantidas, novas,
  alteradas, reduzidas, removidas, contagem por regra, caminhos novos e caminhos que cresceram,
  estes medidos contra `reference`. Não lê disco nem roda linter.
- **Campo `linterRuns`** no resultado de `checkFiles`, em `scripts/lib/standards-engine.mjs`.
- **Ramo `reinit` em `cmdBaseline`**, em `scripts/lib/standards-check-cli.mjs`: valida, coleta os
  achados com o `stdFilter` do engine, resolve o baseline de referência, chama a função pura,
  aplica a recusa de caminho novo, relê o baseline, grava com o `saveBaseline` existente e
  imprime o relato.
- **Repasse dos argumentos** em `scripts/devflow-standards.mjs`, para o CLI de standards.

Nenhum módulo novo. A escrita reaproveita o `saveBaseline`, com a contenção por caminho real
que ele já faz.

## 7. Segurança

O comando aumenta o baseline, então é da mesma classe do `init` e do `accept` (ADR-015, D6: só o
humano aumenta o baseline). A revisão da fase R atacou cada linha com prova de conceito; a
tabela já traz o que resultou.

| Ameaça | O que segura | Resultado da revisão |
|---|---|---|
| O agente roda o comando | Recusa fora de terminal interativo e em CI; guard de Bash pede confirmação | Igual ao `init` e ao `accept`. Terminal falso (`script(1)`) contorna os três: resíduo já declarado na ADR-015 |
| Texto do agente chega ao terminal do operador pela mensagem de recusa | Id validado por formato antes de qualquer eco; justificativa e opção desconhecida nunca ecoadas | Não derrubado com 14 ids hostis |
| O comando mexe em entradas de outro standard | Função pura com teste de propriedade; releitura antes de gravar | Não derrubado na função; a corrida entre ler e gravar foi demonstrada e é o que a releitura fecha |
| Linter quebrado ou que não rodou conta como "sem achados" | Erro de linter sai com 3; nenhuma execução sai com 2 | Erro: não derrubado. Sem execução: demonstrado, e por isso a recusa |
| Escrita fora do projeto por link simbólico | `saveBaseline` existente (contenção por caminho real) | Não derrubado |
| Baseline refeito passa no CI sem aprovação | Gate inalterado: aumento de entradas exige o override do dono | Não derrubado em sete cenários |
| O operador aceita violação plantada sem perceber | Recusa de caminho novo sem a flag, medida contra o baseline da base; relato com caminhos novos e caminhos que cresceram; entradas mantidas e reduzidas conservam a justificativa | Fase R: demonstrado contra o relato só com totais (decisão 4). Fase V: demonstrado o contorno por entrada forjada no baseline da árvore (decisão 6); com a referência da base, recusado |

**Limites que ficam.**

- **Violação plantada em arquivo que já tinha entrada.** Na migração do protocolo antigo para o
  v2, as ocorrências por arquivo crescem legitimamente (o antigo registrava uma por arquivo).
  Uma violação plantada num arquivo que já tinha entrada aparece só como crescimento, igual ao
  crescimento legítimo. O comando mostra o caminho e os números; não tem como distinguir.
- **Linter que falha depois de imprimir parte dos achados.** Se ele sai com 1 e já imprimiu
  linhas `VIOLATION`, o contrato de saída do linter o trata como execução válida, e o comando
  grava o que foi impresso. É o contrato do engine, não deste comando.
- **Sem commit, a referência é a árvore.** Num repositório sem commit legível, os caminhos são
  medidos contra o baseline da árvore, que o agente consegue editar; o comando avisa.
- **Janela entre a releitura e a gravação.** Outro comando que grave entre a releitura e o
  `rename` do `saveBaseline` é sobrescrito. Exige coincidência de milissegundos e falha para o
  lado seguro: a violação aceita no meio volta como nova. Fica nas pendências.
- **Linter que roda e mente** (sai 0 sem analisar) faz as entradas do standard sumirem. Só
  encolhe, com o mesmo poder do `prune`, que o agente roda sem terminal. Fica nas pendências.
- **O log do gate tem teto de 200 linhas de baseline.** Num PR que regrava um standard grande, a
  entrada plantada pode ficar fora do log mesmo com o override aprovado; quem aprova vê o diff
  do PR, não só o log. O teto é anterior a este comando e fica nas pendências, com a prova de
  conceito.

## 8. Testes

Todos escritos antes do código. A asserção do guard de Bash é a exceção: ela fixa um
comportamento que já existe e passa de primeira.

**Unit, em `tests/lib/test-standards-baseline.mjs`:**

- as entradas dos outros standards saem idênticas (teste de propriedade com baselines gerados);
- entrada com mesma impressão digital e contagem fica intacta, com a justificativa antiga;
- entrada nova e entrada com contagem alterada recebem a justificativa, o autor e a data;
- standard sem achados atuais fica sem entradas;
- sem diferença, o resumo diz que não há o que gravar e devolve o mesmo baseline;
- caminhos novos e caminhos que cresceram são calculados por caminho, não por mensagem;
- regra chamada `constructor` ou `__proto__` é contada como qualquer outra.

**Unit, em `tests/lib/test-standards-engine.mjs`:** `checkFiles` devolve `linterRuns`.

**Integração, pelo CLI real, em `tests/integration/test-standards-check-cli.mjs`:**

- recusa sem terminal interativo e com `CI=1`;
- recusa sem baseline, sem `--reason`, com justificativa acima do teto, com dois ids, com
  `<std-id>` desconhecido e com opção desconhecida (`--dry-run` não grava);
- `<std-id>` malformado (caracteres de controle, sequência ANSI) não é ecoado;
- erro de linter sai com 3 e o arquivo do baseline fica byte a byte igual;
- nenhum linter rodou: exit 2 e arquivo intocado;
- caso feliz: depois de trocar a mensagem do linter, o `check --all` volta a acusar o legado; o
  `reinit` do operador deixa o `check --all` verde e as entradas do outro standard intactas;
- migração com arquivo plantado: a saída difere da migração legítima, o comando recusa sem a
  flag e aceita com ela;
- linter intacto e uma violação nova: as entradas mantidas conservam a justificativa antiga;
- baseline alterado durante a execução: exit 3 e nada gravado por cima;
- sem diferença: exit 0 e arquivo intocado.

**Guard de Bash:** uma asserção de que `devflow-standards baseline reinit …` pede confirmação.

**Acrescentados na fase V:**

- pelo binário real, as opções que o wrapper consumia são uso incorreto no `reinit` e
  desconhecidas no `check`;
- contagem que diminui conserva a entrada e a justificativa, e não entra na contagem por regra
  (unit e CLI);
- caminho novo medido contra a referência: na função pura, e pelo CLI com entrada forjada na
  árvore (referência HEAD) e com forja commitada na branch (referência merge-base).

**Sinais exigidos na fase V:** `unit`, `integration`, `e2e`, `lint` e `standards`.

**Fase V, segurança:** as provas de conceito do auditor são reexecutadas contra o código real.

## 9. Documentação e decisão

- **Guia** (`docs/guia-enforcement-standards.md`): linha na tabela de comandos; o trecho que
  chama o `accept` de único caminho para aumentar o baseline; o parágrafo sobre baseline criado
  com linters antigos, que passa a indicar o `reinit`; a nota de migração.
- **ADR-015 v1.1.0**: a guardrail e o risco aceito do `reinit` acompanham as decisões 4 e 5.
- **CHANGELOG**, em `[Unreleased]`.
- **Pendências** (`docs/superpowers/2026-10-06-standards-enforcement-pendencias.md`): o item da
  migração dos linters passa a citar o comando, e entram os achados da revisão que ficaram
  fora deste PR.

## 10. Fora do escopo

- A migração dos 21 linters (subprojeto 2).
- `baseline accept` aceitar mais de uma ocorrência por chamada.
- Override no GitLab.
- Refazer por arquivo ou por regra. O alcance é o standard inteiro.
- Tradução automática de entradas antigas em novas. Descartada: depende de adivinhar pela
  mensagem, na peça de garantia.
- Achados da revisão em código anterior, que vão para as pendências: o teto do log do gate; o
  `enforce`, que ecoa o id sem validar; `init`, `prune`, `accept` e `enforce`, que ignoram opção
  desconhecida; arquivo não rastreado que entra no baseline e trava o PR no gate; e o baseline
  "do HEAD" lido de outro repositório quando `GIT_DIR` vem do ambiente.

## 11. Critérios de aceitação

1. `baseline reinit <std-id> --reason "…"`, rodado pelo operador num projeto com baseline,
   refaz só as entradas daquele standard, e mantém intactas as que não mudaram.
2. Fora de terminal interativo, em CI, sem baseline, com argumento inválido, com standard
   desconhecido ou sem nenhuma execução de linter, o comando recusa com exit 2 e não grava.
3. Com caminho novo e sem `--allow-new-paths`, o comando lista os caminhos, sai com 2 e não
   grava.
4. Com erro de linter ou com o baseline alterado durante a execução, sai com 3 e não grava.
5. Os testes da §8 passam, e cada um foi visto falhar antes do código, exceto a asserção do
   guard de Bash.
6. Na fase V, as provas de conceito do auditor reexecutadas não deixam achado crítico ou alto em
   aberto.
