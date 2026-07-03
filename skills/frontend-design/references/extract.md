# extract — extrair padrões e tokens do código para o design system

## Objetivo

Identificar padrões de UI repetidos e valores de design hard-coded no código e consolidá-los em um design system centralizado — componentes reutilizáveis e **tokens** — para reuso consistente. Diferente do `document` (que fotografa o estado atual), o `extract` **refatora**: transforma duplicações reais do codebase em primitivas nomeadas.

## Quando usar

- Quando o mesmo padrão aparece **3+ vezes com a mesma intenção**.
- Estilo inconsistente ou lógica de implementação duplicada entre telas/arquivos.
- Antes de escalar um front-end que cresceu por cópia-e-cola.

## Passos

1. **Descobrir o design system** — localize a biblioteca de componentes existente e entenda sua estrutura, convenções de nome e organização. Se não existe, **pergunte antes de criar uma** — não imponha estrutura.
2. **Identificar padrões** — varra oportunidades de extração: componentes repetidos, valores hard-coded (cores, espaçamento, tipografia), variações inconsistentes do mesmo elemento, padrões de composição, estilos de tipo, padrões de animação.
3. **Planejar a extração** — documente quais componentes, tokens e variantes extrair; alinhe a nomenclatura às convenções existentes; defina a estratégia de migração.
4. **Extrair e enriquecer** — construa versões melhoradas com API de props clara, acessibilidade (ARIA, navegação por teclado, estados de foco), variantes adequadas e documentação.
5. **Migrar** — ache as instâncias existentes, substitua sistematicamente pela versão compartilhada, teste, e remova as implementações antigas.
6. **Documentar** — atualize o `@.context/product/product-design-system.md` (via modo `document`/`/devflow:knowledge`) com os novos tokens e componentes.

## Regras guidance

A extração é o que dá substrato às regras de design system: sem tokens centralizados, não há contra o que comparar valores soltos. Ao extrair, promova valores hard-coded a tokens para que estas regras (guidance — cross-file contra os tokens) passem a ter significado:
- **design-system-color** — cor hard-coded repetida vira token de cor na paleta.
- **design-system-font** — família/peso repetidos viram tokens de tipografia.
- **design-system-radius** — raio repetido vira degrau na escala de raios.

Regra de ouro do upstream: valor que aparece 3+ vezes com a mesma intenção não é coincidência — é um token esperando nascer.
