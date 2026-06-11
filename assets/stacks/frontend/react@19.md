---
title: React
version: 19.x
last_updated: 2026-05-20
status: current
upstream: https://react.dev
release_notes: https://react.dev/blog/2024/12/05/react-19
released: 2024-12-05
next_target: 19.x patches; avaliar 20.x quando ecossistema (Next, Vercel AI SDK, libs de UI) consolidar
---

# React 19

Biblioteca de UI do projeto. Opera como camada de componentes dentro de @stacks/frontend/next@16 (App Router) e abaixo de @stacks/frontend/tailwind@4, @stacks/frontend/shadcn-ui e @stacks/frontend/radix-ui. Renderização server-side e Server Functions são expostas pela framework (Next); este documento cobre a parte React da equação — modelo de componentes, hooks, ações, novos primitivos de 19 e convenções TypeScript.

**Escopo deste documento:** React como biblioteca — modelo de componentes, hooks, Server Components/Functions do ponto de vista de React, ações e formulários, `use()`, ref como prop, metadata e preloading de recursos, integração TS, React Compiler. Para o que pertence ao framework (roteamento, caching de `fetch`, route handlers, edge vs Node), ver @stacks/frontend/next@16. Para estilização, ver @stacks/frontend/tailwind@4. Para componentes prontos, ver @stacks/frontend/shadcn-ui e @stacks/frontend/radix-ui.

## Versão e ciclo de vida

- **Linha:** React 19.x estável (lançada em dezembro de 2024).
- **Status:** padrão para todos os apps web do projeto.
- **Dependência de Next:** Next 15 envia React 19 — versões caminham juntas.
- **Pinagem:** `react` e `react-dom` em versão exata no `package.json`. `@types/react` e `@types/react-dom` na linha 19.
- **Strict Mode:** **ligado** em dev. Detecta side effects em render, double-invocation de effects, problemas de cleanup. Não desligar.
- **React Compiler:** opt-in, ainda em RC/estabilização. Tratado em seção própria; não obrigatório.

```json
{
  "dependencies": {
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "@types/react": "19.0.0",
    "@types/react-dom": "19.0.0"
  }
}
```

## Mudanças marcantes (18 → 19)

Mudanças que afetam código real. Ler antes de portar código de 18.

### 1. Actions (transições assíncronas com pending/error/optimistic)

Funções async chamadas em uma transição passam a ser **Actions**. React gerencia o estado `isPending`, propaga erros para Error Boundaries e permite optimistic updates com rollback.

```tsx
'use client';
import { useTransition } from 'react';

export function SaveButton({ id, value }: { id: string; value: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await save(id, value);
        });
      }}
    >
      {isPending ? 'Salvando…' : 'Salvar'}
    </button>
  );
}
```

Em vez de `useState`/`try/catch`/`setLoading`, React modela o ciclo. Combina com `useOptimistic` e `useActionState`.

### 2. `useActionState` — formulários com estado tipado

Substitui `useFormState` de 18. Retorna `[state, formAction, isPending]`.

```tsx
'use client';
import { useActionState } from 'react';
import { createPost } from './actions';

type State = { ok: boolean; error?: string; postId?: string };

const initial: State = { ok: false };

export function PostForm() {
  const [state, formAction, isPending] = useActionState<State, FormData>(
    async (_prev, formData) => {
      try {
        const post = await createPost(formData);
        return { ok: true, postId: post.id };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
      }
    },
    initial,
  );

  return (
    <form action={formAction}>
      <input name="title" required />
      <textarea name="body" required />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Publicando…' : 'Publicar'}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
```

Em projeto: pareia com Server Actions (@stacks/frontend/next@16) — `formAction` pode ser uma Server Function passada diretamente para `<form action={createPost}>`.

### 3. `useFormStatus` — estado do form sem prop drilling

Lê o estado do `<form>` ancestral. Útil em componentes de botão/submit reutilizáveis.

```tsx
'use client';
import { useFormStatus } from 'react-dom';

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Enviando…' : children}
    </button>
  );
}
```

Só funciona **dentro** de um `<form>`. Fora, `pending` é `false`.

### 4. `useOptimistic` — updates otimistas com rollback automático

```tsx
'use client';
import { useOptimistic } from 'react';

export function Likes({ count, like }: { count: number; like: () => Promise<void> }) {
  const [optimistic, addOptimistic] = useOptimistic(count, (state, delta: number) => state + delta);

  return (
    <button
      onClick={async () => {
        addOptimistic(1);
        await like(); // se lançar, React reverte automaticamente
      }}
    >
      ♥ {optimistic}
    </button>
  );
}
```

