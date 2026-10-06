// scripts/lib/standards-guard.mjs — catraca sob autoridade humana no Edit/Write (ADR-015 D6/D8).
//
// Decide sobre um evento PreToolUse de Edit/Write:
//   - `baseline.json` de standards (qualquer grafia, caixa, `./`, `//`, `..`, symlink ou
//     hardlink) → deny;
//   - `machine/**` e o shim `.context/bin/devflow-standards.mjs` → ask;
//   - std `.md`, `.context/standards.local.yaml` e `.context/.devflow.yaml` → ask se o
//     enforcement EFETIVO enfraquece, calculado com o MESMO parser do loader antes e depois
//     (`loadStandardsMerged` com `overrides`); promover ou mudar só texto → nada.
// O arquivo é classificado pelo caminho pedido (lógico) E pelo caminho real: um symlink fora de
// standards/ que aponta para um arquivo da catraca conta como o alvo, e um diretório da catraca
// acessado por symlink é mapeado de volta para o caminho lógico que o loader lê.
//
// Falha: o hook falha aberto em erro interno (D4), EXCETO na catraca — caminho que casa com a
// catraca e não dá para decidir vira ask (baseline: deny). Ver `lexicalFallback`.
import { lstatSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { findProjectRoot, trustedPluginRoot } from "./standards-engine.mjs";
import { loadStandardsMerged } from "./standards-loader.mjs";
import { realPathOr, baselineLogicalRel, baselineSymlinkComponent } from "./standards-baseline.mjs";
import { contextPaths, resolveReadPaths } from "./context-paths.mjs";
import { readFrameworkVersions, readFrameworkVersionsFromPath } from "./devflow-config.mjs";
import { readRegularFileDetailed, SAFE_READ_MAX_BYTES } from "./safe-read.mjs";
import { inlineSafe } from "./untrusted-frame.mjs";
import { effectiveEnforcement, enforcementWeakenings } from "./standards-enforcement-diff.mjs";

const TAG = "[devflow standards]";
const NONE = Object.freeze({ decision: "", reason: "" });
const MAX_LISTED = 15;
// Varredura de hardlinks: só roda quando o arquivo editado tem nlink > 1 (raro) e é limitada.
const MAX_SCAN = 2000;

const ask = (reason) => ({ decision: "ask", reason });

// ---------------------------------------------------------------------------------------------
// Conteúdo proposto
// ---------------------------------------------------------------------------------------------

/**
 * Conteúdo que o arquivo terá depois do Edit/Write. Write → `content`; Edit → `old_string` →
 * `new_string` na primeira ocorrência (ou em todas com `replace_all`); `old_string` ausente →
 * conteúdo atual. `tool` ("Edit" | "Write") desambigua eventos que trazem os dois campos; sem
 * ele, `content` vence. A substituição é literal (`$&` em `new_string` não é padrão).
 */
export function applyProposedEdit(current, ti = {}, tool) {
  const cur = String(current ?? "");
  if (tool !== "Edit" && typeof ti.content === "string") return ti.content;
  if (typeof ti.old_string !== "string" || ti.old_string === "" || !cur.includes(ti.old_string)) return cur;
  const repl = typeof ti.new_string === "string" ? ti.new_string : "";
  return ti.replace_all ? cur.split(ti.old_string).join(repl) : cur.replace(ti.old_string, () => repl);
}

// Limpeza que o Edit do Claude Code aplica ao new_string fora de .md/.mdx (2.1.288, `VYe`): tira o
// espaço em branco final de cada linha, preservando os separadores.
function stripTrailingWs(s) {
  const parts = String(s).split(/(\r\n|\n|\r)/);
  let out = "";
  for (let i = 0; i < parts.length; i++) out += i % 2 === 0 ? parts[i].replace(/\s+$/, "") : parts[i];
  return out;
}

/**
 * Conteúdos que um Write pode deixar no arquivo. Fora de .md/.mdx a ferramenta tira o espaço em
 * branco final de cada linha (M5 da revisão da T16): o guard simula o conteúdo como veio E sem
 * esse espaço, e pede ask se QUALQUER um enfraquecer. `markdown: true` → só o conteúdo como veio.
 */
export function proposedWriteVariants(content, { markdown = false } = {}) {
  const raw = String(content ?? "");
  return markdown ? [raw] : [...new Set([raw, stripTrailingWs(raw)])];
}

// `j` do Claude Code devolvendo as duas leituras: a troca literal e, com new_string vazio, old sem
// "\n" final e `old + "\n"` presente, a troca de `old + "\n"` (emenda a linha seguinte).
function editReadings(text, old, repl, all) {
  const sub = all ? (t, o) => t.split(o).join(repl) : (t, o) => t.replace(o, () => repl);
  const out = [sub(text, old)];
  if (repl === "" && !old.endsWith("\n") && text.includes(`${old}\n`)) out.push(sub(text, `${old}\n`));
  return out;
}

// Texto com CRLF em todas as quebras (o `Lze` do Claude Code).
const toCrlf = (t) => t.split("\r\n").join("\n").split("\n").join("\r\n");

/** Fim de linha misto: CRLF e LF sem CR no mesmo texto (rodada 3, N8). */
export function hasMixedEol(text) {
  const t = String(text ?? "");
  return t.includes("\r\n") && /(^|[^\r])\n/.test(t);
}

/**
 * Conteúdos que um Edit pode produzir. O guard pede ask se QUALQUER um enfraquecer.
 *  - Visão crua: a troca literal sobre o texto atual (e a emenda de linha, rodada 1).
 *  - Visão da ferramenta (Claude Code 2.1.288, rodadas 2 e 3): o texto atual com CRLF → LF; o
 *    new_string como veio e sem o espaço final de cada linha (o que a ferramenta faz fora de
 *    .md/.mdx — as duas, para não depender da extensão); as leituras de `j` (literal e emenda),
 *    com `replace_all` em cada uma; e a saída em LF E em CRLF — a ferramenta escolhe o fim de
 *    linha olhando só os primeiros 4096 caracteres, então o guard não escolhe por ela.
 * `old_string` que não casa em nenhuma visão → só o texto atual (o chamador decide o ask).
 */
export function proposedEditVariants(current, ti = {}) {
  const raw = String(current ?? "");
  const old = ti.old_string;
  if (typeof old !== "string" || old === "") return [raw];
  const repl = typeof ti.new_string === "string" ? ti.new_string : "";
  const all = !!ti.replace_all;
  const out = [];
  if (raw.includes(old)) out.push(...editReadings(raw, old, repl, all));
  const norm = raw.split("\r\n").join("\n");
  if (norm.includes(old)) {
    for (const r of new Set([repl, stripTrailingWs(repl)])) {
      for (const v of editReadings(norm, old, r, all)) out.push(v, toCrlf(v));
    }
  }
  return out.length ? [...new Set(out)] : [raw];
}

// ---------------------------------------------------------------------------------------------
// Caminhos
// ---------------------------------------------------------------------------------------------

const toPosix = (p) => (sep === "\\" ? String(p).replace(/\\/g, "/") : String(p));
const uniq = (xs) => [...new Set(xs)];
// Dobra de caixa para comparar como um FS sem distinção de caixa: maiúscula e depois minúscula
// (o NTFS compara pela tabela de maiúsculas: "ſ" → "S", "ı" → "I"). Só alarga a classificação.
const fold = (s) => String(s).toUpperCase().toLowerCase();
// Nome como um FS do Windows o enxerga (o mesmo arquivo): sem fluxo NTFS (":…") e sem
// ponto/espaço finais. Mantém a caixa (é usado para montar a chave do override).
const stripWin = (s) => String(s).replace(/:.*$/s, "").replace(/[. ]+$/, "");
// Segmento para CLASSIFICAR: o nome do Windows, com a caixa dobrada.
const canonSeg = (s) => fold(stripWin(s));
const lastSeg = (p) => p.slice(p.lastIndexOf("/") + 1);
// "~" e "~/…" viram o HOME, como o Claude Code faz antes de tocar o disco (o kernel não expande).
const expandHome = (p) => (p === "~" || p.startsWith("~/") || (sep === "\\" && p.startsWith("~\\"))
  ? (process.env.HOME || homedir()) + p.slice(1)
  : p);

// Rótulo de um arquivo da catraca a partir do caminho relativo (já em caixa baixa e canônico).
function classify(rel, layout) {
  const r = rel.split("/").filter(Boolean).map(canonSeg).filter(Boolean).join("/");
  if (layout.baselineRels.has(r)) return { kind: "baseline", rel: r };
  for (const d of layout.stdRels) {
    if (r === `${d}/machine` || r.startsWith(`${d}/machine/`)) return { kind: "machine", rel: r, dirRel: d };
    if (r.startsWith(`${d}/`) && !r.slice(d.length + 1).includes("/") && r.endsWith(".md")) return { kind: "std", rel: r, dirRel: d };
  }
  if (r === layout.shimRel) return { kind: "shim", rel: r };
  if (r === layout.localRel) return { kind: "local", rel: r };
  if (r === layout.cfgRel) return { kind: "cfg", rel: r };
  return null;
}

// Caminhos relativos da catraca. Fonte única: context-paths (+ baselineLogicalRel da T5/T7).
function layoutOf(root) {
  const cp = contextPaths(root);
  const relOf = (p) => fold(toPosix(relative(root, p)));
  const stdDirs = resolveReadPaths(root, "standards", { includeMissing: true });
  const stdRels = stdDirs.map(relOf);
  return {
    stdRels,
    stdDirByRel: new Map(stdDirs.map((d) => [relOf(d), d])),
    baselineRels: new Set([fold(toPosix(baselineLogicalRel(root))), ...stdRels.map((d) => `${d}/baseline.json`)]),
    shimRel: relOf(join(cp.root, "bin", "devflow-standards.mjs")),
    localRel: relOf(cp.standardsLocalYaml),
    cfgRel: relOf(join(cp.root, ".devflow.yaml")),
    cfgPath: join(cp.root, ".devflow.yaml"),
  };
}

// Âncoras: diretórios da catraca na forma lógica (como o loader os lê) e na física (realpath).
// Um arquivo sob a forma física de uma âncora é mapeado para o caminho lógico — é assim que o
// diretório de standards acessado por symlink (ou a raiz em /private no macOS, C12) cai no lugar.
function anchorsOf(root) {
  const cp = contextPaths(root);
  const list = [["", root], [".context", cp.root], [".context/engineering", cp.engineering],
    ...resolveReadPaths(root, "standards", { includeMissing: true }).map((d) => [toPosix(relative(root, d)), d]),
    [".context/bin", join(cp.root, "bin")]];
  return list.map(([rel, abs]) => {
    const forms = [toPosix(resolve(abs))];
    try { forms.push(toPosix(realPathOr(abs))); } catch { /* ciclo: só a forma lógica */ }
    return { rel, forms: uniq(forms.map((f) => fold(f).replace(/\/+$/, ""))) };
  });
}

// Caminhos relativos (caixa dobrada) de `file` (POSIX absoluto) sob cada âncora.
function relsUnder(file, anchors) {
  const lf = fold(file);
  const out = new Set();
  for (const a of anchors) for (const form of a.forms) {
    let rest = null;
    if (lf === form) rest = "";
    else if (lf.startsWith(`${form}/`)) rest = lf.slice(form.length + 1);
    if (rest === null) continue;
    out.add(a.rel ? (rest ? `${fold(a.rel)}/${rest}` : fold(a.rel)) : rest);
  }
  return out;
}

// Raízes candidatas: a do cwd da sessão e o prefixo antes de cada "/.context/" do caminho (o
// arquivo da catraca de OUTRO projeto continua sendo da catraca daquele projeto).
function candidateRoots(base, forms) {
  const roots = [];
  const r0 = findProjectRoot(base);
  if (r0) roots.push(r0);
  for (const f of forms) {
    const re = /\/\.context\//gi;
    let m;
    while ((m = re.exec(f))) roots.push(f.slice(0, m.index) || "/");
  }
  return uniq(roots);
}

// Primeiro componente symlink (abaixo da raiz) de `relParts`, ou null.
function symlinkUnder(root, relParts) {
  let cur = root;
  for (const part of relParts) {
    cur = join(cur, part);
    let st;
    try { st = lstatSync(cur); } catch { return null; }
    if (st.isSymbolicLink()) return toPosix(relative(root, cur));
  }
  return null;
}

// Arquivos da catraca que compartilham o inode do arquivo editado (hardlink criado antes, por
// fora do Edit/Write). Só roda com nlink > 1; varredura limitada.
function hardlinkAliases(realFile, roots) {
  let st;
  try { st = statSync(realFile); } catch { return []; }
  if (!st.isFile() || st.nlink < 2) return [];
  const out = [];
  let budget = MAX_SCAN;
  const same = (p) => {
    if (budget-- <= 0) return;
    try { const s = lstatSync(p); if (s.isFile() && s.ino === st.ino && s.dev === st.dev) out.push(toPosix(resolve(p))); } catch {}
  };
  const walk = (dir, depth) => {
    let names = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const n of names) {
      if (budget <= 0) return;
      const p = join(dir, n);
      let s;
      try { s = lstatSync(p); } catch { continue; }
      if (s.isFile()) same(p);
      else if (s.isDirectory() && depth > 0) walk(p, depth - 1);
    }
  };
  for (const root of roots) {
    const cp = contextPaths(root);
    for (const p of [cp.standardsLocalYaml, join(cp.root, ".devflow.yaml"), join(cp.root, "bin", "devflow-standards.mjs")]) same(p);
    for (const d of resolveReadPaths(root, "standards", { includeMissing: true })) walk(d, 4);
  }
  return out;
}

