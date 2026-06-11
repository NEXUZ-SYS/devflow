---
title: Tailwind CSS
version: 4.x
last_updated: 2026-05-21
status: current
upstream: https://tailwindcss.com/docs
release_notes: https://tailwindcss.com/blog/tailwindcss-v4
released: 2025-01-22
next_target: monitorar 4.x minors; sem upgrade major previsto a curto prazo
---

# Tailwind CSS 4

Engine de utility-first CSS do projeto. Atua como camada baixa de design system, alimentando @stacks/frontend/shadcn-ui e @stacks/frontend/radix-ui via CSS variables, e renderizando no pipeline de @stacks/frontend/next@16 (PostCSS) sobre @stacks/frontend/react@19.

Tailwind 4 é uma reescrita completa: novo engine (Oxide, em Rust), configuração CSS-first (não mais `tailwind.config.js` como fonte da verdade), tema exposto como CSS custom properties, content detection automática e baseline de browser elevada (Safari 16.4+, Chrome 111+, Firefox 128+). Este documento captura o que importa para o projeto na versão 4.x: o que mudou em relação a 3, como configuramos no Next, como integramos com shadcn/Radix, e quais práticas evitar.

**Escopo deste documento:** Tailwind como ferramenta — engine, configuração, design tokens via `@theme`, variantes, integração no projeto. Para regras transversais que sobrevivem trocas de ferramenta de styling, ver @rules/accessibility, @rules/internationalization, @rules/performance. Para componentes que consomem os tokens definidos aqui, ver @stacks/frontend/shadcn-ui e @stacks/frontend/radix-ui.

## Versão e ciclo de vida

- **Linha:** Tailwind CSS 4.x.
- **Status:** estável, padrão para todo CSS do projeto. Tailwind 3.x está congelado para código novo; remanescentes legados migram em janelas dedicadas.
- **Engine:** Oxide (Rust). Builds incrementais em milissegundos; full build em frações de segundo mesmo em apps grandes.
- **Browser baseline:** Safari 16.4+, Chrome 111+, Firefox 128+. Depende de `@property`, `color-mix()`, cascade layers nativas, container queries. Não suporta browsers anteriores — se o público alvo exige IE/Safari antigo, **não usar Tailwind 4**.
- **Plugin canônico:** `@tailwindcss/postcss` no PostCSS de Next 15. CLI standalone (`@tailwindcss/cli`) e Vite plugin existem, mas o projeto consome via PostCSS.
- **Versão pinada:** `package.json` declara `tailwindcss` e `@tailwindcss/postcss` em versão exata, atualizados em conjunto.

```json
{
  "devDependencies": {
    "tailwindcss": "4.0.6",
    "@tailwindcss/postcss": "4.0.6",
    "prettier-plugin-tailwindcss": "0.6.x"
  }
}
```

## Mudanças marcantes de 3 para 4

Tailwind 4 não é incremento — é troca de modelo. Código de 3 portado sem revisão **não compila** ou tem comportamento sutilmente diferente.

### 1. Engine Oxide (Rust)

Builds drasticamente mais rápidos e detecção automática de classes em vez de `content: [...]`. Não há mais `safelist` exigida por padrão; o engine descobre as fontes via heurística (arquivos rastreados pelo projeto, exceto `.gitignore`/`node_modules`). Para casos exóticos (classes geradas em runtime em strings vindas de DB, por exemplo), há `@source` explícito.

### 2. CSS-first configuration