Reverte ao valor real quando a transição que disparou o optimistic update termina (sucesso ou falha).

### 5. `use(...)` — ler Promises e Context condicionalmente

`use` é o primeiro "hook" que pode ser chamado dentro de condicionais e loops. Lê uma Promise (suspende até resolver) ou um Context.

```tsx
// Server Component passa Promise não-resolvida para Client Component
import { Suspense } from 'react';
import { getPosts } from '@/lib/posts';
import { PostList } from './post-list';

export default function Page() {
  const postsPromise = getPosts(); // não dá await aqui
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <PostList postsPromise={postsPromise} />
    </Suspense>
  );
}
```

```tsx
// post-list.tsx
'use client';
import { use } from 'react';

export function PostList({ postsPromise }: { postsPromise: Promise<Post[]> }) {
  const posts = use(postsPromise);
  return <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>;
}
```

Padrão canônico para streaming render-as-you-fetch entre RSC e Client. Combina com `<Suspense>` em @stacks/frontend/next@16.

`use(context)` também funciona — útil para ler Context condicionalmente (impossível com `useContext`).

### 6. `ref` como prop — fim de `forwardRef` em código novo

Em 19, `ref` é uma prop normal de componentes função. `forwardRef` continua funcionando mas é **deprecado** para código novo.

```tsx
// Errado (estilo 18)
const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <input ref={ref} {...props} />
));

// Certo (19)
function Input({ ref, ...props }: InputProps & { ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />;
}
```

Em projeto: ao tocar em componente que usa `forwardRef`, **migre**. Não criar `forwardRef` novo.

### 7. Document metadata em qualquer componente

`<title>`, `<meta>`, `<link>` são içados (hoisted) para `<head>` automaticamente. Útil para componentes que precisam declarar metadata contextual.

```tsx
function Article({ post }: { post: Post }) {
  return (
    <article>
      <title>{post.title}</title>
      <meta name="description" content={post.excerpt} />
      <link rel="canonical" href={`https://example.com/posts/${post.slug}`} />
      <h1>{post.title}</h1>
      {/* ... */}
    </article>
  );
}
```

**Em apps Next 15, prefira a Metadata API** (`generateMetadata` em `page.tsx`/`layout.tsx`) — ver @stacks/frontend/next@16. Document metadata no React é fallback útil para componentes deeply nested onde a Metadata API não chega; em geral evitar duplicar.

### 8. Stylesheets com `precedence`

```tsx
<link rel="stylesheet" href="/styles/base.css" precedence="default" />
<link rel="stylesheet" href="/styles/overrides.css" precedence="high" />
```

React ordena os `<link rel="stylesheet">` por `precedence` no `<head>`, garantindo cascade previsível mesmo com stylesheets injetados por componentes folha.

Em projeto: estilização principal vive em Tailwind (@stacks/frontend/tailwind@4); usar `precedence` apenas para CSS pontual de bibliotecas que injetam suas próprias folhas.

### 9. Async scripts como children

```tsx
<script async src="https://cdn.example.com/widget.js" />
```

Scripts async são deduplicados pelo `src` e içados; podem aparecer em qualquer profundidade.

### 10. Resource preloading

API formal para hints de carregamento:

```tsx
import { prefetchDNS, preconnect, preload, preloadModule, preinit, preinitModule } from 'react-dom';

