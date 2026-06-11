---
title: shadcn/ui
version: distribuição via CLI (sem SemVer)
last_updated: 2026-05-21
status: current
upstream: https://ui.shadcn.com
repo: https://github.com/shadcn-ui/ui
registry: https://ui.shadcn.com/docs/registry
---

# shadcn/ui

Base de componentes do projeto. Não é uma biblioteca npm de runtime; é uma coleção de componentes copiados via CLI para dentro do repositório, montados sobre @stacks/frontend/radix-ui (comportamento e acessibilidade) e @stacks/frontend/tailwind@4 (estilo), consumidos por @stacks/frontend/next@16 e @stacks/frontend/react@19.

A premissa é "build your own component library, with shadcn as the starting point": cada componente vive em `src/components/ui/` no seu repo, sob seu controle de versão, livre para edição. Não há dependência runtime de uma "shadcn package".

**Escopo deste documento:** shadcn/ui como ferramenta — filosofia, CLI, `components.json`, contrato de design tokens, catálogo de componentes, padrões de uso, customização sustentável, anti-patterns. Para opiniões sobre styling que sobrevivem trocas de base (utilities Tailwind, tokens semânticos, RTL, motion), ver @stacks/frontend/tailwind@4 e @rules/accessibility. Para os primitives headless por baixo, ver @stacks/frontend/radix-ui.

## Filosofia

shadcn/ui inverte o modelo tradicional de design system em npm:

- **Sem pacote runtime.** Não existe `import { Button } from 'shadcn-ui'`. O `Button` mora em `src/components/ui/button.tsx` do projeto.
- **Copy, not install.** A CLI copia o código fonte do componente para o repo, aplicando o `components.json` do projeto (style, aliases, tokens).
- **Você possui o código.** Edição livre: trocar variantes, remover props, adicionar slots, ajustar comportamento. Não há "monkey patch" — é seu arquivo.
- **Stack composta, não monolítica.** Radix UI primitives + Tailwind 4 + `class-variance-authority` (cva) + `tailwind-merge` + `clsx` (via `cn`) + Lucide React (ícones default). Cada peça é trocável.
- **Updates são diffs explícitos.** `shadcn update` mostra a diferença entre a versão upstream e a sua; você decide o que aceitar.

Consequência operacional: shadcn é mais "manual de origem" do que "dependência". O snapshot do que está no seu repo é a verdade; o upstream é referência.

## Versão e estabilidade

- **shadcn não usa SemVer estável.** A CLI é versionada (`shadcn@latest`), o catálogo de componentes evolui continuamente, mas não há "shadcn 1.x" vs "2.x" governando o que está no seu repo.
- **A "versão" do projeto é a tripla:** (a) o snapshot dos arquivos em `src/components/ui/` em um dado commit, (b) o `components.json`, (c) as versões pinadas de Radix UI, Tailwind, cva, tailwind-merge, clsx, lucide-react no `package.json`.
- **Atualizações são opt-in.** Rodar `shadcn update <component>` ou `shadcn diff <component>` quando há necessidade (bug upstream relevante, melhoria desejada). Nunca em massa sem revisão.
- **Estilos:** `new-york` é o style oficial atual (escolha do projeto); `default` existe como alternativa. **Não misturar** os dois — escolher um no `components.json` e manter.

## Stack subjacente

| Dependência | Função | Notas |
|---|---|---|
| `@radix-ui/react-*` | Comportamento + acessibilidade dos componentes interativos | Headless; cada primitive é um pacote separado. Ver @stacks/frontend/radix-ui |
| `tailwindcss` 4.x | Estilo | Ver @stacks/frontend/tailwind@4 |
| `class-variance-authority` (`cva`) | Variants tipadas (`variant`, `size`, `defaultVariants`, `compoundVariants`) | Componentes com múltiplas formas |
| `tailwind-merge` | Resolver conflitos de utilities | Usado via `cn()` |
| `clsx` | Composição condicional de classes | Usado via `cn()` |
| `lucide-react` | Ícones default | Trocável por outro set, mas é o que a CLI assume |
| `react-hook-form` + `zod` + `@hookform/resolvers` | Stack de formulários | Componente `<Form>` integrado |
| `@tanstack/react-table` | Engine de tabelas | Base para `DataTable` |
| `cmdk` | Command palette / combobox | Base para `Command` |
| `vaul` | Drawer mobile | Base para `Drawer` |
| `sonner` | Toaster | Substitui o legado `Toast` |
| `recharts` | Gráficos | Base para `Chart` |
| `react-day-picker` | Datas | Base para `Calendar` / `DatePicker` |
| `embla-carousel-react` | Carrossel | Base para `Carousel` |
| `input-otp` | OTP input | Base para `InputOTP` |
| `next-themes` | Dark/light toggling SSR-safe | Provider de tema no App Router |

