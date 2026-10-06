# Baseline de standards e entrega de normas num projeto real

## Resumo e escopo

Em 2026-10-06 medimos como o enforcement de standards do plugin DevFlow (a medição rodou entre os commits `10f720f` e `c47e0f5` da branch `docs/standards-enforcement-context-delivery`, que diferem só num arquivo de teste e2e) se comporta num projeto real de aplicação web com backend, front-end e pacote de contratos compartilhado. A medição foi feita num clone temporário do repositório do projeto, na branch `develop` (42 commits, 890 arquivos versionados, dos quais 330 são código de aplicação). Nada foi gravado no projeto; o clone foi apagado ao fim. O projeto é privado e este documento é público, por isso só aparecem números agregados e categorias de arquivo, nunca caminhos, trechos de código, nomes de tabela ou mensagens de linter.

Medimos quatro coisas: o custo e o resultado do `check --all` (com a criação do baseline), a latência dos hooks por edição, o efeito da entrega tardia de normas (as normas chegam junto do resultado da primeira edição, não antes) e os falsos positivos. Uma medição anterior, feita numa branch só de documentação do mesmo projeto, está numa seção própria no fim, porque mostra a configuração de standards e os achados em arquivos que não são código.

Ressalvas de método: a máquina estava ocupada com outras tarefas durante toda a medição (média de carga de 1 minuto entre 5 e 15, medida por `uptime` e `/proc/loadavg`; esperamos até 10 minutos pela carga cair abaixo de 2 e ela não caiu), então os tempos são pessimistas. O p95 de 10 amostras por arquivo equivale ao máximo. Não instalamos dependências na cópia.

## Configuração de standards do projeto

| Item | Valor |
|---|---|
| Standards efetivos | 26 |
| Ejetados no projeto (`source: local`, nível `block` por padrão) | 21 |
| Defaults do plugin (`devflow-default`, nível `warn`) | 5 |
| Standards com linter em `machine/` versionados no projeto | 24 arquivos |

Como o plugin tem 26 defaults, o projeto ejetou 21 deles e eles viraram `block` pelo default de `source: local`. Só 5 permanecem como defaults do plugin, e esses são `warn`. Isso explica quase tudo o que segue: quase todo standard aplicável a um arquivo de aplicação é `block`.

## 1. `check --all` e baseline

| Medição | Resultado | Como foi obtida |
|---|---|---|
| Tempo do `check --all --json`, sem baseline | 34,0 s (relógio), 173,6 s de usuário e 79,2 s de sistema, 744% de CPU (n=1) | `time`, uma execução, carga ~9 |
| Tempo do `check --all`, com baseline | 31,5 s (relógio), 169,7 s de usuário e 79,8 s de sistema, 791% de CPU (n=1) | `time`, uma execução, carga ~8 |
| Exit code sem baseline | 1 (violação `block`) | `$?` |
| Exit code com baseline | 0 | `$?` |
| Achados totais | 50 (44 `block`, 6 `warn`, 0 `review`, 0 erros) | contagem do JSON |
| Ocorrências no baseline criado | 50 em 12 standards | `baseline init`, soma de `count` |

O `check --all` não saiu com exit 3. O tempo é alto para um comando que o desenvolvedor ou o CI roda inteiro: cerca de meio minuto de relógio e mais de 4 minutos de CPU numa árvore de 890 arquivos e 26 standards, sem cache. Não é o caminho do hook (que roda um arquivo por vez), mas é o custo da fase V e do CI. Cada tempo é uma única execução, com a máquina carregada (carga de 8 a 9), então a diferença de 2,5 s entre as duas execuções da `develop` (34,0 s e 31,5 s) não significa nada. A medição na branch só de documentação levou 1,4 s (também n=1), contra cerca de 32 s na `develop`. Não isolamos a causa: o que os dados mostram é que a `develop` tem 890 arquivos contra 347 e standards aplicáveis a quase todos os 330 arquivos de aplicação (mediana de 21 por arquivo), o que provavelmente aciona muito mais linters; não medimos qual desses fatores domina.

### Achados por grupo e por standard

