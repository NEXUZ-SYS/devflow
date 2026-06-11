---
title: Playwright
version: 1.4x
last_updated: 2026-05-20
status: current
upstream: https://playwright.dev
repository: https://github.com/microsoft/playwright
category: testing
---

# Playwright 1.4x

Playwright é o framework de testes end-to-end e component testing cross-browser mantido pela Microsoft. Executa Chromium, Firefox e WebKit a partir de uma única API, com auto-waiting embutido, tracing nativo e tooling de debug de primeira classe (UI mode, codegen, trace viewer).

Neste projeto, Playwright é o runner exclusivo para E2E, smoke e a11y de fluxos críticos. Vitest cobre unit e integração in-process — ver `@stacks/testing/vitest`. As duas stacks não competem; complementam-se em níveis distintos da pirâmide.

## Quando usar Playwright (e quando não)

Use Playwright para:

- Fluxos E2E do app Next.js 15 contra servidor real (`next start` ou `next dev`).
- Visual regression de páginas e componentes críticos.
- A11y checks automatizados sobre o DOM final renderizado pelo browser.
- Component testing quando a precisão de layout, CSS real ou APIs nativas do browser (geolocation, clipboard, media queries reais) importa mais que velocidade.

Não use Playwright para:

- Lógica pura, utilitários, hooks isolados, schemas Zod. Use Vitest — `@stacks/testing/vitest`.
- Cobertura quantitativa de funções. Vitest com `c8` cobre mais barato e rápido.
- Testes de Route Handlers que não envolvem browser. Use Vitest com `fetch` direto ou supertest-like.

## Setup

Instale e inicialize:

```bash
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium firefox webkit
```

`playwright.config.ts` canônico:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'on-failure' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/user.json' },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], storageState: 'tests/.auth/user.json' },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], storageState: 'tests/.auth/user.json' },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'], storageState: 'tests/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

Pontos não-óbvios:

- `webServer` lida com o ciclo de vida do servidor Next.js — não suba manualmente em CI.
- `dependencies: ['setup']` garante que o projeto `setup` rode antes e produza o `storageState`.
- `trace: 'on-first-retry'` é o sweet spot: zero overhead em testes verdes, trace completo no retry que precede o failure final.

## Browsers e emulação de dispositivos

`devices` exporta presets com viewport, user agent, scale factor e flags corretos para cada dispositivo real. Use os presets em vez de hardcoded viewport sempre que o teste depender de comportamento mobile.

Capacidades de emulação cobertas no `use`:

```ts
use: {
  geolocation: { latitude: -23.5505, longitude: -46.6333 },
  permissions: ['geolocation', 'clipboard-read'],
  colorScheme: 'dark',
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  viewport: { width: 1280, height: 720 },
}
```

WebKit não é Safari — é o engine. Bugs de Safari real (especialmente iOS) podem não aparecer no WebKit do Playwright. Se um fluxo é crítico em Safari iOS, complemente com BrowserStack/Sauce.

## Test API

Estrutura básica:

```ts
import { test, expect } from '@playwright/test'

test.describe('checkout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart')
  })

  test('finaliza compra com cartão', async ({ page }) => {
    await page.getByRole('button', { name: 'Finalizar' }).click()
    await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible()
  })
})
```

Modificadores:

- `test.only` — proibido em commits. CI rejeita via `forbidOnly: !!process.env.CI`.
- `test.skip` — use com condicional explícita: `test.skip(browserName === 'webkit', 'flaky no WebKit, ticket #1234')`.
- `test.fixme` — marca falhas conhecidas; falha se passar (bom para detectar correção acidental).
- `test.fail` — espera falha; útil para reproduzir bug antes do fix.

## Web-first assertions (auto-retry)

Toda asserção em `expect(locator)` faz auto-retry até o timeout configurado. Use sempre matchers de locator, nunca asserções sobre snapshots imediatos:

Certo:

```ts
await expect(page.getByText('Pedido confirmado')).toBeVisible()
await expect(page.getByRole('list')).toHaveCount(3)
```

Errado:

```ts
const text = await page.getByText('Pedido confirmado').textContent()
expect(text).toBe('Pedido confirmado') // sem retry, race condition
```

Para condições não cobertas por matchers, use `expect.poll`:

```ts
await expect.poll(async () => api.getOrderStatus(id), { timeout: 10_000 }).toBe('paid')
```

## Locators: prefira role e text

Ordem de preferência alinhada com `@rules/accessibility`:

1. `page.getByRole('button', { name: 'Salvar' })` — semântica e a11y.
2. `page.getByLabel('Email')` — formulários.
3. `page.getByText('Bem-vindo')` — conteúdo visível ao usuário.
4. `page.getByPlaceholder('Buscar...')` — quando label não existe.
5. `page.getByTestId('order-row')` — apenas quando os anteriores não distinguem unicamente.
6. CSS/XPath — último recurso; sinaliza ausência de a11y ou test-id.

Configure `testIdAttribute` se o projeto usar `data-test`:

```ts
use: { testIdAttribute: 'data-test' }
```

Locator-first significa: o seletor é estável porque o usuário interage pela mesma semântica. Se o teste quebra por mudança visual sem mudança de fluxo, o seletor está errado, não o teste.

## Auto-waiting

Ações (`click`, `fill`, `check`, `selectOption`) esperam o elemento estar:

- Anexado ao DOM
- Visível
- Estável (sem animação em curso)
- Habilitado
- Recebendo eventos (não coberto por outro elemento)

Nunca use `page.waitForTimeout(ms)` para "dar tempo". Se precisar esperar algo, espere o algo:

```ts
// Errado:
await page.waitForTimeout(2000)
await page.getByRole('button').click()

// Certo:
await expect(page.getByRole('button')).toBeEnabled()
await page.getByRole('button').click()
```

## Network: route e waitForResponse

Mock determinístico de APIs externas:

```ts
await page.route('**/api/payments', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'approved', id: 'pay_123' }),
  })
})
```

Aguardar resposta antes de asserção:

```ts
const [response] = await Promise.all([
  page.waitForResponse((r) => r.url().includes('/api/orders') && r.status() === 201),
  page.getByRole('button', { name: 'Confirmar' }).click(),
])
expect(await response.json()).toMatchObject({ status: 'pending' })
```

Para Route Handlers Next.js, use o `request` fixture (sem browser):

```ts
test('POST /api/orders', async ({ request }) => {
  const res = await request.post('/api/orders', { data: { itemId: '123' } })
  expect(res.status()).toBe(201)
})
```

## Storage state: login uma vez

Em `tests/global.setup.ts`:

```ts
import { test as setup } from '@playwright/test'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(process.env.E2E_USER!)
  await page.getByLabel('Senha').fill(process.env.E2E_PASSWORD!)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL('/dashboard')
  await page.context().storageState({ path: 'tests/.auth/user.json' })
})
```

Alternativa via API (mais rápida, sem renderizar tela de login):

```ts
setup('authenticate via API', async ({ request }) => {
  const res = await request.post('/api/login', {
    data: { email: process.env.E2E_USER, password: process.env.E2E_PASSWORD },
  })
  await request.storageState({ path: 'tests/.auth/user.json' })
})
```

Adicione `tests/.auth/` ao `.gitignore`.

## Fixtures custom

`test.extend` cria fixtures reutilizáveis (auth tipada, seed de DB, factory de entidades):

```ts
import { test as base } from '@playwright/test'

type Fixtures = {
  authedUser: { id: string; email: string }
  seededOrder: { id: string }
}

export const test = base.extend<Fixtures>({
  authedUser: async ({ page }, use) => {
    const user = await createUser()
    await use(user)
    await deleteUser(user.id)
  },
  seededOrder: async ({ authedUser }, use) => {
    const order = await createOrder(authedUser.id)
    await use(order)
    await deleteOrder(order.id)
  },
})
```

Cada fixture roda isolada por teste — sem state vazando.

## Component testing

`@playwright/experimental-ct-react` testa componentes React 19 em browser real:

```bash
pnpm add -D @playwright/experimental-ct-react
```

```ts
import { test, expect } from '@playwright/experimental-ct-react'
import { PriceTag } from '@/components/price-tag'

test('formata BRL', async ({ mount }) => {
  const component = await mount(<PriceTag value={1234.5} />)
  await expect(component).toHaveText('R$ 1.234,50')
})
```

Use component testing quando precisão de layout, fonts, animações ou APIs de browser importam. Para lógica pura, Vitest é mais barato — ver `@stacks/testing/vitest`.

## Visual regression

```ts
test('homepage snapshot', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveScreenshot('home.png', {
    maxDiffPixelRatio: 0.01,
    fullPage: true,
  })
})
```

Regras:

- Sempre defina `maxDiffPixelRatio` ou `maxDiffPixels`. Default zero quebra em qualquer pixel.
- Snapshots geram por SO. Em CI, gere e compare no mesmo runner Linux.
- Atualize com `--update-snapshots` e revise diff no PR. Nunca atualize sem inspeção visual.