Versões pinadas no `package.json`. Atualizações coordenadas com o snapshot dos componentes (rodar `shadcn diff` quando bumpar Radix para detectar drift).

## CLI

A CLI é o ponto de entrada para tudo. Invocada via `pnpm dlx shadcn@latest <comando>` (ou `npx`).

| Comando | Função |
|---|---|
| `shadcn init` | Bootstrap do projeto: cria `components.json`, instala deps base (`cn`, `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react`), registra aliases |
| `shadcn add <component>` | Instala um componente: cria `src/components/ui/<name>.tsx`, instala deps necessárias, copia sub-componentes |
| `shadcn add <component-1> <component-2> ...` | Vários de uma vez |
| `shadcn add` (sem args) | Modo interativo (lista para seleção) |
| `shadcn diff <component>` | Compara o snapshot local com o upstream atual |
| `shadcn update <component>` | Aplica diff upstream (revisar antes de aceitar) |
| `shadcn view <component>` | Mostra o código upstream sem instalar |
| `shadcn add <url>` | Instala componente de registry de terceiros (Origin UI, Aceternity, registry interno) |
| `shadcn build` | Gera registry próprio (para publicar componentes internos como registry) |

Padrão de uso no projeto:

```bash
# bootstrap (uma vez)
pnpm dlx shadcn@latest init

# adicionar componente
pnpm dlx shadcn@latest add button card dialog

# atualizar quando upstream muda
pnpm dlx shadcn@latest diff button
pnpm dlx shadcn@latest update button   # aplica após revisar
```

Não rodar `update` em loop automatizado — cada update é revisão manual.

## `components.json`

Arquivo de configuração na raiz, lido pela CLI a cada operação. Contrato com o resto do projeto.

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

Campos críticos:

- **`style`:** `new-york` (padrão do projeto) ou `default`. Define o visual base (radius, density, sombras) e algumas variantes default. **Imutável** depois de adotado sem refactor.
- **`rsc`: `true`** para Next App Router. Faz a CLI gerar componentes com `"use client"` apenas onde necessário (componentes que dependem de hooks/state). Ver @stacks/frontend/next@16.
- **`tsx`: `true`** — TypeScript é padrão.
- **`tailwind.config`:** em Tailwind 4 dispensa arquivo de config; manter `""` (a CLI lê o CSS para resolver tokens). Se ainda existir `tailwind.config.ts` como ponte legacy, apontar para ele.
- **`tailwind.css`:** caminho do CSS principal que importa Tailwind e declara `@theme`. Ver @stacks/frontend/tailwind@4.
- **`tailwind.baseColor`:** paleta neutra base — `neutral`, `gray`, `zinc`, `stone`, `slate`. Decide a tonalidade dos cinzas em tokens semânticos não-coloridos. **Imutável** sem regenerar tokens.
- **`tailwind.cssVariables`: `true`** — usar CSS vars (recomendado, e contrato com Tailwind 4 `@theme`). `false` (utilities Tailwind diretas) é caminho deprecado para o projeto.
- **`aliases`:** seguem o `tsconfig.json` `paths`. Mudar aqui obriga mudar o `tsconfig`.
- **`iconLibrary`:** `lucide` (padrão). `radix` (ícones do Radix) é alternativa.

## Design tokens via CSS variables

O contrato entre shadcn/ui e Tailwind 4 é o conjunto de CSS vars semânticas. Esses tokens **devem existir** em `@theme inline { ... }` no `globals.css` (ver @stacks/frontend/tailwind@4):

