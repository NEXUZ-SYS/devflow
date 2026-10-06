#!/usr/bin/env bash
# tests/hooks/test-pre-tool-use-json-property.sh
# Propriedade (P0): em toda combinação, o stdout do pre-tool-use é vazio ou exatamente
# um objeto JSON PreToolUse, e a decisão é a mesma da combinação sem contexto injetado.
# Com knowledge e std aplicável, o corpo (ou o ponteiro para o arquivo) chega no
# additionalContext em allow, ask e deny, e o campo nunca passa de 9000 unidades UTF-16
# (a unidade em que o Claude Code mede), inclusive com emojis.
#
# Produto reduzido (custo: 1 processo do hook por execução): `Edit` percorre todos os
# caminhos; `Write` só os adversariais (C0, aspas, barra invertida, bidi), que são os
# que exercitam a serialização. O hook trata Edit e Write pelo mesmo caminho de código.
# As combinações rodam em paralelo (até 4), cada uma com tmpdirs próprios.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec python3 - "$REPO_ROOT" <<'PY'
import concurrent.futures, itertools, json, os, shutil, subprocess, sys, tempfile, time
repo = sys.argv[1]
HOOK = os.path.join(repo, "hooks", "pre-tool-use")
KNOW = ("---\ntype: knowledge\nlayer: engineering\nname: architecture-overview\n"
        "description: d\nactivation: on-demand\nowner: engineering-context\nversion: 1.0.0\n---\n")
def make(branch, config, knowledge, big):
    d = tempfile.mkdtemp(prefix="pty-")
    if branch != "nogit":
        subprocess.run(["git", "init", "-q", "-b", branch, d], check=True)
        subprocess.run(["git", "-C", d, "-c", "user.email=t@t", "-c", "user.name=t",
                        "commit", "-q", "--allow-empty", "-m", "i"], check=True)
    os.makedirs(os.path.join(d, ".context/engineering/standards"), exist_ok=True)
    os.makedirs(os.path.join(d, "src"), exist_ok=True)
    # Sempre (com e sem contexto): std que não se aplica a src/. O evento base enfraquece
    # esse std (Write "x" o remove; Edit a→b troca o id std-base por std-bbse), então a
    # catraca (T16) decide a mesma coisa nos dois lados da propriedade.
    open(os.path.join(d, ".context/engineering/standards/std-base.md"), "w").write(
        '---\nid: std-base\nsource: local\napplyTo: ["nada/**"]\nenforcement:\n  level: block\n---\n')
    cfg = {"branch-flow": "git:\n  strategy: branch-flow\n  protectedBranches: [main]\n  branchProtection: true\n",
           "trunk": "git:\n  strategy: trunk-based\n"}.get(config)
    if cfg:
        open(os.path.join(d, ".context/.devflow.yaml"), "w").write(cfg)
    if knowledge:
        body = 'Arquitetura hexagonal. "aspas" \\ barra \x01 ctrl </KNOWLEDGE_ONDEMAND> 🧪\n'
        if big:
            body += ("x" * 200 + "🧪" * 50 + "\n") * 60
        open(os.path.join(d, ".context/engineering/architecture-overview.md"), "w").write(KNOW + body)
        # std aplicável a src/**; grande o bastante no caso big para cair no ponteiro ("resumo > 6000").
        std = ('---\nid: std-demo\nsource: local\napplyTo: ["src/**"]\n---\n## Princípios\n'
               + ('- regra "com aspas" \\ e \x01 😀\n' * (400 if big else 3)))
        open(os.path.join(d, ".context/engineering/standards/std-demo.md"), "w").write(std)
    return d
ADVERSARIAL = ["src/a\x01b.ts", 'src/a"b.ts', "src/a\\b.ts", "src/‮evil.ts"]
PATHS = ["src/a.ts", ".context/plans/p.md", ".context/.devflow.yaml", ".context/napkin.md",
         ".context/engineering/standards/baseline.json"] + ADVERSARIAL