// Chaves do override para um std: o diretório LÓGICO do loader (C12) + o nome pedido, o nome
// como o Windows o vê e o nome real no disco quando o FS não distingue caixa.
function stdKeys(dirAbs, name) {
  const names = new Set([name, stripWin(name)]);
  const want = fold(stripWin(name));
  try { for (const n of readdirSync(dirAbs)) if (fold(n) === want) names.add(n); } catch { /* dir ainda não existe */ }
  return [...names].filter(Boolean).map((n) => join(dirAbs, n));
}

// ---------------------------------------------------------------------------------------------
// Decisão
// ---------------------------------------------------------------------------------------------

function pluginCmd() {
  let root = "<plugin>";
  try { root = trustedPluginRoot() || root; } catch { /* mantém o marcador */ }
  return `node "${inlineSafe(root, 240)}/scripts/devflow-standards.mjs"`;
}

function denyBaseline(rel) {
  return {
    decision: "deny",
    reason: `${TAG} O baseline (${inlineSafe(rel)}) é da autoridade humana (ADR-015 D6): o agente não o edita. ` +
      `Corrija a violação; se for legado legítimo, peça ao operador para registrar no terminal dele: ` +
      `${pluginCmd()} baseline accept <fp> --reason "<justificativa>".`,
  };
}