| Token | Função |
|---|---|
| `--background` / `--foreground` | Cor de fundo / texto base da app |
| `--card` / `--card-foreground` | Superfícies de card |
| `--popover` / `--popover-foreground` | Dropdowns, popovers, dialogs flutuantes |
| `--primary` / `--primary-foreground` | Cor de marca / texto sobre ela |
| `--secondary` / `--secondary-foreground` | Cor secundária |
| `--muted` / `--muted-foreground` | Áreas de menor ênfase (placeholders, labels secundários) |
| `--accent` / `--accent-foreground` | Hover/selected states |
| `--destructive` / `--destructive-foreground` | Ações destrutivas, erros |
| `--border` | Bordas |
| `--input` | Borda de inputs |
| `--ring` | Anel de foco |
| `--radius` | Raio base; componentes derivam `--radius-sm`, `--radius-md`, `--radius-lg` |
| `--chart-1` a `--chart-5` | Cores de séries de gráficos (Chart) |
| `--sidebar-*` (várias) | Tokens dedicados ao componente `Sidebar` |

Regras:

- **Componentes shadcn consomem semânticos**, nunca paleta crua. `bg-primary` no `Button`, não `bg-blue-600`.
- **Mudar tema = redeclarar semânticos**, não editar componentes. Dark mode redeclara apenas estes tokens (em `:where([data-theme="dark"])` ou `.dark`).
- **Nomes coincidem entre `@theme` e o que os componentes esperam.** Renomear um token exige busca global em `src/components/ui/`.
- **Dark mode via classe.** Convenção do projeto: `data-theme="dark"` no `<html>`, casado com `@variant dark` no CSS (ver @stacks/frontend/tailwind@4). `next-themes` cuida do toggle SSR-safe.

## Catálogo de componentes

Cada componente adicionado vive em `src/components/ui/<name>.tsx` e é livre para edição. Catálogo atual:

| Componente | Notas |
|---|---|
| Accordion | Radix Accordion |
| Alert | Estático, sem comportamento |
| AlertDialog | Radix AlertDialog (modal de confirmação destrutiva) |
| AspectRatio | Radix AspectRatio |
| Avatar | Radix Avatar com fallback |
| Badge | Estático; variantes via `cva` |
| Breadcrumb | Estrutura semântica + slot pattern |
| Button | `cva` com `variant` (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`) e `size`. `asChild` ativo |
| Calendar | react-day-picker |
| Card | Composição de subcomponents (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) |
| Carousel | embla-carousel-react |
| Chart | recharts; tokens `--chart-1..5` |
| Checkbox | Radix Checkbox |
| Collapsible | Radix Collapsible |
| Combobox | Composição: Popover + Command |
| Command | cmdk; base de command palette e combobox |
| ContextMenu | Radix ContextMenu |
| DataTable | TanStack Table; receita, não componente único |
| DatePicker | Composição: Popover + Calendar |
| Dialog | Radix Dialog |
| Drawer | vaul (mobile-friendly bottom sheet) |
| DropdownMenu | Radix DropdownMenu |
| Form | react-hook-form + zod + `<Form>`, `<FormField>`, `<FormItem>`, `<FormLabel>`, `<FormControl>`, `<FormDescription>`, `<FormMessage>` |
| HoverCard | Radix HoverCard |
| Input | Wrapper de `<input>` com estilo |
| InputOTP | input-otp |
| Label | Radix Label |
| Menubar | Radix Menubar |
| NavigationMenu | Radix NavigationMenu |
| Pagination | Estrutura semântica para paginação |
| Popover | Radix Popover |
| Progress | Radix Progress |
| RadioGroup | Radix RadioGroup |
| Resizable | react-resizable-panels |
| ScrollArea | Radix ScrollArea |
| Select | Radix Select |
| Separator | Radix Separator |
| Sheet | Radix Dialog estilizado como side panel |
| Sidebar | Composto, com tokens dedicados (`--sidebar-*`) e estados via context |
| Skeleton | Bloco placeholder estático |
| Slider | Radix Slider |
| Sonner | Toaster atual (substitui `Toast` legado) |
| Switch | Radix Switch |
| Table | Estrutura semântica de `<table>` estilizada |
| Tabs | Radix Tabs |
| Textarea | Wrapper de `<textarea>` |
| TimePicker | Composição baseada em Input |
| Toggle | Radix Toggle |
| ToggleGroup | Radix ToggleGroup |
| Tooltip | Radix Tooltip |
| Typography | Receitas de classes para `<h1>...<p>...<blockquote>` (não é componente único) |

**`Toast` está descontinuado** em favor de `Sonner`. Novo código usa Sonner; código legado que ainda usa `Toast` migra em janela dedicada.

## Padrões de uso

### `cn()` helper

`src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Toda composição condicional de className passa por `cn()`. Nunca concatenar strings. Ver @stacks/frontend/tailwind@4.

### Variants com `cva`

```ts
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
```

`compoundVariants` para combinações específicas (ex.: `variant="outline" size="icon"` precisa de ajuste de padding). Evitar adicionar props booleanas paralelas (`isDanger`, `isLarge`) — promovê-las a `variant`.

### `asChild` (Radix Slot)

Permite delegar o rendering para o filho, mesclando props e refs:

```tsx
<Button asChild>
  <Link href="/profile">Perfil</Link>
</Button>
```

O `Button` não renderiza `<button>`; mescla suas classes/handlers no `<a>` que o `Link` renderiza. Padrão herdado do Radix (`@radix-ui/react-slot`). Disponível em quase todos os componentes shadcn que aceitam children semânticos. Ver @stacks/frontend/radix-ui.

### Forms

Stack: `react-hook-form` + `zod` resolver + componentes shadcn `<Form>`.

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  function onSubmit(values: FormValues) {
    // ...
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl><Input type="email" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Entrar</Button>
      </form>
    </Form>
  );
}
```

Schema único (`zod`) governa client e server. Ver @rules/validation e Stacks/Zod (futuro).

### Tabelas (DataTable)

shadcn entrega receita, não componente único. `@tanstack/react-table` é a engine; o `DataTable` em `src/components/ui/data-table.tsx` é base estrutural com sorting/filter/pagination plugáveis. Decisão server-side vs client-side é por caso de uso (volume, latência, paginação cursor vs offset).

### Server Components vs Client Components

Ver @stacks/frontend/next@16 e @stacks/frontend/react@19.

- **Componentes shadcn com hooks/state/handlers** (Dialog, Form, DropdownMenu, etc.) → Client Components (`"use client"` no topo do arquivo gerado pela CLI).
- **Componentes apresentacionais puros** (Card, Badge, Alert, Skeleton, Avatar) → podem ser usados em RSC sem `"use client"`.
- **Não passar handlers de RSC para Client Component** — passar via Client wrapper, ou subir o handler para Client boundary.
- **A CLI já marca corretamente.** Não remover `"use client"` "para otimizar" sem entender o componente.

### Theming e dark mode

`next-themes` é o provider canônico:

```tsx
// app/providers.tsx
'use client';
import { ThemeProvider } from 'next-themes';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
```

```tsx
// app/layout.tsx
<html lang="pt-BR" suppressHydrationWarning>
  <body><Providers>{children}</Providers></body>