Contagens de achados (cada achado é um arquivo com pelo menos uma ocorrência; nas tabelas, "ocorrência" e "entrada do baseline" têm esse mesmo sentido por arquivo, e só no texto do falso positivo de performance "ocorrência" quer dizer cada trecho que casou no arquivo), separadas em três grupos: código de aplicação (backend, web e contratos), scripts de linter ejetados em `.context/engineering/standards/machine/` e o resto de `.context/` e documentação.

| Standard | Nível | Aplicação | Scripts `machine/` | Resto de `.context/` e docs |
|---|---|---:|---:|---:|
| std-observability | block | 0 | 24 | 0 |
| std-documentation | block | 0 | 6 | 0 |
| std-data-modeling | block | 0 | 1 | 0 |
| std-error-handling | block | 0 | 1 | 0 |
| std-migration | block | 1 | 1 | 0 |
| std-schemas | block | 0 | 1 | 0 |
| std-test-discipline | block | 0 | 1 | 0 |
| std-naming-conventions | block | 1 | 1 | 1 |
| std-design-antipatterns | block | 2 | 0 | 0 |
| std-internationalization | block | 3 | 0 | 0 |
| std-performance | warn | 4 | 1 | 0 |
| std-runtime-validation | warn | 0 | 1 | 0 |
| **Total** | | **11** | **38** | **1** |

Dois fatos saltam dos números. Primeiro, 38 dos 50 achados (76%) estão nos próprios scripts de linter que o projeto ejetou, versionados em `machine/`: o `check --all` lintou os linters. Esses achados são ruído puro e, como o `baseline init` aceita tudo o que o check vê, 38 das 50 entradas do baseline são ocorrências em scripts de enforcement, não em código do produto. Segundo, só 11 achados (22%) estão em código de aplicação, em 330 arquivos de aplicação (3,3% dos arquivos).

Os standards cujos achados são todos ruído de `machine/`: observability (24), documentation (6), data-modeling, error-handling, schemas, test-discipline e runtime-validation (1 cada).

## 2. Latência dos hooks

Cada hook foi executado como no Claude Code: processo `bash` do hook com o evento JSON de uma escrita (`Write`) no stdin, num clone com a branch de trabalho fora da lista de protegidas. Para cada combinação de arquivo e hook foram 11 execuções, descartada a primeira, o que dá 10 amostras; reportamos mediana e p95 em milissegundos. Cada execução usou um `session_id` novo (pior caso: nenhuma norma já entregue na sessão). Seis arquivos representativos: uma migration `.sql`, um service do backend, uma página do web, um schema do pacote de contratos, um teste unitário e um arquivo de aplicação com achado conhecido.

Três regimes de enforcement foram medidos, todos no mesmo clone: **A** sem nenhum standard `block` (os 21 ejetados rebaixados a `warn` com `enforce`), **B** com dois standards promovidos a `block` (migration e internationalization) e **C** como o projeto está (21 `block`).

`pre-tool-use` (gate de branch, normas do arquivo), mediana / p95 em ms:

| Arquivo | A: 0 block | B: 2 block | C: 21 block |
|---|---|---|---|
| migration `.sql` | 519 / 568 | 506 / 533 | 487 / 534 |
| service do backend | 514 / 559 | 519 / 564 | 495 / 569 |
| página do web | 487 / 522 | 531 / 582 | 495 / 543 |
| schema de contratos | 511 / 551 | 592 / 661 | 503 / 579 |
| teste | 508 / 535 | 604 / 718 | 524 / 570 |
| arquivo com achado | 503 / 536 | 585 / 601 | 513 / 579 |

`post-tool-use-lint` (linters síncronos dos standards que podem chegar a `block`), mediana / p95 em ms:

| Arquivo | A: 0 block | B: 2 block | C: 21 block |
|---|---|---|---|
| migration `.sql` | 69 / 79 | 96 / 114 | 97 / 119 |
| service do backend | 68 / 74 | 109 / 122 | 153 / 159 |
| página do web | 66 / 74 | 114 / 127 | 165 / 250 |
| schema de contratos | 75 / 85 | 111 / 132 | 141 / 161 |
| teste | 68 / 79 | 117 / 142 | 158 / 170 |
| arquivo com achado | 65 / 74 | 119 / 143 | 156 / 189 |