function listed(items) {
  const xs = uniq(items);
  const head = xs.slice(0, MAX_LISTED).map((x) => `- ${x}`);
  if (xs.length > MAX_LISTED) head.push(`- … e mais ${xs.length - MAX_LISTED}`);
  return head.join("\n");
}

/**
 * Decide sobre um evento PreToolUse. Nunca lança: erro interno cai no `lexicalFallback`
 * (baseline → deny; outro caminho da catraca → ask; resto → nada).
 * @returns {{decision: ""|"ask"|"deny", reason: string}}
 */
export function evaluateStandardsEdit(ev) {
  try {
    return evaluate(ev);
  } catch {
    return lexicalFallback(ev);
  }
}

function evaluate(ev) {
  const tool = String(ev?.tool_name || "");
  const ti = (ev && typeof ev.tool_input === "object" && ev.tool_input) || {};
  const raw = ti.file_path ?? ti.file ?? ti.path;
  if (typeof raw !== "string" || !raw) return NONE;
  const base = typeof ev.cwd === "string" && ev.cwd ? resolve(ev.cwd) : process.cwd();
  // Formas do mesmo pedido; QUALQUER uma que caia na catraca aplica o guard (rodadas 1 e 2).
  // O caminho vale com e sem trim() (a ferramenta faz trim; rodada 2). Para cada um:
  //   - lexFile: como o Claude Code — "~/" expandido e ".", ".." e "//" resolvidos pelo TEXTO;
  //   - realpath de lexFile — o arquivo que a ferramenta lê e grava de fato (o do caminho com
  //     trim é o `realFile`, de onde o estado atual é lido);
  //   - realPathOr sobre o caminho NÃO normalizado (o ".." depois de um symlink resolvido
  //     fisicamente, como o kernel faria se recebesse o caminho cru).
  const toolPath = raw.trim();
  const lexForms = [], physical = [];
  let realFile = null, loop = false;
  for (const cand of uniq([toolPath, raw].filter(Boolean))) {
    const path = expandHome(cand);
    const lex = resolve(base, path);
    const rawAbs = isAbsolute(path) ? path : (base.endsWith(sep) ? base + path : base + sep + path);
    lexForms.push(lex);
    try { const r = realPathOr(lex); physical.push(r); if (!realFile) realFile = r; } catch { loop = true; }
    try { physical.push(realPathOr(rawAbs)); } catch { loop = true; }
  }

  const forms = uniq([...lexForms.map(toPosix), ...uniq(physical).map(toPosix)]);
  let roots = candidateRoots(base, forms);
  const aliases = uniq(uniq(physical).flatMap((f) => hardlinkAliases(f, roots)));
  if (aliases.length) { forms.push(...aliases); roots = uniq([...roots, ...candidateRoots(base, aliases)]); }

  const targets = [];
  for (const root of roots) {
    const layout = layoutOf(root);
    const anchors = anchorsOf(root);
    for (const f of forms) {
      for (const rel of relsUnder(f, anchors)) {
        const c = classify(rel, layout);
        if (c) targets.push({ ...c, root, layout, name: lastSeg(f) });
      }
    }
  }

  const bl = targets.find((t) => t.kind === "baseline");
  if (bl) return denyBaseline(bl.rel);
  if (loop || !realFile) {
    return ask(`${TAG} Não foi possível resolver o caminho real de ${inlineSafe(toPosix(raw), 240)} (ciclo de link simbólico): a edição exige confirmação do operador.`);
  }
  if (!targets.length) return NONE;

  const reasons = [];
  if (targets.some((t) => t.kind === "machine" || t.kind === "shim")) {
    reasons.push(`${TAG} Alterar o linter de um standard (machine/) ou o shim .context/bin/devflow-standards.mjs muda o que a catraca verifica e exige confirmação do operador.`);
  }
  // T7: link simbólico em qualquer componente do caminho da catraca é enfraquecimento.
  for (const t of targets) {
    if (!["std", "machine", "local"].includes(t.kind)) continue;
    const canonical = t.dirRel === undefined || t.dirRel === t.layout.stdRels[0];
    const comp = t.kind === "local" ? symlinkUnder(t.root, [".context"])
      : canonical ? baselineSymlinkComponent(t.root)
      : symlinkUnder(t.root, t.dirRel.split("/"));
    if (comp) reasons.push(`${TAG} O caminho da catraca passa por link simbólico (${inlineSafe(comp)}): a edição exige confirmação do operador.`);
  }

  const sim = targets.filter((t) => t.kind === "std" || t.kind === "local" || t.kind === "cfg");
  if (sim.length) {
    // A ferramenta decide pela extensão do caminho que recebeu; o guard só trata como markdown
    // quando TODAS as formas do pedido (texto e realpath) terminam em .md/.mdx.
    const markdown = [...lexForms, ...physical].every((f) => /\.mdx?$/i.test(f));
    const r = proposalsFor(tool, ti, realFile, uniq(physical), markdown);
    if (r.reason) reasons.push(r.reason);
    else if (r.proposals.length) {
      const weak = simulate(sim, r.proposals);
      if (weak.error) reasons.push(`${TAG} Não foi possível simular o enforcement depois da edição (${inlineSafe(weak.error)}): a edição exige confirmação do operador.`);
      else if (weak.list.length) reasons.push(`${TAG} Esta edição enfraquece o enforcement e exige confirmação do operador (ADR-015 D6):\n${listed(weak.list)}`);
    }
  }
  return reasons.length ? ask(uniq(reasons).join("\n")) : NONE;
}

