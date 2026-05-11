# Roadmap futuro — devflow context layer (validação de pipeline)

> **Status:** backlog (não-bloqueante para v0.14 atual em produção)
> **Owner sugerido:** Walter Frey (Tech Lead NXZ)
> **Data:** 2026-05-06
> **Origem:** sessão de geração de exemplos validados de stack refs

Este documento agrupa **2 itens de melhoria** identificados durante a geração dos primeiros stack refs do devflow (`next@15.0.4.md`, `prisma@5.22.0.md`, `vitest@2.1.5.md`). Ambos surgiram do mesmo evento: descoberta de que arquivos `.md` gerados por LLM sem fonte explícita continham alucinações estruturais (paths inventados, APIs de versões erradas, examples não-validados).

Os itens estão agrupados aqui (em vez de virarem patches do plano v2 imediato) porque o plano v2 já está em produção. **Anotação para roadmap próximo (provavelmente v0.15 ou v0.16).**

---

## Item 1 — Aviso explícito na §3.2 do plano v2 sobre risco de geração manual

### Contexto

A §3.2 do `devflow-context-layer-validation-v2-pt-br.md` descreve a anatomia do arquivo `.md` que o pipeline `docs-mcp-server` + `md2llm` gera. A seção tem 2 papéis no plano:

1. **Especificação técnica** do formato de output do pipeline
2. **Documentação de referência** do que vai dentro de `.context/stacks/refs/<lib>@<version>.md`

O que falta hoje na §3.2: um **aviso operacional** sobre o que NÃO é aceitável. Especificamente, um avise contra **geração manual** desses arquivos por LLM sem rodar o pipeline real, mesmo em "modo emergencial" ou "para teste rápido".

### Por que importa

Durante a geração de exemplos de stack refs nesta sessão, foram produzidos 3 arquivos com qualidade aparente alta mas conteúdo alucinado:

- `next@15.0.4.md` original: paths `SOURCE:` inventados (ex.: `docs/02-app/01-building-your-application/01-routing/15-middleware.mdx` que não existe no repo), uso obrigatório de `async function` que é opcional na doc oficial, snippet de Node.js runtime que só existe em v15.5+ (não em v15.0.4)
- `prisma@5.22.0.md` original: snippets sintaticamente corretos mas misturando práticas de versões diferentes
- `vitest@2.1.5.md` original: similar — sintaxe parecia correta mas alguns examples eram de v3.x

Isso é **exatamente o problema que o pipeline artesanal resolve** (ADR-0002 do plano v2). Mas se um dev no futuro decidir "criar manualmente um stack ref para testar rápido", ele reintroduz silenciosamente o problema que o ADR removeu — e o resto do sistema (filtragem semântica, hooks, OTel) confiará no arquivo como se fosse output legítimo do pipeline.

### Aviso proposto

Adicionar **antes** do bloco "Tamanhos típicos" da §3.2, em destaque visual:

```text
⚠️ NUNCA gere `.context/stacks/refs/<lib>@<version>.md` manualmente.

A única fonte autorizada para esses arquivos é o pipeline artesanal
(`devflow stacks scrape-batch` ou `devflow stacks scrape`).

Geração manual via LLM ou copy-paste de docs introduz silenciosamente:
- paths SOURCE inventados (sem rastreabilidade)
- snippets misturando APIs de versões diferentes
- examples não-validados contra a versão pinada

Tudo isso passa nos sanity checks (≥5 snippets, headers presentes) mas
falha no TDD HARD-GATE quando o agent gera código baseado nos snippets
alucinados. O arquivo precisa vir de fonte determinística.

Para refresh emergencial sem rodar o pipeline completo: usar
`devflow stacks scrape <lib> <version> --mode=refresh --no-batch`
que é mais rápido (~30s) mas mantém integridade da fonte.
```

### Ação

- [ ] Adicionar aviso na §3.2 do plano v2 quando próxima revisão major do plano acontecer
- [ ] Considerar adicionar mesmo aviso no SKILL.md da `devflow:scrape-stack-batch` (§3.6)
- [ ] Adicionar entry no `8. Anti-patterns a evitar` cobrindo "geração manual de stack refs"

### Trigger para executar

Próxima revisão do plano v2 (estimada para v0.16 quando feedback do roadmap atual chegar) OU quando primeiro caso de "stack ref alucinado" for detectado em produção.

---

## Item 2 — Checklist de validação para qualquer scrape (manual OU pipeline)

### Contexto

Mesmo após implementar o pipeline `docs-mcp-server` + `md2llm` em produção, ainda é possível ter scrapes ruins por causas diferentes:

- Fonte oficial de docs muda estrutura entre versões (ex.: Next.js mudou de `02-app/01-building-your-application` para `01-app/03-api-reference`)
- Lib publica changelog/release notes mas não atualiza docs paralelamente
- Pipeline scraping completa com sucesso mas captura página errada (404 silencioso, redirect)
- md2llm extrai blocos sem código válido (heading estilo "Coming soon")
- Versão pinada no manifest não bate com versão real no código

Hoje o `devflow context verify --include=stacks` (§4.4 do plano v2) checa apenas:

- Existência do arquivo `<lib>@<version>.md`
- Tamanho > 1KB
- ≥5 blocos de código
- Hash sha256 atualizado em `.lock`

Isso é insuficiente para garantir **qualidade semântica** do scrape.

### Checklist proposto

