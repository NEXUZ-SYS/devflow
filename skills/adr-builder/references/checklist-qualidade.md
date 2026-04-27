# Checklist de Qualidade do ADR

Antes de entregar o ADR finalizado ao usuário, passe pela checklist abaixo.
Cada item que falhar DEVE ser corrigido — ou, se não tiver informação, marcado
explicitamente como `<a definir>` no texto (nunca deixe vago).

## Frontmatter

- [ ] `name` é um slug kebab-case, curto e descritivo (ex: `zod-validacao-end-to-end`)
- [ ] `description` cabe em uma linha e diz o QUÊ é decidido (não o porquê)
- [ ] `scope` é `organizational` ou `project` (sem outros valores)
- [ ] `stack` é específico ou explicitamente `universal`
- [ ] `category` é uma das 7 categorias válidas (sem inventar)
- [ ] `status` é `Proposto` em ADRs novos (só vira `Aprovado` após revisão humana)
- [ ] `version` está preenchido como `0.1.0` em ADRs novos (semver do documento, não da stack)
- [ ] `supersedes` está presente como lista YAML — `[]` quando a ADR não substitui nenhuma outra, caso contrário uma lista de slugs exatos
- [ ] `refines` está presente como lista YAML — `[]` quando a ADR não refina nenhuma outra, caso contrário lista de slugs
- [ ] `protocol_contract` está presente — `null` exceto quando `category: protocol-contracts` (aí preencher com nome + versão, ex: `"PosV1"`)
- [ ] `decision_kind` é `firm`, `gated` ou `reversible` (default `firm`)
- [ ] `created` é a data de hoje no formato `YYYY-MM-DD`

## Título

- [ ] Frase nominal curta focada na decisão (não na pergunta)
- [ ] Evita palavras vazias: "Escolha de...", "Melhorias em...", "Sobre..."
- [ ] Bom: `Adotar Zod como validador único entre frontend e backend`
- [ ] Ruim: `Decisão sobre validação`

## Foco em stack e arquitetura (não em produto/negócio)

- [ ] O Contexto fala em termos de stack, camada arquitetural e forças técnicas — não de "o que o produto faz para o cliente"
- [ ] A Decisão afirma a adoção de uma tecnologia/padrão em uma camada, não uma funcionalidade de produto
- [ ] Consequências e Guardrails mencionam artefatos técnicos (arquivos, imports, contratos, APIs) — não processos operacionais, clientes, verticais de mercado ou jornadas de usuário
- [ ] O documento continuaria válido se o produto mudasse — ou seja, a decisão arquitetural é reutilizável em outro produto com a mesma stack
- [ ] Nomes de clientes, KPIs de negócio, fluxos operacionais e lógica de domínio estão ausentes do texto

## Contexto

- [ ] Tem pelo menos 2 parágrafos ou 4 frases substantivas
- [ ] Descreve o problema ANTES da solução (não antecipa a decisão)
- [ ] Usa linguagem neutra (não defende a escolha ainda)
- [ ] Menciona restrições técnicas concretas (stack, camada, perf, compliance) quando houver

## Decisão

- [ ] Está em voz ativa afirmativa: "Vamos usar X", "Adotamos Y"
- [ ] Um leitor consegue saber o QUE foi escolhido sem ambiguidade
- [ ] Não repete o contexto — vai direto ao ponto
- [ ] Não mistura múltiplas decisões (se tiver, separar em ADRs distintos)

## Alternativas Consideradas

- [ ] Tem pelo menos 2 alternativas + a escolhida (total: 3+)
- [ ] Cada alternativa tem nome curto E razão de descarte/escolha
- [ ] A razão de descarte é específica (não "não se adequa")
- [ ] A opção escolhida aparece marcada com "✓" ou "(escolhida)"

## Consequências

- [ ] Lista positivas E negativas (nunca só positivas — ADR não é venda)
- [ ] Inclui pelo menos um custo/trade-off concreto
- [ ] Menciona risco residual aceito quando houver
- [ ] Evita generalidades ("melhora a DX" sem dizer como)

## Guardrails

- [ ] Tem pelo menos 2 regras acionáveis
- [ ] Cada regra começa com verbo imperativo: SEMPRE, NUNCA, QUANDO/ENTÃO
- [ ] Cada regra é **verificável em code review** por outra pessoa
- [ ] Nenhuma regra é vaga ("seguir boas práticas", "ter cuidado com X")
- [ ] Não há duplicatas ou regras conflitantes

## Enforcement

- [ ] Tem pelo menos 1 mecanismo concreto marcado
- [ ] Cada mecanismo especifica O QUE é verificado, não só "ter CI"
- [ ] Se tem "lint", diz qual ferramenta/regra
- [ ] Se tem "teste", diz o que deve estar coberto
- [ ] Checkboxes estão no formato `- [ ]` (GFM checkbox)

## Evidências / Anexos

- [ ] A seção contém APENAS fontes oficiais e RFCs — nenhuma referência a Medium, dev.to, blogs pessoais, tutoriais de terceiros, Stack Overflow, YouTube ou material de marketing
- [ ] Fontes permitidas: docs oficiais do projeto/framework, specs W3C/WHATWG/ECMA/IETF, changelogs oficiais, issues/PRs do repositório canônico, papers acadêmicos com DOI
- [ ] Cada fonte tem nome + versão (quando aplicável) + URL oficial completa
- [ ] Se tem bloco de código, a linguagem está especificada (```python, ```ts, etc.)
- [ ] Exemplo de código é mínimo e demonstra uso CORRETO (não patológico), focando no uso da stack — não em lógica de produto
- [ ] Se não há evidências, remove a seção ou deixa vazia com `N/A`

## Densidade e comprimento (ADR é gatilho semântico, não tutorial)

- [ ] Total do documento entre 80 e 120 linhas (frontmatter + headers + código inclusos); idealmente ~100
- [ ] Contexto: no máximo 5-6 linhas, frases curtas, sem explicar conceitos que o vocabulário já implica
- [ ] Decisão: no máximo 4-6 linhas + opcionalmente 1 diagrama ASCII pequeno (5-8 linhas). Frases curtas, afirmativas
- [ ] Alternativas: uma linha por opção, tradeoff expresso em até 12 palavras
- [ ] Consequências: bullets em formato `trigger → outcome` ou lista de keywords; sem parágrafos explicativos
- [ ] Evidências: apenas UM exemplo de código minimal (15-20 linhas); se precisar de mais de um para explicar o padrão, escolha o mais representativo
- [ ] Nenhuma frase do tipo "isto significa que...", "em outras palavras...", "ou seja..." — se a frase restata o anterior, deletar
- [ ] Nenhuma definição de conceito técnico corrente (não explicar o que é SRP, tree-shaking, FSD, RBAC, idempotência, etc. — o leitor-IA e o leitor-engenheiro já sabem)

## Estrutura geral

- [ ] Ordem das seções segue o template (não reordenar)
- [ ] **NÃO há seção de "Relacionamentos" em prosa** — links estruturais vivem em `supersedes` e `refines` (frontmatter), links externos vivem em Evidências
- [ ] Não há outras seções extras além das do template (exceto seção opcional "Preservações" em decisões brownfield, ou seções extras pedidas pelo usuário)
- [ ] Markdown renderiza sem erros (headers, listas, tabelas válidos)
- [ ] Nome do arquivo bate com `name` do frontmatter: `NNNN-<name>.md`