// Conteúdo(s) proposto(s) do arquivo da catraca, ou a razão do ask quando não dá para simular.
// O estado atual é lido pela forma que a ferramenta usa (`realFile`, do caminho normalizado como
// texto); `physical` traz também a forma do kernel, para a checagem de arquivo não regular.
// `markdown` diz se o Write fica sem a limpeza de espaço final (ver proposedWriteVariants).
function proposalsFor(tool, ti, realFile, physical, markdown = false) {
  const cant = (why) => ({ proposals: [], reason: `${TAG} ${why}: a edição de um arquivo da catraca exige confirmação do operador.` });
  const mixed = "Fim de linha misto (CRLF e LF no mesmo arquivo): a ferramenta regrava tudo com o fim de linha dos primeiros 4096 caracteres e o significado pode mudar";
  if (tool === "Write") {
    // FIFO/dispositivo no lugar do arquivo: não é o que o loader lê, e o resto do hook travaria.
    for (const f of physical) {
      try { if (!statSync(f).isFile()) return cant("O arquivo atual não é um arquivo regular"); } catch { /* não existe: criação */ }
    }
    if (typeof ti.content !== "string") return cant("Write sem conteúdo");
    if (hasMixedEol(ti.content)) return cant(mixed);
    return { proposals: proposedWriteVariants(ti.content, { markdown }) };
  }
  if (tool !== "Edit") return cant(`Ferramenta ${inlineSafe(tool) || "desconhecida"} não simulável`);
  const cur = readRegularFileDetailed(realFile, SAFE_READ_MAX_BYTES);
  if (!cur.ok) {
    if (cur.code !== "ENOENT") return cant(`O estado atual não pôde ser lido com segurança (${inlineSafe(cur.code)})`);
    // Inexistente: old_string vazio cria o arquivo (simula como Write, com as duas leituras do
    // new_string — como em proposedEditVariants, sem depender da extensão). Com old_string não
    // vazio não dá para decidir — a forma que a ferramenta lê pode não ser a que o guard leu.
    if (ti.old_string === "" && typeof ti.new_string === "string") return { proposals: proposedWriteVariants(ti.new_string) };
    return cant("O arquivo atual não existe pela forma normalizada do caminho e a edição não pode ser simulada");
  }
  if (hasMixedEol(cur.text)) return cant(mixed);
  const old = ti.old_string;
  if (typeof old !== "string" || old === "" || (!cur.text.includes(old) && !cur.text.split("\r\n").join("\n").includes(old))) {
    // Fechamento por padrão: o old_string não casa em nenhuma visão do texto atual (cru ou com
    // CRLF → LF). O Edit do Claude Code ainda pode casar por outra normalização (aspas,
    // desanitização): o guard não consegue afirmar que nada enfraquece.
    return cant("O old_string não casa com o arquivo atual (nem com CRLF normalizado) e a edição não pode ser simulada");
  }
  return { proposals: proposedEditVariants(cur.text, ti) };
}

