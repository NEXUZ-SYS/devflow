# `baseline reinit`: refazer o baseline de um standard — Design

**Data:** 2026-10-08
**Workflow PREVC:** `baseline-reinit-standard` · **Escala:** MEDIUM · **Autonomia:** supervised
**Status:** desenho aprovado em conversa pelo operador; aguardando a revisão desta spec
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

A migração dos linters tem spec própria, a escrever depois desta entrega. Já está decidido para
ela: um `ruleId` por verificação nos 18 linters de perfil.

## 3. Interface

```
devflow-standards baseline reinit <std-id> --reason "<justificativa>"
```

| Exit | Quando |
|---|---|
| 0 | Gravou o baseline novo, ou não havia diferença a gravar |
| 2 | Uso incorreto ou ação recusada |
| 3 | Erro de execução (linter fora do contrato, baseline inválido) |

São os mesmos códigos dos outros subcomandos de `baseline`.

## 4. Comportamento

### 4.1 Pré-condições, nesta ordem

1. **Argumentos válidos.** `<std-id>` casa `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` e `--reason` não
   é vazio. Senão: mensagem de uso, exit 2, **sem ecoar** o valor recebido. A validação vem antes
   de qualquer mensagem que repita o id, pelo mesmo motivo do `accept`: o valor pode vir do
   agente e vai parar num comando que o humano cola no terminal.
2. **Terminal interativo e fora de CI.** Senão: recusa pelo caminho existente
   (`refuseNonInteractive`), exit 2.
3. **Baseline existe** (no arquivo ou, removido da árvore, na versão do HEAD). Senão: exit 2,
   apontando o `baseline init`.
4. **`<std-id>` é um standard efetivo do projeto**, isto é, está no mesmo conjunto que o `check`
   avalia (defaults do plugin, perfis e os do projeto, já descontados os desligados). Senão:
   exit 2. Um standard removido ou desligado que ainda tenha entradas sai pelo `prune`.

### 4.2 Execução

Roda **só o linter do standard alvo** sobre todos os arquivos do projeto, sem baseline. Se o
linter falhar em qualquer arquivo, sai com 3 e **não grava nada**.

Isto refina o que foi apresentado em conversa ("roda os linters no projeto inteiro"): os outros
standards não são reavaliados, porque as entradas deles não mudam. Um linter quebrado de outro
standard não impede a operação.

### 4.3 Resultado

- As entradas dos **outros** standards ficam exatamente como estavam: mesmos campos, mesma ordem.
- As entradas do standard alvo saem todas, inclusive as órfãs.
- Entram os achados atuais do standard alvo, de qualquer nível, uma entrada por impressão
  digital com a contagem de ocorrências. Cada entrada nova registra a justificativa, quem rodou
  e a data. Ficam depois das preservadas, na ordem em que o engine devolve os achados.
- **Sem diferença, não grava.** Se o conjunto de impressões digitais e contagens do standard já
  é o atual, o comando informa isso e sai com 0 sem tocar no arquivo. Evita um diff só de datas
  num arquivo que tem dono no `CODEOWNERS`.

### 4.4 Relato

Uma linha com o que saiu e o que entrou, em entradas e em ocorrências, e a contagem do que
entrou por regra. Se o linter do standard ainda está no protocolo antigo, o aviso que o `init` e
o `check` já emitem.

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

## 6. Estrutura

- **`reinitStandard(baseline, findings, stdId, { reason, by })`**, função pura em
  `scripts/lib/standards-baseline.mjs`. Devolve o baseline novo e um resumo (o que saiu, o que
  entrou, e se houve diferença). Não lê disco nem roda linter.
- **Ramo `reinit` em `cmdBaseline`**, em `scripts/lib/standards-check-cli.mjs`: valida, coleta os
  achados com o `stdFilter` do engine, chama a função pura, grava com o `saveBaseline` existente
  e imprime o relato.

Nenhum módulo novo. A escrita reaproveita o `saveBaseline`, com a contenção por caminho real
que ele já faz.

## 7. Segurança

