# Contexto Odoo do projeto (exemplo) — `.context/odoo-project.md`

> Copie para `.context/odoo-project.md` no projeto e preencha. Específico de
> máquina/projeto — NUNCA versionar valores reais no plugin. Consumido pelo agente
> `odoo-specialist` e pelas skills L1/L2/L3.

## Versão Odoo
- Série alvo: `<NN.0>`  (ex.: 18.0)
- Detecção: `odoo/release.py` / `__manifest__.py version` / branch

## Ambientes de desenvolvimento

| Ambiente | Path | DB | Porta |
|----------|------|----|-------|
| Dev | `<PATH_DO_AMBIENTE>` | `<NOME_DO_DB>` | `<PORTA>` |
| Deploy target | `<PATH_DEPLOY>` | — | — |

## Docker
- Service-name do container Odoo: `<service>`  (ex.: app, odoo, web)
- Comando de teste: `docker compose exec -T <service> python3 <odoo-bin> -d <db> --test-enable -u <mod> --stop-after-init`
- Após update de módulo: reiniciar `<service>` (cache não invalida sozinho)

## Recursos do projeto
- Napkin: `.claude/napkin.md`
- Handoff: `.context/workflow/handoff.yaml`
- Planos: `.context/plans/`
- Módulos: `<path/dos/addons>`

## Overlay
- Projeto NXZ? `<sim|nao>` (se sim, a skill `odoo-nxz-overlay` é ativada pelo profile `nxz`)