Além disso, um arquivo novo com violações introduzidas (regime C) levou 166 ms (mediana, p95 174 ms) no hook síncrono e produziu a decisão `block` com 775 caracteres de saída: o caminho de bloqueio não custa mais que o de arquivo limpo.

Conclusões: o hook síncrono, no pior regime medido (21 `block`), tem p95 máximo de 250 ms, 40 vezes abaixo do orçamento de 10 s. Sem nenhum `block` o hook custa 65 a 75 ms de mediana, que é essencialmente o spawn do bash e do node. O custo tem dois componentes: um degrau ao entrar no caminho dos linters (de 0 para 2 `block` a mediana sobe de 27 a 54 ms, conforme o arquivo) e um custo marginal pequeno por standard (de 2 para 21 `block` a mediana sobe de 1 a 51 ms, conforme quantos standards se aplicam ao arquivo; a migration `.sql` quase não muda). O `pre-tool-use` fica em torno de 0,5 s em todos os regimes; o custo dele é o carregamento de standards e da moldura de dados, não os linters. Os regimes foram medidos em sequência (C, depois A, depois B), com a média de carga de 1 minuto variando de 5 a 15 entre eles. O regime B tem a maior latência em vários arquivos, o que não é monotônico no número de `block` e indica ruído de carga. Diferenças menores que cerca de 100 ms entre regimes no `pre-tool-use` não devem ser lidas como efeito do regime. O maior valor foi 718 ms. Como a carga da máquina foi alta, os números reais tendem a ser iguais ou menores.

## 3. Entrega tardia das normas

O `additionalContext` do PreToolUse chega junto do resultado da ferramenta, não antes da edição. O que chega antes é o `SessionStart` (e o `SubagentStart`, que usa a mesma função).

### O que o SessionStart e o SubagentStart entregam

O texto de normas tem 8949 caracteres (limite de 9000). Dos 21 standards `block`, 3 chegam como resumo (princípios), 7 chegam só como ponteiro (o nome e o caminho) e 11 não chegam: o orçamento acaba e ficam apenas contados num rodapé de "omitidos". Os 5 standards `warn` (os defaults do plugin) não entram nesse canal, que só leva `block` e `review`. Ou seja, no projeto medido, o `SessionStart` não comporta as normas que o próprio projeto declarou como `block`.

### O que chega no contexto de pré-edição de um arquivo de aplicação

Medido nos 330 arquivos de aplicação versionados, com o cache de sessão vazio (primeira edição de cada arquivo), usando a mesma função que o hook usa.

| Medida | Valor |
|---|---|
| Standards aplicáveis por arquivo (mediana, mín., máx.) | 21, 2, 24 |
| Standards distintos aplicáveis ao conjunto de arquivos | 25 |
| Tamanho do contexto de pré-edição (mediana, p95, máx.) | 8142, 8142, 8142 caracteres |
| Arquivos acima de 9000 caracteres | 0 |
| Arquivos entre 3001 e 6000 / entre 6001 e 9000 | 52 / 278 |
| Resumos por arquivo (média) | 2,0 |
| Ponteiros por arquivo (média) | 16,2 |
| Itens adiados para a próxima edição | 0 |

O orçamento de resumos (6000 caracteres) acomoda só 2 standards; todo o resto vira ponteiro. Dos 25 standards distintos aplicáveis, 24 chegaram como ponteiro em pelo menos um arquivo. A reedição na mesma sessão não repete o que já foi entregue (a segunda edição do mesmo arquivo trouxe 0 itens).

### O resumo dos standards de ponteiro chega por outro canal?

Dos 24 standards que chegam como ponteiro: 2 têm resumo no SessionStart/SubagentStart, 7 têm só o ponteiro lá também e 15 (15 de 24) não aparecem nesse canal. Esses 15 são 11 `block` (os que o orçamento do SessionStart deixa de fora) e 4 `warn`. Para eles o texto das normas só chega se o agente seguir o ponteiro e ler o arquivo do standard. Isso confirma a suspeita da revisão anterior de que standards viram só ponteiro e o resumo não é entregue por outro canal (para esses 15, o resumo nunca chega; o ponteiro chega). A cifra de "cerca de 20 defaults" não se reproduz neste projeto porque ele ejetou 21 deles e só 5 permaneceram defaults; mesmo assim, 4 desses 5 (todos `warn`, portanto fora do SessionStart) chegam sempre como ponteiro e nunca têm o resumo entregue. Em projeto sem ejeção a proporção tende a ser pior, porque todos os defaults são `warn`; essa variante não foi medida.