Para aplicar antes de commitar qualquer arquivo `.md` em `.context/stacks/refs/` (manual ou via pipeline), 3 categorias de checks:

#### Categoria 1 — Validação de fonte (5 checks)

```text
[ ] 1.1 Header SOURCE de cada snippet aponta para path EXISTENTE
        no repo/site oficial da lib na versão pinada
        Verificação: rodar `devflow stacks validate-sources <lib>@<version>`
        que faz HEAD request em cada SOURCE único e reporta 404s

[ ] 1.2 Versão pinada em manifest.yaml bate com versão da fonte scrapeada
        Verificação: comparar `frameworks.<lib>.version` com tag/branch
        usada em `frameworks.<lib>.source.tag` ou `source.version`

[ ] 1.3 Diferenças entre versão real e versão da fonte estão marcadas
        Quando v15.0.4 foi pinada mas scrape veio de v15.5.6 (caso real),
        snippets devem ter tag explícita [v15.0.4 OK] vs [v15.5+]

[ ] 1.4 Header de proveniência declara fonte primária + data do scrape
        Não é exigência do md2llm, mas útil para audit trail. Pode ser
        adicionado pelo `pipeline.mjs` da skill scrape-stack-batch

[ ] 1.5 Hash sha256 do arquivo final está em .context/.lock
        Verificação: comparar `sha256sum <file>` com `.lock` entry
```

#### Categoria 2 — Validação semântica (4 checks)

```text
[ ] 2.1 Snippets compilam isoladamente
        Verificação: extrair cada bloco LANGUAGE: typescript do arquivo,
        salvar em /tmp/snippet-N.ts, rodar `tsc --noEmit` e reportar erros
        Útil para detectar examples com imports quebrados ou APIs deprecadas

[ ] 2.2 Snippets não usam APIs de outra versão major
        Verificação: para cada snippet, buscar APIs conhecidamente removidas
        ou renamed entre versões majors. Ex: useFormState (R18) → useActionState (R19)
        Pode ser implementado como dicionário de "anti-API" por (lib, version)

[ ] 2.3 Cobertura mínima de topics declarados em manifest.yaml
        Se manifest declara `topics.auth: [middleware, session, cookies]`,
        scrape deve ter ≥1 snippet com TITLE/DESCRIPTION batendo cada keyword
        Sinal de scrape parcial ou broken sitemap

[ ] 2.4 Sample de N=3 snippets validado manualmente por humano
        Antes do primeiro commit de uma lib nova, dev faz spot-check em
        3 snippets aleatórios: SOURCE existe? código compila? versão bate?
        Logado em `.context/stacks/audits/<lib>@<version>-audit.md`
```

#### Categoria 3 — Validação de integridade (3 checks)

```text
[ ] 3.1 Headers TITLE/DESCRIPTION/SOURCE/LANGUAGE/CODE em todos snippets
        Verificação: contar headers; todos devem ter mesmo count
        Implementado hoje em `devflow stacks validate` mas pode ser expandido

[ ] 3.2 Separadores `---...---` consistentes (40 hífens, 1 por snippet)
        Verificação: regex match contra padrão exato; reportar variantes

[ ] 3.3 Tamanho total do arquivo dentro de banda esperada
        Verificação: comparar com estimativas do plano v2 §3.2
        Ex: next@15 esperado 280-340 snippets; menos de 50 = scrape parcial
```

### Implementação proposta

Comando novo: `devflow stacks audit <lib>@<version> [--checklist=<path>]`

- Lê arquivo do `.context/stacks/refs/`
- Roda os 12 checks acima
- Emite relatório markdown em `.context/stacks/audits/<lib>@<version>-audit.md`
- Exit code 0 se todos passam, 1 se algum falha
- Modo `--strict` falha em warnings também

Integração com pipeline:

- `devflow stacks scrape-batch` chama `audit` automaticamente após cada scrape
- Se audit falha, comando volta para Fase C (confirmação humana) com erros listados
- Humano decide: retry, retry-alt, skip-with-warning (commitado mas marcado), abort

### Ação

- [ ] Especificar comando `devflow stacks audit` (signature, flags, output format)
- [ ] Implementar 12 checks como skill `devflow:audit-stack` ou módulo da `scrape-stack-batch`
- [ ] Definir formato do relatório markdown em `.context/stacks/audits/`
- [ ] Decidir se audit é obrigatório (block commit se falha) ou advisory (apenas warns)
- [ ] Calibrar thresholds de cobertura mínima por categoria de lib
- [ ] Adicionar audit como item da Fase 4 (Verify) do plano v2 quando disponível

### Trigger para executar

Recomendação: implementar **antes** da Semana 3 do roadmap atual (quando primeiro batch de stacks reais será scrapeado). Audit em produção desde o dia 1 evita acumular dívida.

Se for adiado: implementar quando primeiro problema de "scrape parcial" ou "version mismatch" for detectado em produção. Tipicamente após 3-6 meses de uso.

---

## Notas finais

Os itens 1 e 2 são **complementares mas independentes**:

- **Item 1** previne o problema upstream (geração manual sem fonte)
- **Item 2** detecta o problema downstream (qualquer scrape ruim, manual ou não)

Implementar apenas item 1 = risco residual de pipeline gerar arquivo ruim sem sinal externo.
Implementar apenas item 2 = ainda permite que devs escrevam manualmente "para teste" e gerem ruído operacional.

Implementar os dois = defense-in-depth alinhado com o princípio de não-invasão (§1.4) e auditabilidade (§5.5) do plano v2.