`tailwind.config.js`/`.ts` deixou de ser fonte da verdade. Configuração agora vive em CSS, em `@theme`:

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --color-brand-500: oklch(0.62 0.21 28);
  --font-sans: var(--font-inter), ui-sans-serif, system-ui;
  --spacing: 0.25rem;
  --radius: 0.5rem;
}
```

`tailwind.config.js` ainda é tolerado via `@config "./tailwind.config.js";`, mas é caminho de migração — **não** misturar os dois modelos em código novo.

### 3. Tema como CSS custom properties

Cada token de `@theme` vira um CSS var consumível diretamente (`var(--color-brand-500)`) e gera utilities correspondentes (`bg-brand-500`, `text-brand-500`, `border-brand-500`). Isto elimina a duplicação histórica entre "tokens no JS para Tailwind" e "tokens no CSS para shadcn" — a fonte é única.

### 4. Automatic content detection

Sem `content: [...]`. O engine descobre os arquivos. Para escopos não-óbvios:

```css
@source "../node_modules/@askliquid/ui/dist";
```

### 5. Novas APIs declarativas

| Antes (3) | Agora (4) |
|---|---|
| `addUtilities` em JS plugin | `@utility nome { ... }` em CSS |
| `addVariant` em JS plugin | `@variant nome (seletor) { ... }` |
| `addBase` em JS plugin | `@layer base { ... }` (cascade layer nativa) |
| `theme()` em CSS via PostCSS | `var(--...)` direto, ou `--alias-*: --value(--color-*);` |

```css
@utility content-auto {
  content-visibility: auto;
}

@variant pointer-fine (@media (pointer: fine));
```

### 6. Container queries built-in

Sem plugin separado. `@container` marca o container; `@sm:`, `@md:`, etc. respondem ao container, não ao viewport.

```html
<div class="@container">
  <div class="grid grid-cols-1 @md:grid-cols-2 @xl:grid-cols-3">...</div>
</div>
```

Existe também `@max-md:`, `@min-lg:`, e named containers `@container/sidebar` + `@sm/sidebar:`.

### 7. Opacity via `color-mix()`

`bg-brand-500/50` agora gera `color-mix(in oklab, var(--color-brand-500) 50%, transparent)`. Funciona com **qualquer** cor incluindo `currentColor` — `text-current/60` é válido. Não há mais necessidade do dance de `<alpha-value>` em RGB channels.

### 8. 3D transforms

`rotate-x-*`, `rotate-y-*`, `rotate-z-*`, `translate-z-*`, `scale-z-*`, `perspective-*`, `transform-3d`, `backface-hidden`. Antes só com arbitrary values.

### 9. Gradient API expandido

| Antes | Agora |
|---|---|
| `bg-gradient-to-r` | `bg-linear-to-r` |
| (arbitrary) | `bg-linear-45` (graus) |
| (arbitrary) | `bg-radial-[at_top_left]` |
| (arbitrary) | `bg-conic-180 from-red-500 to-blue-500` |
| (arbitrary) | `bg-linear-to-r/oklch`, `/longer-hue`, etc. (interpolação) |

`bg-gradient-to-*` ainda funciona como alias deprecado — preferir `bg-linear-to-*` em código novo.

### 10. `@starting-style` variant

`starting:opacity-0` ativa estilos de partida para transições de entrada (popovers, dialogs). Substitui a maioria dos casos que pediam `framer-motion` para fade-in trivial.

### 11. Dynamic utility values

Não é mais necessário declarar `gridTemplateColumns: { 15: ... }`. Tailwind 4 aceita `grid-cols-15`, `mt-17`, `w-29` dinamicamente, multiplicando pelo `--spacing` base. Reserve para casos que **não** mapeiam em escala padrão; manter `mt-4`, `mt-6`, `mt-8` da escala canônica para consistência.

### 12. `not-*` variants

`not-hover:opacity-50` aplica enquanto **não** está em hover. Combina com `data-*`, `aria-*`, breakpoints, etc. (`not-data-[state=open]:hidden`).

### 13. `@apply` em scoped styles requer `@reference`

CSS Modules, Vue scoped styles, `<style>` em Astro: o módulo não enxerga as utilities por default. Importar referência:

```css
/* component.module.css */
@reference "../app/globals.css";

.card {
  @apply rounded-lg bg-surface p-4;
}
```

`@apply` continua válido, mas é regra do projeto restringir o uso (ver Anti-patterns).

### 14. Browser baseline elevada

Tailwind 4 usa `@property`, `color-mix()`, registered custom properties. Não polyfilla — se o público tem browsers antigos, é decisão de ADR (ver @decisions).

## Configuração canônica no projeto

### PostCSS

```js
// postcss.config.mjs
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

Nada além disso. Sem `autoprefixer` (o Oxide já cuida), sem `postcss-import` (substituído por `@import` nativo do Tailwind 4).

### CSS principal

