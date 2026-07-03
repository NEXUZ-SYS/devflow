# live — iteração ao vivo no navegador (via bridge)

## Objetivo

Iteração visual ao vivo: selecionar um elemento na página, escolher uma ação de design, receber variantes geradas com preview instantâneo no navegador (HMR). No DevFlow, isso roda o toolkit upstream (`impeccable live`) — **execução de terceiros, fora do TCB** — atrás de uma **bridge** que impõe gates de segurança. Este modo não reimplementa o live; ele o **invoca com guardrails**.

## Quando usar

- Quando há um dev server rodando (Vite/Next/Bun com HMR) ou um HTML estático, e você quer explorar direções visuais interativamente.
- Só em branch de feature (ver hard-gate abaixo).

## A bridge (`scripts/design/live-bridge.mjs`)

O único ponto de entrada do `live` é `scripts/design/live-bridge.mjs` (entregue na fase F). Ele executa, **nesta ordem**, e aborta ao primeiro que falhar:

1. **Hard-gate de feature branch.** Verifica a branch atual. Se for uma branch **protegida** (`main`/`master`/release), **recusa** — o `live` mexe em arquivos-fonte com um processo de terceiros e nunca deve rodar direto no tronco. É um gate bloqueante, não um aviso; só prossegue numa feature branch.
2. **Node ≥ 24.** Valida a versão do runtime; abaixo disso, recusa.
3. **Versão + integridade sha512.** Confere que o pacote a executar bate com a **versão pinada** e com o hash **sha512** esperado (integridade do artefato de terceiros antes de rodá-lo). Divergência → recusa.
4. **Consentimento por-invocação.** Pede consentimento explícito **a cada** invocação (não há "lembrar"): o usuário confirma que aceita rodar código de terceiros que edita a árvore de trabalho.
5. **Executa** `npx impeccable@<pinned> live` (versão pinada, resolvida pela bridge) apenas se 1–4 passaram.

**Sem marcador em hook de pré-execução.** Decisão da Revisão R: o `live` **não** instala nem depende de um marcador/guard em hook de pré-execução de ferramenta. O gate vive **inteiro na bridge**, invocada explicitamente. Não há guard/marcador de `live` em nenhum hook de pré-execução — o mecanismo é a bridge, ponto.

## Passos

1. **Pré-requisitos** — dev server com HMR (ou HTML estático) no ar; branch de feature (não protegida); Node ≥ 24.
2. **Invocar a bridge** — rode `scripts/design/live-bridge.mjs`. Deixe-a rodar os gates 1–4. Se recusar, leia o motivo (branch protegida? Node velho? hash divergente? consentimento negado?) e corrija a condição — não contorne o gate.
3. **Sessão live** — com os gates verdes e o consentimento dado, a bridge sobe o `impeccable live` pinado. Você seleciona elementos, escolhe ação (`bolder`, `colorize`, `layout`…), e o processo gera variantes com preview via HMR. Grounding de marca continua valendo: as variantes têm de permanecer legíveis como a mesma identidade (leia `@.context/product/product-design-system.md`).
4. **Aceitar/descartar** — ao aceitar uma variante, o upstream costura o resultado no fonte; revise o diff como código de terceiros antes de seguir.
5. **Encerrar** — pare o servidor da sessão e limpe marcadores residuais deixados pelo processo.

## Fronteira de segurança (leia)

- O `live` é **execução de terceiros fora do TCB do DevFlow**. Tudo o que ele faz passa pelos gates da bridge; nada de `live` deve rodar sem ela.
- **Não** promova o `live` a default nem o encadeie automaticamente a partir de outros modos — ele exige consentimento por-invocação por design.
- **Não** rode em branch protegida (o gate recusa; respeite).
- A versão é **pinada** e verificada por sha512 — não troque a versão sem atualizar o hash pinado (isso é mudança de produto, não de sessão).