prefetchDNS('https://cdn.example.com');
preconnect('https://api.example.com');
preload('/fonts/inter.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
preinit('https://cdn.example.com/analytics.js', { as: 'script' });
```

Em projeto: Next já cobre a maioria via `next/font` e `next/image`. Usar essas APIs apenas para casos específicos não cobertos pelo framework.

### 11. `<Context>` como Provider

```tsx
// Errado (estilo 18, ainda funciona com warning)
<ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>

// Certo (19)
<ThemeContext value={theme}>{children}</ThemeContext>
```

### 12. `useDeferredValue` aceita `initialValue`

```tsx
const deferred = useDeferredValue(value, ''); // valor inicial no primeiro render
```

### 13. Custom Elements — suporte melhorado

19 propaga corretamente props para Custom Elements (Web Components), incluindo strings, números, booleanos e funções (como event listeners). Não há mais necessidade de `ref` + `setAttribute` manual na maioria dos casos.

### 14. Erros — handlers em `createRoot`/`hydrateRoot`

Hydration mismatches ficaram mais silenciosos e informativos. Três handlers configuráveis:

```ts
import { hydrateRoot } from 'react-dom/client';

hydrateRoot(document, <App />, {
  onCaughtError(error, errorInfo) {
    // erros capturados por Error Boundary
  },
  onUncaughtError(error, errorInfo) {
    // erros não capturados
    logErrorToService(error, errorInfo);
  },
  onRecoverableError(error, errorInfo) {
    // erros recuperados via re-render no client (típico de hydration mismatch)
  },
});
```

Em apps Next, o root é gerenciado pela framework — esses handlers são configurados via Next quando aplicável (instrumentação, Error Boundary global em `global-error.tsx`).

### 15. Removed/deprecated

- `propTypes` em function components — removido. Use TypeScript.
- `defaultProps` em function components — removido. Use **default parameters** de JS.
- String refs (`ref="foo"`) — removidos. Use callback refs ou `useRef`.
- `ReactDOM.render`, `ReactDOM.hydrate`, `ReactDOM.unmountComponentAtNode` — removidos. Use `createRoot`/`hydrateRoot`.
- `react-test-renderer/shallow` — descontinuado.
- `forwardRef` — deprecated (ainda funciona); migrar para ref como prop.
- Legacy Context (`contextTypes`, `getChildContext`) — removido.

## Server Components e Server Functions

React 19 estabiliza Server Components (RSC) e Server Functions (`'use server'`). No projeto, são consumidos via @stacks/frontend/next@16 (App Router).

**Server Component** (default em Next 15):

```tsx
// posts-page.tsx
import { getPosts } from '@/lib/posts';

export default async function PostsPage() {
  const posts = await getPosts();
  return <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>;
}
```

**Server Function** (Server Action em Next):

```ts
// app/posts/actions.ts
'use server';
import { z } from 'zod';

const Input = z.object({ title: z.string().min(1).max(200) });

export async function createPost(formData: FormData) {
  const input = Input.parse({ title: formData.get('title') });
  return db.posts.insert(input);
}
```

Server Functions são identificadas por **referência** (não pelo código) ao atravessar o boundary client→server. O cliente recebe um ID opaco que aponta para a função no servidor.

Regras gerais (detalhes em @stacks/frontend/next@16, @rules/validation, @rules/security):

- **Server por default** — `'use client'` apenas onde necessário (estado, event handlers, browser APIs).
- **Server Functions são fronteira de IO** — validar input com Zod, autenticar/autorizar no topo.
- **Funções não atravessam server→client** exceto Server Functions (referência serializada).
- **Não vazar secrets** via props para Client Components.

## Hooks — quando usar cada

| Hook | Usar quando | Não usar quando |
|---|---|---|
| `useState` | Estado local de UI (input controlado, toggle, modal) | Pode ser derivado de props/estado existente |
| `useReducer` | Estado com transições complexas, múltiplas ações relacionadas | Estado simples; um `useState` resolve |
| `useEffect` | Sincronizar com sistema externo (DOM API, subscription, timer) | Para **derivar** dados (use `useMemo` ou cálculo direto); para responder a **evento** (use handler); para fetch em Client Component que poderia ser RSC |
| `useRef` | Referência mutável que não dispara render; ref de DOM | Estado de UI (use `useState`) |
| `useImperativeHandle` | Expor API imperativa limitada (focus, scroll) em componente customizado | "Escapar" de unidirecional flow; quase sempre há padrão declarativo melhor |
| `useId` | IDs estáveis para a11y (`htmlFor`, `aria-describedby`) | Keys de lista (use IDs reais) |
| `useLayoutEffect` | Medições de DOM antes do paint | Qualquer coisa que `useEffect` resolve (mais barato) |
| `useTransition` | Transição entre estados pesados sem bloquear input | Para tudo que muda estado — granular demais |
| `useDeferredValue` | Deferir render de valor caro (input → lista filtrada grande) | Como debounce genérico |
| `useSyncExternalStore` | Integrar store externo (Zustand, Redux) com React | Estado puramente React |
| `useContext` | Ler Context (substituível por `use(Context)` em 19, mas ambos valem) | Como "global state" para tudo |
| `useMemo` | Cálculo comprovadamente caro reusado entre renders | Por hábito; especialmente sob React Compiler (ver seção própria) |
| `useCallback` | Identidade estável necessária para downstream (memoization, deps de effect) | Por hábito |
| `memo` | Componente pesado que recebe props estáveis e re-renderiza desnecessariamente | Em folhas leves; especialmente sob React Compiler |
| `useActionState` | Form com Server Action e estado pós-submit | Form trivial sem estado de resultado |
| `useFormStatus` | Componente filho do form precisa saber se está pendendo | Fora de um `<form>` |
| `useOptimistic` | Optimistic UI atrelada a transição | Update "fake" sem operação real correspondente |
| `use` | Ler Promise/Context em condicionais; integrar com Suspense | Como atalho preguiçoso quando `useState`/`useEffect` é o certo |

Ver @rules/state-management para política de onde mora cada tipo de estado.

## Padrões canônicos

### Composição sobre herança

React não tem herança de componentes. Composição por children e props.

```tsx
// Errado: tentar "herdar"
class CustomButton extends Button { /* não fazer */ }

// Certo: compor
function CustomButton(props: React.ComponentProps<typeof Button>) {
  return <Button {...props} className={cn('extra-styles', props.className)} />;
}
```

### Server Components > Client Components quando viável

Empurre `'use client'` para folhas. Páginas e layouts permanecem server quando possível. Detalhes em @stacks/frontend/next@16.

### Suspense para fronteiras de streaming

`<Suspense>` define onde React pode pausar o render e streamar fallback. Combinar com `use(promise)` em RSC.

### Error Boundaries

Capturar erros de render. Em apps Next, `error.tsx` e `global-error.tsx` cobrem o caso comum (@stacks/frontend/next@16). Para boundaries customizadas, classe component continua sendo a forma (até hoje não há hook equivalente). Ver @rules/error-handling.

### Formulários com Server Actions + `useActionState` + `useOptimistic`

Padrão canônico do projeto. Server Action faz a mutação validada; `useActionState` carrega resultado/erro; `useOptimistic` atualiza a UI antes da resposta.

### Context judicioso

Context é para dados que **muitos** componentes em uma subtree leem (theme, locale, auth user). Não para state management de aplicação — use store dedicado (Zustand) com `useSyncExternalStore`. Ver @rules/state-management.

## TypeScript com React 19

### Children

```ts
// Padrão atual
type Props = { children: React.ReactNode };

// Helper (ok, mas inline também)
type Props = React.PropsWithChildren<{ title: string }>;
```

### Componentes — preferir function declaration, **não** `React.FC`

```tsx
// Errado: React.FC carrega `children` implícito (já não em 19, mas convenção antiquada)
const Button: React.FC<ButtonProps> = (props) => <button {...props} />;

// Certo
function Button(props: ButtonProps) {
  return <button {...props} />;
}
```

### Props

```ts
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}
```

### Eventos

```ts
React.MouseEvent<HTMLButtonElement>
React.ChangeEvent<HTMLInputElement>
React.FormEvent<HTMLFormElement>
React.KeyboardEvent<HTMLInputElement>
```

### Ref como prop

```tsx
type InputProps = React.ComponentProps<'input'> & {
  ref?: React.Ref<HTMLInputElement>;
};

