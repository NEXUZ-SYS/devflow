// tests/helpers/workflow-yaml.mjs — leitura mínima dos assets de CI nos testes.
//
// Não é um parser de YAML: entende só a forma dos assets do plugin (mapas e listas em bloco,
// escalar de bloco `|`), o bastante para extrair gatilhos, permissões, passos e os scripts que
// o runner executa de verdade. Um asset fora dessa forma faz o teste falhar, não passar calado.

const indentOf = (l) => l.match(/^(\s*)/)[1].length;
const isBlank = (l) => l.trim() === "";
const isComment = (l) => /^\s*#/.test(l);
const unquote = (v) => v.replace(/\s+#.*$/, "").trim().replace(/^(["'])(.*)\1$/, "$2");

/** O texto sem as linhas que são só comentário: o COMPORTAMENTO do arquivo, não a prosa. */
export const stripComments = (yml) => yml.split("\n").filter(l => !isComment(l)).join("\n");

/** Tira a indentação comum, como o YAML faz com um escalar de bloco. */
function dedent(lines) {
  const real = lines.filter(l => !isBlank(l));
  if (!real.length) return lines;
  const min = Math.min(...real.map(indentOf));
  return lines.map(l => l.slice(min));
}

/** Linhas filhas da chave `key` que está no nível `indent` (sem comentários), ou null. */
export function childLines(yml, key, indent = 0) {
  const lines = stripComments(yml).split("\n");
  const start = lines.findIndex(l => indentOf(l) === indent && l.slice(indent).startsWith(`${key}:`));
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (isBlank(lines[i])) continue;
    if (indentOf(lines[i]) <= indent) break;
    out.push(lines[i]);
  }
  return out;
}

/** Gatilhos do workflow: `{evento: [tipos]}`, na forma `evento:` + `types: [a, b]`. */
export function triggers(yml) {
  const lines = childLines(yml, "on");
  if (!lines) throw new Error("workflow sem bloco `on:`");
  const out = {};
  let cur = null;
  for (const l of lines) {
    const ev = l.match(/^ {2}([a-z_]+):\s*$/);
    if (ev) { cur = ev[1]; out[cur] = []; continue; }
    const ty = l.match(/^ {4}types:\s*\[(.*)\]\s*$/);
    if (ty && cur) { out[cur] = ty[1].split(",").map(s => s.trim()).filter(Boolean); continue; }
    throw new Error(`linha inesperada no bloco on: ${JSON.stringify(l)}`);
  }
  return out;
}

/** Mapa simples `chave: valor` filho de `key` no nível `indent`. */
export function mapOf(yml, key, indent = 0) {
  const lines = childLines(yml, key, indent);
  if (!lines) return null;
  const out = {};
  for (const l of lines) {
    const m = l.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) throw new Error(`linha inesperada em ${key}: ${JSON.stringify(l)}`);
    out[m[1]] = unquote(m[2]);
  }
  return out;
}

// Um passo: as chaves diretas (`name`, `id`, `uses`, `working-directory`…), os mapas `env` e
// `with`, e o `run` já dedentado — o script que o runner recebe.
function readStep(lines, at) {
  const step = { env: {}, with: {} };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (isBlank(l) || isComment(l) || indentOf(l) !== at) continue;
    const m = l.slice(at).match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (!m) throw new Error(`linha inesperada num passo: ${JSON.stringify(l)}`);
    const [, key, value] = m;
    const body = [];
    for (let j = i + 1; j < lines.length && (isBlank(lines[j]) || indentOf(lines[j]) > at); j++) body.push(lines[j]);
    if (key === "env" || key === "with") {
      for (const b of body) {
        if (isBlank(b) || isComment(b)) continue;
        const kv = b.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!kv) throw new Error(`linha inesperada em ${key}: ${JSON.stringify(b)}`);
        step[key][kv[1]] = unquote(kv[2]);
      }
    } else if (key === "run") {
      if (!/^[|>][-+]?$/.test(value.trim())) step.run = value;
      else {
        while (body.length && isBlank(body[body.length - 1])) body.pop();
        step.run = dedent(body).join("\n") + "\n";
      }
    } else step[key] = unquote(value);
  }
  return step;
}

/** Passos do job `job` de um workflow do GitHub Actions. */
export function steps(yml, job) {
  const lines = yml.split("\n");
  const jobAt = lines.findIndex(l => l === `  ${job}:`);
  if (jobAt < 0) throw new Error(`job ${job} não encontrado`);
  const stepsAt = lines.findIndex((l, i) => i > jobAt && /^ {4}steps:\s*$/.test(l));
  if (stepsAt < 0) throw new Error(`job ${job} sem steps`);
  const out = [];
  let cur = null;
  for (let i = stepsAt + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!isBlank(l) && !isComment(l) && indentOf(l) < 6) break;
    if (/^ {6}- /.test(l)) { cur = [`        ${l.slice(8)}`]; out.push(cur); }
    else if (cur) cur.push(l);
  }
  return out.map(s => readStep(s, 8));
}

/** O script (escalar de bloco `- |`) do `script:` de um job do GitLab CI, dedentado. */
export function gitlabScript(yml, job) {
  const lines = yml.split("\n");
  const jobAt = lines.findIndex(l => l === `${job}:`);
  if (jobAt < 0) throw new Error(`job ${job} não encontrado`);
  const scriptAt = lines.findIndex((l, i) => i > jobAt && /^ {2}script:\s*$/.test(l));
  if (scriptAt < 0 || !/^ {4}- \|\s*$/.test(lines[scriptAt + 1] || "")) throw new Error(`job ${job}: esperado script: com um único bloco "- |"`);
  const body = [];
  for (let i = scriptAt + 2; i < lines.length && (isBlank(lines[i]) || indentOf(lines[i]) > 4); i++) body.push(lines[i]);
  while (body.length && isBlank(body[body.length - 1])) body.pop();
  return dedent(body).join("\n") + "\n";
}

/** Troca cada `${{ contexto }}` pelo valor de `ctx`; contexto não previsto é erro do teste. */
export function expand(text, ctx) {
  return String(text).replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => {
    if (!(k in ctx)) throw new Error(`contexto não previsto no teste: ${k}`);
    return String(ctx[k]);
  });
}
