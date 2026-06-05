---
id: std-test-discipline
description: Testes testam comportamento observável, não implementação interna
version: 1.1.0
source: devflow-default
applyTo: ["**/*.{ts,tsx,js,jsx,py,go}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-test-discipline.js
---
## Princípios

- Teste comportamento observável (input, output, side effects visíveis); nunca detalhe interno (privates, ordem de chamadas internas)
- Estrutura AAA obrigatória: Arrange, Act, Assert — visualmente separados, uma única ação no Act
- Nome descreve comportamento em frase: `"returns 404 when order not found"`, nunca `"test1"` ou `"works"`
- Cada teste é independente: pode rodar isolado e em qualquer ordem; sem estado mutável compartilhado entre testes
- Determinismo: injete clock/uuid; use `vi.useFakeTimers()` + `vi.setSystemTime()`; nunca `Date.now()` ou `Math.random()` direto na unidade testada
- Prefira fakes (implementações em memória) sobre mocks de comportamento; use stubs para retornos externos que o teste não exercita
- Mock apenas dependências de fronteira que não devem ser chamadas em teste (email real, gateway de pagamento)
- Teste flaky é bug crítico — quarentena máxima de 7 dias com issue aberta, depois conserta ou apaga
- Nunca use `await sleep(n)` para sincronizar; use `waitFor`, `expect.poll` ou `waitForSelector`
- `.only` e `.skip` nunca são commitados em main; remova ou corrija antes do PR
- Todo teste tem ao menos uma asserção real sobre o comportamento; teste sem assert é falso positivo

## Anti-patterns

| Errado | Corrija para |
|---|---|
| Mock de tudo até o teste verificar apenas si mesmo | Fake in-memory com comportamento real |
| `waitForTimeout(n)` | `waitFor`/assert determinístico |
| `expect(true).toBe(true)` | Asserção real sobre o resultado |
| `expect(spy).toHaveBeenCalled()` quando dá para assertar resultado | Assert sobre o resultado observável |
| Snapshot gigante que ninguém revisa | Assertar campos relevantes explicitamente |
| `it.skip` ou `it.only` commitado | Remover ou corrigir antes do PR |
| `await new Promise(r => setTimeout(r, n))` | `waitFor` ou `expect.poll` determinístico |
| Teste que repete a implementação linha a linha | Testar via interface pública, não internals |
| `.catch(() => undefined)` no teste silenciando erro | Propagar ou assertar o erro esperado |
