# Briefing Estruturado para ADR

Use este roteiro quando o usuário pedir para criar um ADR em **modo guiado**.
Faça as perguntas em blocos (não todas de uma vez) e use `ask_user_input_v0` quando
as respostas forem selecionáveis em 2-4 opções curtas — caso contrário, pergunte em prosa.

## Bloco 1 — Identificação (obrigatório)

1. **Qual decisão você quer registrar?** (frase curta, estilo "Usar X para Y")
2. **Escopo**: `organizational` (vale para toda a empresa) ou `project` (vale só para 1 projeto)?
3. **Stack/plataforma afetada**: ex. Python, Node.js, React, universal, infraestrutura...
4. **Categoria** (escolha UMA):
   - `principios-codigo` — clean code, convenções, padrões de escrita
   - `qualidade-testes` — estratégia de testes, cobertura, TDD
   - `arquitetura` — decisões estruturais (frameworks, padrões, organização)
   - `seguranca` — autenticação, autorização, proteção de dados
   - `infraestrutura` — deploy, observabilidade, CI/CD, cloud
   - `protocol-contracts` — contratos de protocolo e schemas canônicos (MCP, APIs internas com versionamento, event schemas, RS/AS split)
   - `agent-harness` — frameworks de agentes LLM (agent loop, memory, skill execution, tool-use harness, HITL, eval harness)

> **Nota sobre o frontmatter:** os campos `version`, `supersedes`, `refines`, `protocol_contract` e `decision_kind` **não são perguntados diretamente**.
> - `version` é sempre `0.1.0` em ADRs novas (semver do documento, não da stack).
> - `supersedes` é `[]` salvo se o usuário mencionar explicitamente que esta ADR substitui outra.
> - `refines` é `[]` salvo se a decisão for de tipo "política refina arquitetura" (ex: SLO refina escolha de framework). Preencher com slug do ADR-pai apenas quando a relação for clara — é metadado de navegação, não contexto de geração (Hard Rule #12).
> - `protocol_contract` é `null` exceto quando `category: protocol-contracts` — aí preencher com nome do contrato + versão (ex: `"PosV1"`).
> - `decision_kind` default é `firm`. Use `gated` quando a decisão tem portão de revisão futura definido (ex: "reavaliar em 6 meses"); use `reversible` para experimentos explícitos. Inferir do contexto; não precisa perguntar em ADRs triviais.

## Bloco 2 — Contexto (obrigatório)

5. **Qual problema ou dor esta decisão resolve?** (2-4 frases)
6. **Qual é o estado atual?** O que acontece hoje sem esta decisão?
7. **Há restrições relevantes?** (ex. orçamento, tamanho do time, prazo, compliance)

## Bloco 3 — Alternativas (obrigatório)

8. **Quais opções foram consideradas?** Peça ao menos 2 alternativas + a escolhida.
   - Para cada uma: nome curto + 1 linha de por que foi descartada ou escolhida.
   - Se o usuário só trouxe uma opção, **pergunte explicitamente** quais outras foram avaliadas — decisão sem alternativas é receita, não ADR.

9. **Qual foi a opção escolhida e por quê?** (razão principal, amarrada ao problema)

## Bloco 4 — Consequências (obrigatório)

10. **O que melhora com essa decisão?** (benefícios concretos, não genéricos)
11. **Qual é o custo ou trade-off?** (o que piora, o que exige esforço extra)
12. **Há risco residual aceito?** (algo que sabemos que pode dar errado e aceitamos)

## Bloco 5 — Guardrails e Enforcement (obrigatório — é o diferencial deste template)

13. **Quais regras acionáveis derivam dessa decisão?**
    - Peça regras no formato `SEMPRE X`, `NUNCA Y`, `QUANDO X ENTÃO Y`
    - Cada regra deve ser **verificável em code review** (se não dá pra verificar, não é guardrail)
    - Mínimo 2 regras, ideal 3-5.

14. **Como essas regras serão verificadas?** (marque todos os mecanismos aplicáveis)
    - [ ] Code review (checklist específico)
    - [ ] Lint/análise estática (qual ferramenta/regra)
    - [ ] Teste automatizado (o que deve estar coberto)
    - [ ] Gate de CI (o que falha o build)

## Bloco 6 — Evidências (opcional)

15. **Há documentação oficial da stack ou specs relevantes?** Apenas fontes oficiais são aceitas:
    - PERMITIDO: docs oficiais do projeto/framework, specs W3C/WHATWG/ECMA/IETF (RFCs), changelogs oficiais, issues/PRs do repositório canônico, papers acadêmicos com DOI.
    - PROIBIDO: Medium, dev.to, blogs pessoais, tutoriais de terceiros, Stack Overflow, YouTube, material de marketing.
    - Se o usuário sugerir uma fonte proibida, **recuse e peça a fonte oficial equivalente**.
16. **Tem exemplo de código mínimo demonstrando a aplicação da stack nesta camada?** (opcional mas recomendado — deve focar no uso técnico, não em lógica de produto)

> **Nota:** esta ADR **não tem seção de "Relacionamentos"**. Links estruturais entre ADRs vivem exclusivamente no campo `supersedes` do frontmatter. Se o usuário mencionar "essa decisão substitui a ADR X", registre no `supersedes: [slug-x]` — não crie seção de prosa para isso.

---

## Regras de conduta durante o briefing

- **Não invente respostas.** Se o usuário não souber, registre `<a definir>` no campo e siga em frente.
- **Não aceite decisão sem alternativas.** Força o usuário a listar pelo menos uma opção descartada.
- **Não aceite guardrails vagos.** "Seguir boas práticas" não é guardrail — recuse e peça reformulação concreta.
- **Separe stack de produto.** Se a resposta misturar decisão técnica com funcionalidade de produto ou operação de negócio, peça ao usuário para reformular em termos puramente arquiteturais. O ADR fala da stack na sua camada — não de o que o produto faz para o cliente final.
- **Comprima ao gerar, não ao perguntar.** O usuário pode responder em prosa longa — isso é ok. Sua responsabilidade é **comprimir a resposta dele para frases curtas e keywords no ADR final**, nunca reproduzir verbatim. Mira: documento entre 80-120 linhas, Contexto em 4-6 frases, Consequências em bullets de `trigger → outcome`, zero explicação de conceito técnico corrente.
- **Questione decisões que parecem receita de bolo.** Se a "decisão" é só "usar a ferramenta popular X", pergunte o porquê — um ADR existe para capturar raciocínio, não preferências.
- **Mantenha o tom conciso.** Respostas do usuário podem ser telegráficas; sua responsabilidade é transformá-las em prosa clara no ADR final.