```css
/* app/globals.css */
@import "tailwindcss";

@theme inline {
  /* Cores cruas (paleta) */
  --color-neutral-50:  oklch(0.985 0 0);
  --color-neutral-100: oklch(0.97 0 0);
  --color-neutral-900: oklch(0.205 0 0);
  --color-neutral-950: oklch(0.145 0 0);

  --color-brand-500: oklch(0.62 0.21 28);
  --color-brand-600: oklch(0.55 0.21 28);

  /* Tokens semânticos (contrato com shadcn/Radix) */
  --color-background: var(--color-neutral-50);
  --color-foreground: var(--color-neutral-900);
  --color-surface:    oklch(1 0 0);
  --color-primary:    var(--color-brand-500);
  --color-primary-foreground: oklch(0.985 0 0);
  --color-border:     oklch(0.922 0 0);
  --color-ring:       var(--color-brand-500);

  /* Tipografia (via next/font CSS vars) */
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains-mono), ui-monospace, monospace;

  /* Espaçamento e radius */
  --spacing: 0.25rem;
  --radius:  0.5rem;
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);

  /* Shadows e animações */
  --shadow-sm: 0 1px 2px 0 oklch(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px oklch(0 0 0 / 0.1);

  --animate-fade-in: fade-in 200ms ease-out;
}

/* Dark mode via @variant: ativa em html[data-theme="dark"] */
@variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

@layer base {
  :where([data-theme="dark"]) {
    --color-background: var(--color-neutral-950);
    --color-foreground: var(--color-neutral-50);
    --color-surface:    var(--color-neutral-900);
    --color-border:     oklch(1 0 0 / 0.1);
  }

  html { color-scheme: light dark; }
  body { @apply bg-background text-foreground antialiased; }
}

@keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
```

Notas:

- `@theme inline` (não `@theme`) quando os valores **referenciam** outros vars (`var(--font-inter)`). Sem `inline`, Tailwind congela o valor no build e perde a referência ao `--font-inter` injetado em runtime por `next/font`.
- A escolha entre `data-theme="dark"` e `.dark` é convenção do projeto — o `@variant dark` deve casar com o que o provider de tema escreve no `<html>`. Ver @stacks/frontend/shadcn-ui.
- Não duplicar tokens semânticos em `tailwind.config.ts` legado. A fonte é o `@theme` deste arquivo.

### Integração com `next/font`

```ts
// app/fonts.ts
import { Inter, JetBrains_Mono } from 'next/font/google';

export const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
export const mono  = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono', display: 'swap' });
```

```tsx
// app/layout.tsx
import { inter, mono } from './fonts';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="light" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

Detalhes do pipeline de fontes em @stacks/frontend/next@16.

## Design tokens via `@theme`

A política do projeto separa duas camadas:

| Camada | Função | Exemplo |
|---|---|---|
| **Paleta crua** | Valores fixos por matiz/escala | `--color-neutral-500`, `--color-brand-600` |
| **Tokens semânticos** | Apontam para a paleta; mudam por tema | `--color-primary`, `--color-surface`, `--color-border` |

Regras:

- **Componentes consomem tokens semânticos**, não paleta crua. `bg-primary`, não `bg-brand-500`.
- **Paleta crua** existe para tokens semânticos referenciarem, e para casos pontuais (charts, ilustrações) onde matiz importa por si.
- **OKLCH é o espaço default** para cores novas. Permite escalas de luminância perceptualmente uniformes e mix coerente via `color-mix()`. RGB/HSL legacy aceitos em paletas importadas, mas converter quando feasible.
- **Dark mode redeclara apenas semânticos** (`--color-background`, `--color-surface`, etc.) — a paleta crua continua a mesma; só o mapeamento muda.
- Tokens novos passam por revisão de @rules/accessibility (contraste calculável em OKLCH; verificar pares foreground/background).

## Integração com shadcn/ui e Radix UI

Ver @stacks/frontend/shadcn-ui e @stacks/frontend/radix-ui para detalhes; aqui apenas o contrato de Tailwind.

- **CSS variables são o contrato.** shadcn/ui consome `--color-background`, `--color-foreground`, `--color-primary`, `--color-border`, `--radius`, etc. Os nomes devem coincidir entre `@theme` e o que os componentes esperam — alterações exigem busca global.
- **Radix data attributes estilizados via variantes Tailwind:**

```tsx
<DialogContent
  className="
    data-[state=open]:animate-in data-[state=closed]:animate-out
    data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0
    data-[side=top]:slide-in-from-bottom-2
  "