</html>
```

`suppressHydrationWarning` no `<html>` é necessário porque `next-themes` muta o atributo antes da hidratação.

Geradores de tema: `ui.shadcn.com/themes` (oficial) e `tweakcn`. Output é CSS vars — copiar para `@theme inline` em `globals.css`.

## Acessibilidade

Comportamento e ARIA herdados de Radix (ver @stacks/frontend/radix-ui). Pontos de atenção quando se edita componentes shadcn:

- **Não remover atributos `aria-*`, `role`, `data-*` gerados pelos primitives.** Eles alimentam screen readers e variantes Tailwind (`data-[state=open]:`).
- **Foco visível obrigatório.** Componentes shadcn usam `focus-visible:ring-2 focus-visible:ring-ring`. Não trocar por `focus:` (pisca em click) nem remover. Ver @rules/accessibility.
- **`Sonner` é acessível por default** (anúncio via aria-live region). Não substituir por toaster custom sem replicar.
- **`Tooltip` não substitui label.** Sempre acompanhar de `aria-label` ou texto visível para leitores.
- **`Dialog` exige `DialogTitle`** mesmo quando visualmente oculto (`sr-only`). Radix loga warning sem ele.

## Customização sustentável

Componentes em `src/components/ui/` são SEUS — editar é o caminho esperado. Disciplinas para que isso não vire dívida:

1. **Tokens semânticos, não paleta crua.** `bg-primary`, `text-foreground`, `border-border`. Hardcode (`bg-blue-600`) só em ilustrações pontuais.
2. **Variantes via `cva`, não props booleanas.** Adicionar `variant="success"` em vez de `isSuccess`.
3. **Comentário curto onde editou.** Quando uma divergência intencional do upstream é não-óbvia, `// shadcn diff: removido X porque Y` torna o próximo `shadcn update` revisável. Ver @rules/documentation quando aplicável.
4. **Wrappers de domínio em camada acima.** `src/features/<feature>/components/<X>.tsx` consome `src/components/ui/`. **Não** colocar componentes de domínio dentro de `ui/`. Ver @architecture/fsd / @architecture/feature-based.
5. **`shadcn update` periódico, com revisão.** Janela trimestral para revisar diffs upstream relevantes; aplicar o que faz sentido, ignorar o que não se aplica ao seu fork.
6. **Versionamento conjunto com Radix.** Bump de Radix → rodar `shadcn diff` nos componentes que dependem do primitive afetado.

## Registry de terceiros

A CLI aceita URLs de registries externos:

```bash
pnpm dlx shadcn@latest add https://example.com/r/component.json
```

Registries notáveis: Origin UI, shadcn-extension, Aceternity UI, MagicUI, etc. Antes de adotar:

- **Licença compatível** com o projeto.
- **Style coerente** com `new-york` (ou o que o projeto adotou).
- **Dependências aceitáveis** — alguns registries puxam libs de animação pesadas (`framer-motion`, `gsap`).
- **Manutenção viva** — registries abandonados viram dívida.

Ver @rules/governance para política de adoção de dependências.

Para componentes internos reutilizáveis entre apps, o projeto pode publicar seu próprio registry via `shadcn build` (gera os JSONs de manifest).

## Migração de Tailwind 3 → Tailwind 4

Projetos vindos de shadcn em Tailwind 3:

1. Migrar Tailwind 3 → 4 (ver @stacks/frontend/tailwind@4 — seção de migração).
2. Rodar `pnpm dlx shadcn@latest init` no projeto migrado — a CLI detecta Tailwind 4 e atualiza `components.json` (`tailwind.config: ""`, `cssVariables: true`).
3. Mover tokens de `tailwind.config.ts` para `@theme inline` em `globals.css`. Nomes dos tokens semânticos permanecem (`--background`, `--primary`, etc.) — só a sintaxe muda.
4. **Não rodar `shadcn update` em massa.** Componentes locais editados podem perder customizações. Atualizar individualmente, revisando cada diff.
5. Validar dark mode: `next-themes` com `attribute="data-theme"` casado com `@variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))` em CSS.

## Anti-patterns