### Efeito nos últimos commits

Tratando cada commit como uma sessão (cache zerado a cada commit) e contando os arquivos adicionados ou modificados nos 42 commits do projeto (o plano pedia os últimos 50, mas o histórico da `develop` é menor que isso e foi medido inteiro):

| Medida | Valor |
|---|---|
| Arquivos editados | 2754 |
| Com algum standard aplicável | 2754 (100%) |
| Distribuição por categoria | 1621 aplicação, 834 contexto e docs, 269 outros, 30 scripts `machine/` |
| Arquivos que disparam a primeira entrega de algum standard | 110 (4,0%) |
| Por commit (mediana, p95, máx.) | 3, 5, 6 |
| Commits sem nenhuma primeira entrega | 0 |
| Desses 110, existentes no HEAD (medíveis) | 98 |
| Tamanho do contexto de pré-edição (mediana, p95, máx.) | 5884, 8142, 8142 caracteres |
| Medíveis com ao menos um standard entregue como ponteiro | 66 (67%) |

Todos os arquivos têm algum standard aplicável porque há standards com `applyTo` abrangente. A primeira entrega é rara (4% das edições) porque, com o cache, depois das primeiras edições da sessão o contexto já foi entregue; mas todo commit tem pelo menos uma. Em 67% dessas primeiras entregas há ao menos um standard só como ponteiro. A cobertura por `SessionStart`/`SubagentStart` é parcial, como mostrado acima (10 dos 21 `block` com algum conteúdo).

## 4. Falsos positivos

Os 12 achados fora de `machine/` (11 em aplicação, 1 no resto) foram todos examinados na cópia (abaixo do teto de 10 por standard). A classificação é por arquivo achado.

| Classe | Quantidade | Padrão (descrição genérica) |
|---|---:|---|
| Verdadeiro | 2 | Plural escrito na mão com ternário sobre `=== 1` em mensagem de usuário (internationalization) |
| Discutível | 2 | Comentários de código com 5 ou mais travessões (design-antipatterns); `UPDATE` sem `WHERE` num teste de integração que altera dados de propósito (migration) |
| Falso | 8 | Veja abaixo |

Os 8 falsos positivos vêm de quatro padrões sistemáticos:

- **performance (4 achados, 6 ocorrências):** a regra de `SELECT *` dispara em chamadas a funções SQL que retornam conjunto (`select * from <função>(...)`), que não são varredura de tabela; os 4 achados são desse tipo (3 deles em testes).
- **naming-conventions (2 achados):** a regra de "boolean negativo" lê o helper de negação do ORM (um nome com "Not") como nome de booleano negativo; e uma string de fixture de teste com a palavra `enum` é lida como declaração de enum.
- **design-antipatterns (1 achado):** a regra de travessão conta `--` seguido de caractere, que casa com propriedades CSS customizadas (`var(--x)`) em arquivo TSX que não tem nenhum travessão.
- **internationalization (1 achado):** um ternário comum entre duas classes de estilo (`x === 1 ? a : b`) é lido como plural ternário.

Resultado: dos 12 achados fora de `machine/`, 17% são verdadeiros, 17% discutíveis e 67% falsos. Os 38 achados em `machine/` não entram na conta: são ruído por construção (o linter lintando o linter).

## 5. Recomendação de promoção a `block`

Como os 21 standards ejetados já são `block`, a pergunta prática é quais devem continuar `block` e quais devem voltar a `warn` até o linter melhorar.

