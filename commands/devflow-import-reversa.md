# /devflow import-reversa

Importa um projeto gerado pelo Reversa e o aterrissa como projeto DevFlow executável.

## Usage

```
/devflow import-reversa <source>
```

## Behavior

1. Invoque a skill `devflow:import-reversa`.
2. Passe `<source>` como o diretório do projeto Reversa a importar.
3. A skill conduz: validação → destino (interativo) → bootstrap → readiness → reconcile → emit → handoff.

## Arguments

- `<source>` — caminho do projeto Reversa (deve conter `.reversa/` + `_reversa_forward/`/`_reversa_sdd/`).