/>
```

- **`data-[state=...]:`, `data-[side=...]:`, `data-[disabled]:`, `aria-disabled:`, `aria-selected:`** são as variantes canônicas para vincular comportamento Radix a estilo Tailwind, sem JS extra.
- **Não estilizar Radix por `[data-state]` em CSS Module** quando uma variante Tailwind resolve. Manter estilização declarativa no JSX.

## Acessibilidade

Ver @rules/accessibility como regras transversais. Específico ao Tailwind:

- **`focus-visible:` em vez de `focus:`** para anéis de foco — não pisca em click de mouse, mantém foco visível em teclado.
- **`motion-safe:` / `motion-reduce:`** para animações: `motion-safe:animate-fade-in motion-reduce:opacity-100`. Nunca animar opacity/transform/position sem variante quando o efeito é estritamente decorativo.
- **OKLCH facilita contraste**: ajuste de L (luminância) tem efeito perceptual previsível. Pares de tokens (`--color-foreground` sobre `--color-background`) devem atingir WCAG AA mínimo.
- **Targets de toque** via `min-h-11 min-w-11` (44x44px) em controles interativos em mobile — `h-*`/`w-*` puros não garantem mínimo.
- **`sr-only`** para labels visuais ocultas mas acessíveis a leitores. `not-sr-only` ressuscita em breakpoint quando necessário (`sm:not-sr-only`).
- **`forced-colors:`** variante para Windows High Contrast Mode quando aplicável.

## RTL e internacionalização

Ver @rules/internationalization. Específico ao Tailwind:

- **Logical properties são obrigatórias** para qualquer texto/layout que pode renderizar em RTL: `ms-*`/`me-*` (margin-inline-start/end) em vez de `ml-*`/`mr-*`; `ps-*`/`pe-*` em vez de `pl-*`/`pr-*`; `start-*`/`end-*` em vez de `left-*`/`right-*`; `border-s`/`border-e`; `rounded-s-*`/`rounded-e-*`.
- **`ltr:` e `rtl:` variants** para casos que exigem regra direcional explícita (ícones de seta, por exemplo): `<ChevronRightIcon class="rtl:rotate-180" />`.
- **`dir="rtl"` no `<html>` ou container** habilita as logical properties. Sem `dir`, comportam-se como `ltr`.

## Performance

Ver @rules/performance. Específico ao Tailwind:

- **Oxide elimina a etapa de purge.** Não há mais "tree shaking de utilities" — o engine só emite o que detecta nos sources. Resultado: CSS final é pequeno por construção, sem `safelist` ginástica.
- **Sem nomes de classe construídos por concatenação:** `bg-${color}-500` **não funciona**. O detector estático não vê a classe; ela não é gerada. Resolver com mapa explícito:

```tsx
const tone = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-rose-500',
} as const;
<div className={tone[variant]} />
```

- **`safelist` minimal.** Para classes legitimamente vindas de dados (cores definidas por admin em DB, por exemplo), declare com `@source inline("...")` ou mantenha as variantes possíveis listadas em um arquivo rastreável.
- **`prettier-plugin-tailwindcss` é obrigatório** para ordenar utilities — diff fica determinístico, conflitos de classe diminuem.
- **`@apply` apenas em `@layer base` ou `@layer components`** globais, para casos que **não** são representáveis como composição de utilities (`prose`, estilos de elementos HTML brutos). Componentes React expressam estilo no JSX, não em CSS Module com `@apply`.
- **Arbitrary values com moderação.** `w-[123px]` é fuga do design system; manter exceções pontuais e documentadas.
- **Container queries reduzem layout shift** em componentes responsivos genuínos (cards que entram em sidebars de larguras variadas). Preferir a viewport queries quando o componente é responsivo ao **seu** espaço, não ao viewport.

## Variantes essenciais

Conjunto canônico no projeto, em ordem aproximada de uso:

| Variante | Uso |
|---|---|
| `hover:`, `focus:`, `focus-visible:`, `active:`, `disabled:` | Estados de interação |
| `aria-disabled:`, `aria-selected:`, `aria-expanded:`, `aria-checked:` | A11y declarativa |
| `data-[state=open]:`, `data-[side=top]:`, `data-[disabled]:` | Estados de Radix |
| `group-*`, `peer-*` | Coordenação entre elementos irmãos/ancestrais |
| `*:`, `**:` | Aplicar em filhos diretos / descendentes (cuidado com especificidade) |
| `has-*` (`has-[:focus]:ring-2`) | Estado do pai derivado de filho |
| `not-*` (`not-data-[state=open]:hidden`) | Negação |
| `motion-safe:`, `motion-reduce:` | A11y de movimento |
| `dark:` | Tema (via `@variant dark` configurado) |
| `@container`, `@sm:`, `@md:` | Container queries |
| `sm:`, `md:`, `lg:`, `xl:`, `2xl:` | Viewport queries |
| `starting:` | `@starting-style` para transições de entrada |
| `print:`, `forced-colors:`, `pointer-fine:`, `pointer-coarse:` | Media específicas |
| `ltr:`, `rtl:` | Direção |

## Migração 3 → 4

1. **Rodar o codemod oficial:**

```bash
npx @tailwindcss/upgrade@latest
```

2. **Reescrever `tailwind.config.{js,ts}` como `@theme`** em `globals.css`. Cores, fontes, spacing, radius, shadows, animations — todos para tokens CSS. Manter `tailwind.config.*` apenas se houver plugins JS não trivialmente convertíveis (e mesmo assim avaliar como dívida).
3. **Substituir plugin de PostCSS:** remover `tailwindcss`, `autoprefixer` e `postcss-import` do `postcss.config.*`; usar apenas `@tailwindcss/postcss`.
4. **Adicionar `@reference`** em todo CSS Module/scoped style que usa `@apply`.
5. **Revisar opacity sintética em RGB channels** (`<alpha-value>` patterns) — sem ação em código que só usa `/50` etc., mas tokens que dependiam do hack em 3 devem ir para OKLCH.
6. **Trocar `bg-gradient-to-*` por `bg-linear-to-*`** progressivamente. Os antigos ainda funcionam, mas a forma nova é o padrão.
7. **Remover plugins agora built-in:** `@tailwindcss/container-queries` é desnecessário (built-in); `@tailwindcss/forms`/`@tailwindcss/typography` ainda existem (separados) — manter quando o projeto os usa.
8. **Validar browser baseline** com a base de usuários. Se necessário ficar em Tailwind 3, registrar como ADR (ver @decisions).
9. **Auditar `safelist`:** o que era safelist por causa de classes dinâmicas vira mapa explícito ou `@source inline(...)`.
10. **Visual regression / smoke test** em rotas representativas. Mudanças de defaults (border color, ring color, espaçamentos derivados) podem aparecer.

## Ferramentas auxiliares

| Pacote | Função | Uso |
|---|---|---|
| `clsx` | Composição condicional de className | Combinar classes baseadas em props |
| `tailwind-merge` | Resolver conflitos de utilities (`p-2 p-4` → `p-4`) | Wrap em utility `cn()` |
| `tailwind-variants` ou `class-variance-authority` (`cva`) | Slots e variants tipadas | Componentes com múltiplas variants/tamanhos |
| `prettier-plugin-tailwindcss` | Ordenar classes | Obrigatório no Prettier config |
| `@tailwindcss/typography` | Plugin `prose` para conteúdo markdown | Manter quando há conteúdo renderizado de markdown |
| `@tailwindcss/forms` | Reset opinativo de form controls | Manter quando consumido |

Padrão de utilitário `cn()`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`cn()` é o ponto de uso canônico para classes condicionais — nunca concatenar strings com `+` ou template literals para construir className.

## Anti-patterns

| Errado | Certo | Motivo |
|---|---|---|
| `bg-${color}-500` por concatenação | Mapa explícito (`tone[variant]`) | Engine estático não detecta; classe nunca é gerada |
| `style={{ color: 'red' }}` para algo que `text-red-500` resolve | Utility | Foge do design system; sem tema, sem dark mode |
| Cascata global com seletores próprios (`.card .title { ... }`) | Componente React + utilities | Tailwind não é para CSS clássico paralelo |
| `@apply` espalhado em CSS Modules virando "Tailwind disfarçado de Bootstrap" | Composição de utilities no JSX | `@apply` cria classes opacas; perde benefício do utility-first |
| `bg-[#ff6600]` em vez de definir `--color-brand-500` em `@theme` | Token semântico | Cor mágica não muda no dark mode, não responde a rebrand |
| Classes condicionais por concatenação (`className={open ? 'block' : 'hidden'}`) sem `cn()` | `cn('base', open && 'block', !open && 'hidden')` | Conflitos não resolvidos; difícil ler |
| Duplicar a mesma utility chain em vários lugares | Extrair componente React (ou `cva` para variants) | DRY no JSX; um lugar para mudar |
| Arbitrary values em excesso (`w-[123px] mt-[27px] text-[13.5px]`) | Escala do tema; ajustar tokens se necessário | Indica gap no design system, não solução |
| Misturar `tailwind.config.ts` antigo com `@theme` novo | Migrar tudo para `@theme` (ou usar `@config` apenas como ponte) | Duas fontes da verdade divergem silenciosamente |
| Manter `@tailwindcss/container-queries` no `package.json` | Remover; é built-in | Dependência morta |
| `ml-*`/`mr-*` em UI que pode renderizar em RTL | `ms-*`/`me-*` | Quebra em árabe/hebraico; ver @rules/internationalization |
| `focus:ring-*` (pisca em click) | `focus-visible:ring-*` | `focus-visible:` só ativa em foco real (teclado) |
| `animate-*` sem `motion-safe:` | `motion-safe:animate-*` | Ignora `prefers-reduced-motion`; ver @rules/accessibility |
| `bg-gradient-to-r` | `bg-linear-to-r` | Forma deprecada; preferir nova |
| `safelist` extensa "por garantia" | `@source inline(...)` específico, ou mapa | Inflate bundle; mascara classes dinâmicas problemáticas |
| `addUtilities`/`addVariant` via plugin JS | `@utility` / `@variant` em CSS | API JS é legacy em 4; CSS é a forma canônica |
| `theme('colors.brand.500')` em CSS via PostCSS | `var(--color-brand-500)` | Tokens são CSS vars de verdade em 4 |
| `<style jsx>` ou CSS-in-JS para algo que utility resolve | Utility | Custo de runtime, perde estática, sem ordenação determinística |

## Roadmap

- **Patch/minor 4.x:** absorver via upgrade pontual; revisar release notes (especialmente novas variantes e utilities).
- **Plugins legacy (`@tailwindcss/forms`, `@tailwindcss/typography`):** acompanhar reescrita para a API CSS-first; quando estável, migrar de plugin JS para `@plugin` declarativo.
- **Tailwind 5:** sem timeline pública; 4 é a fronteira atual.

## Referências

- Docs oficiais: https://tailwindcss.com/docs
- Tailwind 4 announcement: https://tailwindcss.com/blog/tailwindcss-v4
- Upgrade guide: https://tailwindcss.com/docs/upgrade-guide
- `@theme` reference: https://tailwindcss.com/docs/theme
- Container queries: https://tailwindcss.com/docs/responsive-design#container-queries

## Referências cruzadas

- @stacks/frontend/next@16 — pipeline PostCSS, integração com `next/font`, paths `app/globals.css`.
- @stacks/frontend/react@19 — JSX/className como ponto canônico de aplicação das utilities.
- @stacks/frontend/shadcn-ui — consumo dos tokens semânticos definidos em `@theme`.
- @stacks/frontend/radix-ui — variantes `data-[state=...]:`/`data-[side=...]:` para estilização declarativa.
- @rules/accessibility — `focus-visible:`, `motion-safe:`, contraste OKLCH, targets de toque.
- @rules/internationalization — logical properties `ms-*`/`me-*`/`ps-*`/`pe-*`, variantes `ltr:`/`rtl:`.
- @rules/performance — sem nomes dinâmicos, sem `@apply` espalhado, `cn()` para condicionais.
- @decisions — ADRs sobre adoção de 4, baseline de browser, eventual retorno a 3 se aplicável.