1. **Antes de qualquer promoção, excluir `.context/engineering/standards/machine/` do `check --all` (ou do baseline).** Hoje 76% dos achados e 76% do baseline são desse diretório; nenhum número de `block` significa algo enquanto isso ficar assim. Neste projeto isso vem do plugin, não do projeto: o check percorre `machine/` como qualquer outro diretório, então é de esperar o mesmo em outros projetos que ejetam standards, mas só observamos um projeto (em duas branches).
2. **Manter `block`:** std-internationalization (3 achados, 2 verdadeiros), o único com achado real em aplicação nesta medição. Para os standards sem achado em código de aplicação (observability, documentation, data-modeling, error-handling, schemas, test-discipline, runtime-validation) não há evidência a favor nem contra: zero achado em 330 arquivos é compatível tanto com código limpo quanto com linter que não casa nada. Esta medição não decide o nível deles; a decisão fica para o uso e para um teste do linter com um caso conhecido.
3. **Rebaixar para `warn` até corrigir o linter:** std-naming-conventions (falso em todos os achados de aplicação) e a parte de CSS do std-design-antipatterns. **Manter `warn` (não promover) e corrigir o linter:** std-performance, que já é `warn` e teve 4 falsos em 4 achados em aplicação. Bloquear com 100% de falso positivo só ensina o agente e o desenvolvedor a contornar o gate.
4. **std-migration:** para os `.sql`, sem evidência a favor nem contra manter `block`: zero achado nas migrations é compatível tanto com migrations limpas quanto com linter que não casa nada. O que a medição mostra é que o linter precisa ignorar testes que adulteram dados de propósito; hoje o único achado em aplicação é desse tipo.
5. **Entrega de normas:** reduzir os `block` do SessionStart (11 de 21 ficam de fora) priorizando o resumo dos que têm achados; e considerar mais de 2 resumos na pré-edição, ou entregar o resumo curto (uma linha) de todos os aplicáveis, já que 15 standards aplicáveis a código (11 `block` e 4 `warn`) têm o resumo ausente de todos os canais (o ponteiro chega).

## 6. Branch só de contexto

Antes de a fonte da aplicação ser localizada na `develop`, medimos uma branch só de documentação do mesmo projeto, que contém só contexto e documentação (347 arquivos versionados, 50 commits, nenhum arquivo de aplicação). Vale por si porque mostra outra configuração de standards:

- Standards efetivos: 24, dos quais 19 ejetados (`block`) e 5 defaults do plugin (`warn`); o projeto desliga 2 dos 26 defaults e ejeta 19. Na `develop` são 26: 21 ejetados e 5 defaults.
- `check --all`: 1,44 s de relógio, exit 1, 26 achados `block`, todos em scripts de `machine/`: 16 de observability e 10 distribuídos entre outros standards. Zero achados em código de aplicação e zero no resto de `.context/` e documentação.
- Orçamento do SessionStart: 8941 caracteres de 9000; dos 19 `block`, 5 como resumo e 8 como ponteiro, e 26 itens (normas, ADRs e knowledge somados) omitidos por orçamento.
- Últimos 50 commits (581 arquivos, todos com standard aplicável, nenhum de aplicação): 52 arquivos (9%) com primeira entrega, mediana de 1 por commit; contexto de pré-edição com mediana 3618 e p95 8099 caracteres; 2 dos 51 medíveis com standard em ponteiro.

A diferença entre as duas branches é a presença do código: a configuração de standards é praticamente a mesma (19 contra 21 ejetados) e o orçamento do SessionStart está igualmente no limite, mas só na `develop` aparecem achados em aplicação e custo de `check --all` relevante. Isso confirma que a medição do enforcement precisa de uma árvore com código para dizer algo sobre o produto.

## 7. Limites desta medição

- Um único projeto, com 5 defaults restantes; o caso "projeto sem ejeção" não foi medido.
- Carga da máquina alta e variável durante toda a medição: os tempos de latência são limite superior provável.
- Sem linhas nos achados, a amostra de falsos positivos foi por arquivo; as ocorrências dentro de cada arquivo (por exemplo as 6 do std-performance) foram verificadas por pesquisa textual e não por inspeção de cada linha.
- A medição por histórico trata cada commit como uma sessão do agente, que é uma aproximação: sessões reais editam arquivos em ordem e quantidade diferentes.
- A medição de pré-edição com cache vazio é o pior caso por arquivo; o efeito do cache aparece apenas na verificação de reedição.