O comando aumenta o baseline, então é da mesma classe do `init` e do `accept` (ADR-015, D6: só o
humano aumenta o baseline). A tabela diz o que segura cada ameaça; é o que a revisão da fase R
deve tentar derrubar com prova de conceito.

| Ameaça | O que segura |
|---|---|
| O agente roda o comando | Recusa fora de terminal interativo e em CI; guard de Bash pede confirmação |
| Texto do agente chega ao terminal do operador pela mensagem de recusa | Id validado por formato antes de qualquer eco; a justificativa nunca é ecoada |
| O comando mexe em entradas de outro standard | Função pura com teste de propriedade: as outras entradas saem idênticas |
| Linter quebrado conta como "sem achados" e zera as entradas | Erro de linter sai com 3 antes de gravar |
| Escrita fora do projeto por link simbólico | `saveBaseline` existente (contenção por caminho real) |
| Baseline refeito passa no CI sem aprovação | Gate inalterado: aumento de entradas exige o override do dono |

**Risco aceito.** O comando registra **todos** os achados atuais do standard, inclusive
violações novas que tenham entrado desde o último baseline. É o mesmo poder do `init`. Os
controles são o operador no terminal e o override no CI. O relato por regra existe para o
operador ver o que está aceitando.

## 8. Testes

Todos escritos antes do código.

**Unit, em `tests/lib/test-standards-baseline.mjs`:**

- as entradas dos outros standards saem idênticas e na mesma ordem (teste de propriedade com
  baselines gerados);
- as entradas do alvo são substituídas, com contagem por impressão digital e com justificativa,
  autor e data;
- standard sem achados atuais fica sem entradas;
- sem diferença, o resumo diz que não há o que gravar.

**Integração, pelo CLI real, em `tests/integration/test-standards-check-cli.mjs`:**

- recusa sem terminal interativo e com `CI=1`;
- recusa sem baseline, sem `--reason` e com `<std-id>` desconhecido;
- `<std-id>` malformado (caracteres de controle, sequência ANSI) não é ecoado;
- erro de linter sai com 3 e o arquivo do baseline fica byte a byte igual;
- caso feliz: depois de trocar a mensagem do linter, o `check --all` volta a acusar o legado; o
  `reinit` do operador deixa o `check --all` verde e as entradas do outro standard intactas;
- sem diferença: exit 0 e arquivo intocado.

**Guard de Bash:** uma asserção de que `devflow-standards baseline reinit …` pede confirmação.

**Sinais exigidos na fase V:** `unit`, `integration`, `e2e`, `lint` e `standards`.

## 9. Documentação e decisão

- **Guia** (`docs/guia-enforcement-standards.md`): linha na tabela de comandos; o trecho que
  chama o `accept` de único caminho para aumentar o baseline; o parágrafo sobre baseline criado
  com linters antigos, que passa a indicar o `reinit`; a nota de migração.
- **ADR-015**: evolução menor, registrando o `reinit` como segundo caminho do operador para
  aumentar o baseline. Oferecida ao operador no passo de ADR do planejamento.
- **CHANGELOG**, em `[Unreleased]`.
- **Pendências** (`docs/superpowers/2026-10-06-standards-enforcement-pendencias.md`): o item da
  migração dos linters passa a citar o comando.

## 10. Fora do escopo

- A migração dos 21 linters (subprojeto 2).
- `baseline accept` aceitar mais de uma ocorrência por chamada.
- Override no GitLab.
- Refazer por arquivo ou por regra. O alcance é o standard inteiro.
- Tradução automática de entradas antigas em novas. Descartada: depende de adivinhar pela
  mensagem, na peça de garantia.

## 11. Critérios de aceitação

1. `baseline reinit <std-id> --reason "…"`, rodado pelo operador num projeto com baseline,
   troca só as entradas daquele standard pelos achados atuais.
2. Fora de terminal interativo, em CI, sem baseline, sem justificativa ou com standard
   desconhecido, o comando recusa com exit 2 e não grava.
3. Com erro de linter, sai com 3 e não grava.
4. Os testes da §8 passam, e cada um foi visto falhar antes do código.
5. A revisão de segurança da fase R não deixa achado crítico ou alto em aberto.