## Accessibility checks

Integração com axe-core:

```bash
pnpm add -D @axe-core/playwright
```

```ts
import AxeBuilder from '@axe-core/playwright'

test('home sem violações WCAG AA', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(results.violations).toEqual([])
})
```

Convenções de a11y enforce vivem em `@rules/accessibility`. Este teste é o gate automatizado dessas regras.

## Debugging

Trace viewer é a ferramenta principal de debug:

```bash
pnpm exec playwright test --trace=on
pnpm exec playwright show-trace test-results/<...>/trace.zip
```

Mostra timeline de actions, snapshots de DOM antes/depois, console logs, network, source map.

UI mode para iteração local:

```bash
pnpm exec playwright test --ui
```

Codegen para gerar teste interagindo com a página:

```bash
pnpm exec playwright codegen http://localhost:3000
```

Codegen produz rascunho — sempre revise locators (substitua CSS por roles) antes de commitar.

## CI: GitHub Actions

Esqueleto:

```yaml
- uses: actions/setup-node@v4
  with: { node-version: '20' }
- run: pnpm install --frozen-lockfile
- run: pnpm exec playwright install --with-deps
- run: pnpm exec playwright test --shard=${{ matrix.shard }}/4
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-report-${{ matrix.shard }}
    path: playwright-report/
    retention-days: 14
```

Sharding (`--shard=1/4` ... `4/4`) paraleliza por máquinas. `retries: 2` em CI mascara flake leve mas não substitui locators corretos — investigue toda flake que retry resolve.

## Next.js 15 integration

`webServer.command` aponta para `pnpm dev` (HMR, mais lento, melhor para debug) ou `pnpm start` (build prévio, mais rápido, comportamento de produção). Em CI sempre rode contra build de produção:

```yaml
- run: pnpm build
- run: pnpm exec playwright test
```

`baseURL` permite usar paths relativos: `await page.goto('/checkout')`. Ver `@stacks/frontend/next@16` e `@stacks/language/typescript@6` para tipagem do config.

## BDD bridge

Se o time exige Gherkin, use `playwright-bdd` (gera testes Playwright a partir de `.feature`). Caso contrário, prefira a API nativa de Playwright — descrições em `test.describe`/`test()` cobrem o caso de uso sem overhead de Cucumber. Ver `@practices/bdd` para o critério de adoção.

## Controle de flakiness

- Locators web-first (role/text/label). CSS frágil = flake garantida.
- `expect.poll` para condições assíncronas fora da API de matchers.
- Fixtures isoladas; nunca compartilhe state entre testes via variável de módulo.
- Mock network determinístico em testes que dependem de terceiros.
- `retries: 2` em CI é tolerância, não solução. Toda flake resolvida por retry vira ticket de investigação.

## Anti-patterns

- `page.waitForTimeout(ms)` — sleep fixo. Sempre espere o evento concreto.
- Seletores CSS profundos (`div > div.card > span:nth-child(2)`) — quebram em qualquer refactor de markup.
- Test global state vazando entre testes (singletons, módulos com cache, DB não resetado).
- `expect(await locator.isVisible()).toBe(true)` — não tem auto-retry. Use `await expect(locator).toBeVisible()`.
- Trace e screenshot só em local. Configure upload em CI, sempre.
- Aumentar `retries` para esconder flake real. Retry mascara, não resolve.
- `--update-snapshots` no CI sem revisão humana — aceita regressão visual silenciosamente.
- Visual snapshots sem `maxDiffPixelRatio` — falha em sub-pixel rendering entre runners.
- `test.only` commitado — bloqueado por `forbidOnly` em CI; configure ESLint plugin local também.
- Ignorar trace viewer — debugar E2E sem trace é desperdício.

## Referências cruzadas

- `@rules/testing` — regras imperativas sobre o que testar e como nomear.
- `@rules/accessibility` — guarda-corpos de a11y enforce; este stack é o runner.
- `@practices/bdd` — critério para Gherkin vs Playwright nativo.
- `@stacks/testing/vitest` — runner unit/integration paralelo; divisão de responsabilidades.
- `@stacks/frontend/next@16` — `webServer`, dev vs start, App Router.
- `@stacks/frontend/react@19` — component testing target.
- `@stacks/language/typescript@6` — tipagem do config e de fixtures custom.

## Upstream

- Documentação: https://playwright.dev
- Repositório: https://github.com/microsoft/playwright
- Release notes: https://github.com/microsoft/playwright/releases