| Errado | Certo | Motivo |
|---|---|---|
| Tratar `src/components/ui/` como off-limits ("não posso mexer no shadcn") | Editar livremente; é seu código | A premissa do shadcn é ownership |
| `import { Button } from 'shadcn-ui'` | `import { Button } from '@/components/ui/button'` | Pacote não existe; shadcn é copy, não install |
| `bg-blue-600` no `Button` | `bg-primary` | Hardcode quebra tema, dark mode e rebrand |
| Componente de domínio (`UserProfileCard`) dentro de `src/components/ui/` | `src/features/users/components/user-profile-card.tsx` consumindo `Card` de `ui/` | `ui/` é base; domínio mora acima |
| Reimplementar comportamento do Radix manualmente "para customizar" | Estender via `asChild`, slots, edição mínima do componente shadcn | Perde acessibilidade testada; ver @stacks/frontend/radix-ui |
| Esquecer `asChild` quando precisaria (renderiza `<button>` dentro de `<a>`) | `<Button asChild><Link .../></Button>` | HTML inválido; perde semântica |
| Rodar `shadcn update` em todos os componentes sem revisão | `shadcn diff` por componente, aceitar com critério | Sobrescreve edits intencionais |
| Misturar `style="new-york"` e `"default"` em componentes diferentes | Escolher um no `components.json` e manter | Visual inconsistente; tokens divergem |
| Forms com `useState` local | `react-hook-form` + `zod` via `<Form>` | Validação fragmentada; UX inferior; ver @rules/validation |
| Usar `Toast` legado em código novo | `Sonner` | `Toast` está descontinuado upstream |
| Carregar todos os componentes em layout/raiz quando uso é localizado | Importar onde se usa; deixar code splitting trabalhar | Bundle inflado em rotas que não usam |
| `cssVariables: false` em `components.json` | `true` | Quebra contrato com `@theme` do Tailwind 4 |
| Editar `Button` global para um caso pontual de feature | Wrapper de feature consumindo `Button` com variant | Acopla `ui/` a domínio |
| Trocar `lucide-react` por outro pack ad-hoc em alguns componentes | Definir uma library (`iconLibrary` no `components.json`) e seguir | Bundles duplicados; estilo inconsistente |
| Remover `focus-visible:ring-*` de um componente "para limpar" | Manter; é a11y, não decoração | Quebra navegação por teclado; ver @rules/accessibility |
| `<DialogContent>` sem `<DialogTitle>` (oculto ou visível) | Sempre incluir `DialogTitle`, usando `sr-only` se visualmente oculto | Radix loga warning; SR users perdidos |
| Passar handler `onClick` para componente shadcn renderizado em RSC | Wrapper Client ou subir handler para Client boundary | Hooks/handlers só em Client; ver @stacks/frontend/next@16 |
| Concatenar classes com `+` ou template literals (`'btn ' + (active ? 'on' : '')`) | `cn('btn', active && 'on')` | Conflitos não resolvem; difícil ler |
| Hardcodar `--radius: 8px` em CSS Module por cima de um componente | Editar o token em `@theme` (ou criar variant `size="xl"` com radius customizado) | Drift entre componente e tema |
| Instalar componente do registry de terceiros sem revisão | Avaliar licença, deps, estilo antes (`shadcn view` primeiro) | Dívida invisível |
| Manter `tailwind.config.ts` antigo + `@theme` novo | Migrar tudo para `@theme` (ou ponte `@config` temporária documentada) | Dupla verdade |

## Roadmap

- **shadcn CLI:** seguir releases; mudanças em `components.json` são raras mas costumam aditivas.
- **Tailwind 5:** sem timeline. Tailwind 4 é a fronteira atual; quando 5 sair, shadcn provavelmente lança nova geração de componentes.
- **Radix UI:** acompanhar majors (causa principal de `shadcn diff` relevante).
- **Componentes em incubação upstream:** revisar `ui.shadcn.com` periodicamente; adicionar quando entra no catálogo estável.

## Referências

- Site: https://ui.shadcn.com
- Docs: https://ui.shadcn.com/docs
- Registry: https://ui.shadcn.com/docs/registry
- GitHub: https://github.com/shadcn-ui/ui
- Themes: https://ui.shadcn.com/themes
- tweakcn: https://tweakcn.com

## Referências cruzadas

- @stacks/frontend/radix-ui — primitives headless por baixo dos componentes shadcn; comportamento e ARIA.
- @stacks/frontend/tailwind@4 — engine de estilo; contrato de tokens semânticos em `@theme`.
- @stacks/frontend/react@19 — fronteira Server/Client; hooks; refs.
- @stacks/frontend/next@16 — App Router, RSC, `next/font`, providers em layout.
- @rules/accessibility — `focus-visible:`, `motion-safe:`, contraste, targets de toque.
- @rules/validation — schema-first com zod; integração com formulários shadcn.
- @rules/documentation — comentários mínimos em divergências intencionais do upstream.
- @rules/governance — política de adoção de registries de terceiros.
- @architecture/fsd / @architecture/feature-based — onde moram wrappers de domínio que consomem `ui/`.
- @decisions — ADRs sobre adoção de shadcn, escolha de `style`/`baseColor`, eventual saída para outra base.