function Input({ ref, ...rest }: InputProps) {
  return <input ref={ref} {...rest} />;
}
```

### `useRef` em 19 — `RefObject<T | null>`

Em `@types/react@19`, `useRef<HTMLInputElement>(null)` retorna `RefObject<HTMLInputElement | null>` (não mais `MutableRefObject`). Implicação: `.current` é mutável como antes, mas o tipo inclui `null`. Lidar com checks `if (ref.current) { … }`.

### Reaproveitar props de componente existente

```ts
type LinkProps = React.ComponentProps<typeof Link>;
type ButtonHTMLProps = React.ComponentPropsWithoutRef<'button'>;
```

### Server Action — tipo da ação

```ts
type Action<State> = (state: State, formData: FormData) => Promise<State>;
```

### `forwardRef` desnecessário em código novo

Não tipar com `React.ForwardRefRenderFunction`. Use ref como prop.

## React Compiler

Compilador opt-in (babel/swc plugin) que **memoiza automaticamente** componentes e cálculos. Reduz necessidade de `useMemo`/`useCallback`/`memo` manual.

**Estado:** RC/estabilizando em 2026. Não obrigatório.

**Quando habilitar:**

- App estável com perfil de performance significativo (hotspots medidos).
- Build pipeline pode absorver a complexidade do plugin sem regressões.
- Time aceita que algumas memoizações manuais ficarão redundantes (manter ou remover — escolha local).

**Quando NÃO habilitar:**

- Bibliotecas publicadas em npm (consumidor escolhe seu próprio toolchain).
- Código com side effects em render (anti-pattern de qualquer forma, mas Compiler **assume pureza**).
- App pequeno onde a complexidade adicional não compensa.

**Sob React Compiler:**

- **Reduzir** `useMemo`/`useCallback`/`memo` em código novo — o compiler memoiza.
- **Manter** memoização manual apenas em hotspots medidos onde o compiler não atinge o resultado desejado.
- **Não confiar cegamente** — perfilhar com React DevTools antes e depois.

Decisão de habilitar registra-se como ADR (ver @decisions). Ver também @rules/performance.

## Integrações

### Com Next.js 15

Server Components, Server Functions, ref como prop, Document metadata, resource preloading — tudo consumido via convenções do App Router. Caching de `fetch`, route handlers, edge vs Node são do framework, não da biblioteca. Ver @stacks/frontend/next@16.

### Com Tailwind 4

Estilização via classes em `className`. Componentes recebem `className` como prop final (override pelo consumidor). Ver @stacks/frontend/tailwind@4.

```tsx
function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('rounded-lg border p-4', className)}>{children}</div>;
}
```

### Com Zustand 5 (state management)

Stores externos integram via `useSyncExternalStore` (Zustand já faz internamente). Em projeto, Zustand é o store padrão para estado global de client. Ver @stacks/state/zustand@5 (futuro).

### Com Vercel AI SDK e provedores de IA

Streaming de respostas via `use(promise)` em RSC ou hooks dedicados do AI SDK (`useChat`, `useCompletion`) em Client Components. Streaming de tokens entra no modelo de Suspense de React. Ver @stacks/ai/vercel-ai-sdk.

### Com Vitest / React Testing Library

Compatibilidade com React 19. Testar **comportamento**, não implementação. Ver @stacks/testing/vitest, @rules/testing e @practices/tdd.

## DevTools e debugging

- **React DevTools** (extensão de browser): inspeção de tree, props, hooks, Profiler.
- **Profiler API** (`<Profiler>`): medição programática de renders.
- **Strict Mode** (`<React.StrictMode>`): habilitado em dev pelo Next; detecta side effects, double-invocation de effects.
- **`onCaughtError`/`onUncaughtError`/`onRecoverableError`**: ganchos para observability na raiz (configurados via framework).

## Migração 18 → 19

1. **Codemod oficial:**
   ```bash
   npx codemod@latest react/19/migration-recipe
   ```
   Cobre boa parte das mudanças automatizáveis (renames, removed APIs).

2. **Manualmente:**
   - Atualizar `react`, `react-dom`, `@types/react`, `@types/react-dom` para 19.
   - Substituir `useFormState` por `useActionState`.
   - Substituir `<Context.Provider>` por `<Context>` (warning, não breaking).
   - Migrar `forwardRef` → ref como prop em componentes tocados.
   - Remover `defaultProps` em function components → default parameters.
   - Remover `propTypes` → confiar no TS.
   - Substituir `ReactDOM.render`/`hydrate` por `createRoot`/`hydrateRoot` (caso ainda exista).
   - Revisar `useRef<T>(null)` — tipo agora inclui `null`.

3. **Verificar libs de UI:** algumas libs que dependiam de `forwardRef` ou comportamentos legacy podem precisar de upgrade próprio. Confirmar antes de subir.

4. **Rodar suíte de testes + build em strict mode.** Validar hydration em rotas críticas.

Migração formal registra-se como ADR (ver @decisions).

## Anti-patterns

| Errado | Certo | Motivo |
|---|---|---|
| `useEffect(() => setX(deriveFrom(props)))` | Calcular inline ou com `useMemo` se caro | Effect para derivar é render extra desnecessário |
| `useEffect` para responder a evento (`useEffect(() => { if (clicked) doX() }, [clicked])`) | Chamar a ação no próprio handler | Effects são para sincronização, não para eventos |
| `useEffect(() => fetch(...))` em Client para dados que RSC resolve | Server Component async | Latência, perda de cache, exposição de auth |
| `"use client"` no topo de `layout.tsx` "para simplificar" | Server por default; client só nas folhas | Bundle inflado, sem RSC benefits |
| `React.FC<Props>` em código novo | `function Component(props: Props)` | `FC` carrega convenções antigas; declaração é mais idiomática |
| Class components em código novo | Function components com hooks | Legacy; Class só onde Error Boundary exige |
| `forwardRef` em código novo | Ref como prop | `forwardRef` deprecated em 19 |
| Manipular DOM via `document.querySelector`/`getElementById` | `useRef` + ref de elemento | Quebra abstração, hydration mismatch |
| Throw em render para "validação" | Validar antes; retornar UI de erro ou Error Boundary | Throw em render escala para Error Boundary e quebra UX se não tratado |
| `useMemo`/`useCallback` em tudo "por precaução" | Aplicar quando há ganho medido; sob React Compiler, ainda mais raro | Custos de memoização nem sempre compensam ganhos |
| `memo` em componente folha leve | Deixar re-renderizar | `memo` adiciona comparação shallow; em folha leve, mais caro que benefício |
| Custom hook que apenas chama um built-in (`useMyState = () => useState()`) | Usar built-in direto | Abstração sem valor; nome enganoso |
| Tudo via Context (`AuthContext`, `ThemeContext`, `UserDataContext`, `CartContext`...) | Context para o que cruza muitas subtrees; store dedicado para state | Context re-renderiza toda subtree; não é otimizado para state management |
| `defaultProps` em function components | Default parameters JS | Removido em 19 |
| `propTypes` | TypeScript | Removido para function components em 19 |
| `prop-types` em devDependencies | Remover pacote | Não usado mais |
| Mutar state diretamente (`state.x = 1`) | Criar novo objeto (`setState({ ...state, x: 1 })`) | React compara por referência |
| Effect sem cleanup (subscription, timer) | Sempre retornar cleanup quando aplicável | Memory leaks, listeners duplicados |
| Múltiplos `useState` para campos relacionados de form | `useActionState` ou single object state | Dispersão; estado não atômico |
| Optimistic update sem rollback | `useOptimistic` (rollback automático) | Inconsistência se a operação falhar |
| Esquecer Suspense boundary ao usar `use(promise)` | Sempre `<Suspense fallback>` ancestral | Suspende a árvore inteira até a raiz |

## Roadmap

- **Patches 19.x:** absorver em upgrade pontual. Validar com testes e build limpos.
- **React Compiler GA:** quando estabilizar, avaliar opt-in via ADR. Critério: build pipeline absorve, ganhos medidos, sem regressão em libs externas.
- **React 20.x:** avaliar quando Next.js suportar e ecossistema (AI SDK, libs de UI) acompanhar.

## Referências

- React 19 announcement: https://react.dev/blog/2024/12/05/react-19
- Docs oficiais: https://react.dev
- Hooks reference: https://react.dev/reference/react
- Server Components: https://react.dev/reference/rsc/server-components
- React Compiler: https://react.dev/learn/react-compiler
- Codemod: https://codemod.com/registry/react-19-migration-recipe

## Referências cruzadas

- @stacks/runtime/node@24 — runtime do server onde RSC executa.
- @stacks/language/typescript@6 — tipos de React 19, `tsconfig` para JSX.
- @stacks/frontend/next@16 — framework hospedeiro; App Router, Server Actions, caching.
- @stacks/frontend/tailwind@4 — estilização via `className`.
- @stacks/frontend/shadcn-ui — componentes prontos sobre Radix.
- @stacks/frontend/radix-ui — primitives headless.
- @stacks/validation/zod@4 — validação em Server Functions e formulários.
- @stacks/state/zustand@5 — store global de client, integra via `useSyncExternalStore`.
- @stacks/ai/vercel-ai-sdk — streaming de IA via Suspense/`use`.
- @stacks/testing/vitest — testes de componente.
- @rules/state-management — onde mora cada tipo de estado.
- @rules/error-handling — Error Boundaries, `onCaughtError`.
- @rules/performance — quando memoizar, Suspense, React Compiler.
- @rules/validation — Zod em Server Functions e formulários.
- @rules/security — não vazar secrets via props para Client.
- @rules/testing — testar comportamento, não implementação.
- @practices/tdd — ciclo TDD com Testing Library.
- @architecture/fsd — co-locação de componentes por feature.
- @decisions — ADRs de adoção de React Compiler, migrações maiores.
