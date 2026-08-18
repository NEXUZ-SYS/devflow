# Achado: o gate de branch protection bloqueia paths fora do repositório

**Data:** 2026-08-18
**Origem:** sessão de migração do plugin DevFlow do escopo `user` para `project`
**Status:** aberto (bug de produto, alcança projeto-cliente)
**Severidade:** média — não corrompe nada, mas força branch espúria e trava trabalho legítimo

## Sintoma observado

Na `main` do repo devflow, uma tentativa de editar `~/.claude/settings.json` (config
global do Claude Code, **fora** do working tree) foi negada pelo hook:

```
BLOQUEADO: Você está na branch protegida 'main'. Não é permitido editar código do
projeto diretamente nesta branch.
Arquivo bloqueado: /home/walterfrey/.claude/settings.json
```

O arquivo não é código do projeto, não é versionado pelo projeto e não tem relação
com a branch. Ainda assim, foi preciso criar `fix/plugin-scope-project` no repo devflow
só para conseguir editar uma configuração de ambiente do usuário.

## Causa raiz

`hooks/pre-tool-use` aplica o gate a **qualquer** `$FILE_PATH`, sem nunca verificar se
o path está contido no repositório:

- **`hooks/pre-tool-use:319-324`** — `is_nonproject_path()` isenta apenas dois padrões:
  ```sh
  */.claude/projects/*/memory/*|*/.context/napkin.md
  ```
  Esses dois caem em `permissionDecision: ask`. Todo o resto cai no bloco de deny.

- **`hooks/pre-tool-use:~435-476`** — o BLOCK final monta `permissionDecision: deny`
  para o `$FILE_PATH` recebido. Não há cálculo de `git rev-parse --show-toplevel` nem
  comparação de containment.

A única isenção por localização que existe é a do próprio plugin
(`hooks/pre-tool-use:335-343`, via `$CLAUDE_PLUGIN_ROOT`).

Ou seja: a allowlist é **por padrão de nome de arquivo**, não por pertencimento ao
projeto. Isso resolveu o caso pontual da auto-memory e deixou a classe inteira aberta.

## Blast radius

Enquanto o usuário está numa branch protegida de qualquer projeto DevFlow, ficam
hard-denied (sem escape a não ser criar branch no projeto):

- `~/.claude/settings.json`, `~/.claude/CLAUDE.md`, hooks e agents globais do usuário
- dotfiles em geral: `~/.zshrc`, `~/.gitconfig`, `~/.ssh/config`
- arquivos de **outro** projeto/worktree aberto como diretório adicional

É agravado pelo fato de o DevFlow ser um PLUGIN: isso acontece em projeto-cliente
(Node/Python/Odoo), não só no dogfooding. O usuário-cliente é empurrado a poluir o
histórico do projeto dele com uma branch que não tem nada a ver com o projeto.

## Correção proposta

Generalizar o conceito de "não é código do projeto" de *padrão de nome* para
*containment no repo root*:

1. Resolver o repo root uma vez (`git -C "${CWD:-$PWD}" rev-parse --show-toplevel`).
2. Se `$FILE_PATH` (após `realpath`, para não ser burlado por `..`/symlink) **não**
   estiver sob o repo root → `permissionDecision: ask`, não `deny`.
3. Manter `deny` apenas para paths dentro do repo, que é o que a branch protection
   existe para proteger.

`ask` em vez de `exit 0` é deliberado: mantém o freio contra o agente editar dotfiles
silenciosamente, e fica coerente com o tratamento que a auto-memory já recebe. Os dois
padrões atuais de `is_nonproject_path()` passam a ser casos particulares da regra nova
(`.context/napkin.md` continua precisando de entrada própria — está *dentro* do repo).

## Testes a escrever (RED primeiro)

- Na branch protegida, Write em `$HOME/.claude/settings.json` → `ask` (hoje: `deny`).
- Na branch protegida, Write em `<repo>/src/x.js` → `deny` (regressão, não pode mudar).
- Na branch protegida, Write em `<repo>/.context/napkin.md` → `ask` (regressão).
- Path traversal: Write em `<repo>/../fora.txt` → resolve para fora → `ask`, e **não**
  é lido como dentro do repo.
- Symlink dentro do repo apontando para fora → `ask` (containment por `realpath`).
- Fora de repo git (sem toplevel) → não pode virar `deny` por acidente.

## Relacionados

- `docs/superpowers/2026-07-20-subagent-git-guardrails-gap.md` — outra lacuna do mesmo
  guard (feature-branch PR+merge por subagent passa batido).
