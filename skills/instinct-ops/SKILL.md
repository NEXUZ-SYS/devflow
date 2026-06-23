---
name: instinct-ops
description: Use para minerar instincts do DevFlow a partir das observações de tool-use capturadas na sessão — destila comportamentos atômicos pontuados por confiança e os persiste no store. Trigger phrases '/devflow instinct mine', 'minerar instincts', 'destilar aprendizados da sessão', ou na fronteira de sessão quando o usuário optou por mineração. NÃO use para recall (isso é automático no SessionStart) nem quando instincts.enabled=false.
---

# Instinct Ops — Mineração de Instincts (DevFlow)

Destila **instincts** atômicos (1 gatilho → 1 ação, pontuados por confiança 0.3→0.9) a partir das observações de tool-use que o hook `post-tool-use` capturou na sessão. A análise é **LLM in-session** (sem daemon): você lê as observações, infere os instincts e os aplica via CLI.

> Privacidade (ADR-005 v1.1.0): **não minere** se `instincts.enabled: false` no `.context/.devflow.yaml` ou se `DEVFLOW_INSTINCTS_ENABLED` não estiver setado. O store é local-by-default e nunca é commitado. As observações já vêm redigidas (PII/credenciais → `[EMAIL]`/`[TOKEN]`/`[REDACTED]`).

## Quando ativar

- Comando explícito `/devflow instinct mine`.
- Fronteira de sessão (fim de sessão / antes de compactação), **apenas** quando o usuário optou por mineração (opt-in).
- Nunca dispare mineração automática sem sinal do usuário.

## Processo

1. **Ler observações não-consumidas:**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/instinct-cli.mjs" mine-read
   ```
   Retorna JSON `{ observations: [...], offset: N }`. Cada observação tem `{ ts, tool, target, outcome, signal }` (já redigida).

2. **Inferir instincts atômicos.** A partir dos padrões nas observações, formule instincts de **1 gatilho → 1 ação** (ex.: gatilho "ao buscar texto no código", ação "usar `rg` em vez de `grep -r`"). Evite instincts compostos ("e"/"ou" no enunciado → divida).

3. **Match semântico contra os existentes (I4).** Antes de criar, compare cada instinct inferido com os já presentes (rode `status` para listar). Se for o **mesmo aprendizado** de um existente, **reuse o `id` canônico** dele (reforço). Se for novo, gere um `id` novo em slug-kebab a partir do gatilho. O `id` é a identidade canônica — não crie duplicatas só por variação lexical do gatilho.

4. **Atribuir o delta de confiança:**
   - **Correção do usuário** detectada no transcript (o usuário corrigiu/contradisse um comportamento) → `delta: 0.2` (sinal forte). **Só a mineração** aplica `+0.2`.
   - Reforço de um instinct existente sem correção → `delta: 0.1`.
   - Instinct novo → `delta: 0.3` (a confiança inicial implícita do store é 0.3; um novo entra em `pending`).

5. **Aplicar os upserts:**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/instinct-cli.mjs" mine-apply --json=<arquivo.json>
   ```
   O contrato primário é `--json=<file>` (robusto a tamanho); `--inline '<json>'` existe só para conveniência. Cada item: `{ id, trigger, action, domain, delta }`.

6. **Setar checkpoint.** Após aplicar, marque as observações consumidas usando o `offset` retornado por `mine-read`, para não reprocessá-las na próxima mineração.

## Pontes (após mine-apply)

Para os instincts que ficaram **elegíveis** (confiança ≥ 0.8 ou escopo global), rode:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/instinct-cli.mjs" bridges
```
Para cada elegível, **proponha ao usuário** (nunca escreva calado):
- adicionar uma entrada candidata ao `.context/napkin.md`; e/ou
- gravar uma referência (id + trigger + action) no MemPalace — **somente** se detectado disponível (reuse a checagem de MemPalace dos hooks).

A proposta é **supervisionada**: aguarde confirmação do usuário antes de escrever em napkin/MemPalace.

## Privacidade

- Não minere com `instincts.enabled: false`.
- Nunca registre credenciais/PII: as observações já vêm redigidas; ainda assim, não reconstrua segredos a partir de fragmentos.
- O store XDG (`~/.local/share/devflow-instincts/`) é local e nunca commitado.