// Enforcement efetivo antes × depois, com o mesmo parser do loader. Cada alvo (lógico, físico,
// nome alternativo) é um cenário: qualquer um que enfraqueça basta.
function simulate(sim, proposals) {
  const list = [];
  try {
    const trusted = trustedPluginRoot() ?? null; // null, nunca undefined: undefined reativa CLAUDE_PLUGIN_ROOT
    for (const root of uniq(sim.map((t) => t.root))) {
      const layout = sim.find((t) => t.root === root).layout;
      const ctxNow = { versions: readFrameworkVersionsFromPath(layout.cfgPath) };
      const before = effectiveEnforcement(loadStandardsMerged(root, trusted), ctxNow);
      for (const t of sim.filter((x) => x.root === root)) {
        for (const p of proposals) {
          const scenarios = t.kind === "std"
            ? stdKeys(layout.stdDirByRel.get(t.dirRel), t.name).map((k) => [{ files: new Map([[k, p]]) }, ctxNow])
            : t.kind === "local" ? [[{ localYaml: p }, ctxNow]]
            : [[{}, { versions: readFrameworkVersions(p) }]];
          for (const [ov, ctx] of scenarios) {
            list.push(...enforcementWeakenings(before, effectiveEnforcement(loadStandardsMerged(root, trusted, ov), ctx)));
          }
        }
      }
    }
  } catch (e) {
    return { list, error: e?.message || String(e) };
  }
  return { list };
}