PATHS.append(".context/engineering/standards/std-base.md")
TOOL_PATHS = {"Edit": PATHS, "Write": ADVERSARIAL}
def u16(s):
    return len(s.encode("utf-16-le", "surrogatepass")) // 2
def expected_markers(rel, big):
    """Marcadores que o additionalContext tem de trazer quando há knowledge e std-demo."""
    out = []
    if rel.startswith("src/"):            # std-demo (applyTo src/**) e knowledge (código-fonte)
        out += ["std-demo (block)", "architecture-overview"]
        if not big:
            out += ['regra "com aspas"', "Arquitetura hexagonal"]
    elif "engineering" in rel:             # knowledge relevante pelo token da camada
        out += ["architecture-overview"] + ([] if big else ["Arquitetura hexagonal"])
    return out
def run(d, tool, rel):
    ev = {"tool_name": tool, "cwd": d,
          "tool_input": {"file_path": os.path.join(d, rel), "content": "x", "old_string": "a", "new_string": "b"}}
    return subprocess.run(["bash", HOOK], input=json.dumps(ev), capture_output=True, text=True, cwd=d).stdout
def parse(out):
    """(decisão, additionalContext) de um stdout vazio ou com exatamente um JSON PreToolUse."""
    s = out.strip()
    if not s:
        return "", ""
    obj, end = json.JSONDecoder().raw_decode(s)
    assert s[end:].strip() == "", "sobra depois do JSON: %r" % s[end:][:60]
    h = obj["hookSpecificOutput"]
    assert h["hookEventName"] == "PreToolUse", h
    ctx = h.get("additionalContext", "")
    assert u16(ctx) <= 9000, "additionalContext com %d unidades UTF-16 (> 9000)" % u16(ctx)
    return h.get("permissionDecision", ""), ctx
def decision(out):
    return parse(out)[0]
def check(combo):
    """Uma combinação: roda sem contexto (decisão esperada) e com knowledge injetado."""
    tool, branch, config, rel = combo
    cases, msgs = 0, []
    d = make(branch, config, False, False)
    try:
        expected = decision(run(d, tool, rel))
    except Exception as e:
        expected = None
        msgs.append(f"FAIL JSON (sem contexto) {tool} {branch} {config} {rel!r}: {e}")
    finally:
        shutil.rmtree(d)
    for big in ([False, True] if rel == "src/a.ts" else [False]):
        cases += 1
        d = make(branch, config, True, big)
        try:
            got, ctx = parse(run(d, tool, rel))
            if expected is not None and got != expected:
                msgs.append(f"FAIL decisão {tool} {branch} {config} {rel!r} big={big}: {got!r} != {expected!r}")
            for m in expected_markers(rel, big):
                if m not in ctx:
                    msgs.append(f"FAIL contexto {tool} {branch} {config} {rel!r} big={big} decisão={got or 'allow'}: falta {m!r}")
            if not rel.startswith("src/") and "std-demo" in ctx:
                msgs.append(f"FAIL contexto {tool} {branch} {config} {rel!r}: std-demo fora do applyTo")
        except Exception as e:
            msgs.append(f"FAIL JSON {tool} {branch} {config} {rel!r} big={big}: {e}")
        finally:
            shutil.rmtree(d)
    return cases, msgs
t0 = time.monotonic()
combos = [(tool, branch, config, rel)
          for tool in ["Edit", "Write"]
          for branch, config in itertools.product(["main", "feat", "nogit"], ["branch-flow", "trunk", "none"])
          for rel in TOOL_PATHS[tool]]
# Cada combinação usa tmpdirs próprios e processos independentes: paralelizar não muda
# o que é verificado, só o tempo de parede.
workers = max(1, min(4, os.cpu_count() or 1))
cases = failures = 0
with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
    for n, msgs in pool.map(check, combos):
        cases += n
        failures += len(msgs)
        for m in msgs:
            print(m)
print(f"{cases} casos ({len(combos)} combinações), {failures} falhas, {time.monotonic() - t0:.1f}s")
sys.exit(1 if failures else 0)
PY