// ---------------------------------------------------------------------------------------------
// Fallback sem disco (erro interno): só o texto do caminho
// ---------------------------------------------------------------------------------------------

const LEXICAL_LAYOUT = {
  stdRels: [".context/engineering/standards", ".context/standards"],
  baselineRels: new Set([".context/engineering/standards/baseline.json", ".context/standards/baseline.json"]),
  shimRel: ".context/bin/devflow-standards.mjs",
  localRel: ".context/standards.local.yaml",
  cfgRel: ".context/.devflow.yaml",
};

/** Classificação só pelo texto do caminho: baseline → deny; outro arquivo da catraca → ask. */
export function lexicalFallback(ev) {
  try {
    const ti = ev?.tool_input || {};
    const raw = ti.file_path ?? ti.file ?? ti.path;
    if (typeof raw !== "string" || !raw) return NONE;
    const segs = posix.normalize(toPosix(raw)).split("/").map(canonSeg);
    let hit = null;
    segs.forEach((s, i) => {
      if (s !== ".context") return;
      const c = classify(segs.slice(i).join("/"), LEXICAL_LAYOUT);
      if (c && (!hit || c.kind === "baseline")) hit = c;
    });
    if (!hit) return NONE;
    if (hit.kind === "baseline") return denyBaseline(hit.rel);
    return ask(`${TAG} Não foi possível avaliar a edição de ${inlineSafe(hit.rel)} (erro interno do guard): a edição de um arquivo da catraca exige confirmação do operador.`);
  } catch {
    return NONE;
  }
}

