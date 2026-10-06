// scripts/lib/standards-ratchet-bash.mjs — catraca de standards no Bash, NotebookEdit e MCP
// (ADR-015 D6, T17). Decisor do hook `pre-tool-use-ratchet`.
//
// HEURÍSTICO por desenho: lê o TEXTO da chamada, não o efeito dela. Pede `ask` quando o texto
// parece mexer na catraca; variável, base64, glob, aspas no meio do caminho ou script
// intermediário passam. A garantia é o `gate` do CI contra o merge-base (T18); aqui é atrito.
// A única decisão que sai daqui é `ask`: nunca `allow` (pularia o prompt de permissão) nem `deny`.
//
// Regras:
//   Bash         — `devflow-standards` seguido de `baseline`, `enforce` ou `eject` → ask;
//                  caminho da catraca (no comando, ou o cwd dentro de um diretório dela) junto de
//                  operação de escrita → ask; leitura → nada.
//   NotebookEdit — `notebook_path` em caminho da catraca → ask.
//   mcp__*       — chave de objeto citando a catraca, ou valor string CURTO e de UMA linha
//                  citando a catraca (cara de caminho ou de comando) → ask, a não ser que o nome
//                  da ferramenta seja claramente de leitura (ver isReadOnlyMcpTool). Prosa longa
//                  ou multilinha que só cita o caminho não pede ask.
import { inlineSafe } from "./untrusted-frame.mjs";

const TAG = "[devflow standards]";
const ADR = "(ADR-015 D6)";

// Marcadores do caminho rápido do hook: o bash só chama este módulo quando o evento cita um
// deles. É a MESMA expressão de `MARKERS` em hooks/pre-tool-use-ratchet (teste de paridade em
// tests/lib/test-standards-ratchet-bash.mjs). Tudo o que as regras abaixo exigem contém um
// marcador — senão o hook sairia calado antes de chegar aqui.
export const RATCHET_MARKERS = /baseline\.json|devflow-standards|standards\.local\.yaml|(?:engineering|\.context)[\\/]+standards/i;

const re = (source, flags = "i") => new RegExp(source, flags);
// Separador de caminho: uma ou mais barras de qualquer tipo ("/", "\" e "//").
const SEP = String.raw`[\\/]+`;
// Diretório de standards: depois dele não vem letra, dígito, "_" nem "-" — `engineering/standards-site`
// não é a catraca.
const DIR = String.raw`(?:engineering|\.context)${SEP}standards(?![A-Za-z0-9_-])`;
// Caminhos da catraca: os arquivos (baseline, lista local de disable, shim do projeto) e o
// diretório dos stds e dos linters (machine/).
const PATH_FILE = re(String.raw`baseline\.json|standards\.local\.yaml|\.context${SEP}bin${SEP}devflow-standards`);
const PATH_DIR = re(DIR);
/** Trecho de `text` que cita a catraca (o arquivo, se houver; senão o diretório), ou "". */
const citedPath = (text) => (PATH_FILE.exec(text) || PATH_DIR.exec(text))?.[0] ?? "";

// Todo laço de opções tem limite fixo: sem ele, `x --a=x --a=x …` faz cada início de casamento
// percorrer o resto do comando (48 s num comando de 1 MiB, medido). 8 opções cobrem o uso real.
const MAX_OPTS = "{0,8}";
// Opções `--x`, `--x=valor` e `--x="valor com espaço"` entre o CLI e o subcomando. As três
// formas do valor não se sobrepõem (sem retrocesso exponencial).
const CLI_FLAGS = String.raw`(?:\s+--[\w-]+(?:=(?:"[^"]*"|'[^']*'|[^\s"']*))?)${MAX_OPTS}`;
// O CLI chamado com um subcomando que altera a catraca. `eject` entra porque copia o default
// para o projeto com `enforcement.linter: null`, e o std do projeto vence o default de mesmo id.
const CLI_MUT = re(String.raw`devflow-standards(?:\.mjs)?["']?${CLI_FLAGS}\s+["']?(baseline|enforce|eject)\b`);

// Palavra que é o nome de um programa: não é opção (`--rm`), extensão (`x.rm`), pedaço de outra
// palavra, nem nome de arquivo (`install.sh`).
const B = String.raw`(?<![-.\w])`;
const A = String.raw`(?![-.\w])`;
// Resto do mesmo comando simples (não atravessa | ; & nem quebra de linha). O limite é fixo de
// propósito: sem ele, um comando de 1 MiB custaria tempo quadrático.
const SAME_CMD = String.raw`[^|;&\n]{0,200}?`;
const SHELL = String.raw`(?:ba|z|da|k)?sh`;
const PYTHON = String.raw`python[\d.]*`;
// Opções do próprio node antes do arquivo ou do código. Depois do(s) traço(s) vem um caractere de
// palavra: `--a` só tem uma leitura (com `--?[\w-]+` eram duas por opção, 2^8 por início).
const NODE_OPTS = String.raw`(?:\s+-{1,2}\w[\w-]*(?:=[^\s"']*)?)${MAX_OPTS}`;

// O CLI sendo EXECUTADO pelo node (`node [opções] <caminho>/devflow-standards.mjs`): o caminho
// do shim ali não é alvo de escrita. Sem isto, `node .context/bin/devflow-standards.mjs check
// --json > /tmp/x.json` — o comando que as mensagens mandam o agente rodar — pediria ask.
const CLI_RUN = re(String.raw`${B}node${NODE_OPTS}\s+["']?[^\s"'|;&<>()]*devflow-standards(?:\.mjs)?["']?`, "gi");
// "<nome@host>" (trailer Co-Authored-By de todo commit feito pelo agente) não é redirecionamento.
const MAIL = /<[^<>\s@]+@[^<>\s@]+>/g;

// Redirecionamento conta como escrita, menos a seta "->", a duplicação de descritor (">&",
// "2>&1") e o destino em /dev/null, /dev/stdout, /dev/stderr e /dev/tty.
const REDIRECT = /(?<![->])>{1,2}\|?(?![>&])(?!\s*["']?\/dev\/(?:null|stdout|stderr|tty)\b)/;

// Operações de escrita: [rótulo que vai na razão, expressão]. node e python só contam com código
// inline; shell, com -c; os três (e perl/ruby) também quando leem o script de um heredoc.
const WRITE_OPS = [
  [(m) => m[1].toLowerCase(), re(String.raw`${B}(tee|mv|cp|rm|ln|dd|truncate|install|chmod|chown|wget)${A}`)],
  ["sed -i", re(String.raw`${B}sed${A}${SAME_CMD}\s(?:-[A-Za-z]*i|--in-place)`)],
  ["perl -i", re(String.raw`${B}perl${A}${SAME_CMD}\s-[A-Za-z0-9]*i`)],
  [(m) => `git ${m[1].toLowerCase()}`, re(String.raw`${B}git(?:\s+(?:-[Cc]\s+\S+|--[\w-]+(?:=\S*)?|-[ABD-Zabd-z]\b))${MAX_OPTS}\s+(checkout|restore|rm|mv|reset|clean|apply|stash)${A}`)],
  ["find -delete", re(String.raw`\s-delete${A}`)],
  ["curl -o", re(String.raw`${B}curl${A}${SAME_CMD}\s(?:-[A-Za-z]*[oO]|--output|--remote-name)(?!\w)`)],
  ["node com código inline", re(String.raw`${B}node${NODE_OPTS}\s+(?:-e|--eval|-p|--print|-pe)${A}`)],
  ["python -c", re(String.raw`${B}${PYTHON}(?:\s+-[A-Za-z]+)${MAX_OPTS}?\s+-[A-Za-z]*c${A}`)],
  ["sh -c", re(String.raw`${B}${SHELL}(?:\s+-[A-Za-z]+)${MAX_OPTS}?\s+-[A-Za-z]*c${A}`)],
  ["interpretador lendo o script de um heredoc", re(String.raw`${B}(?:${PYTHON}|node|${SHELL}|perl|ruby)(?:\s+-[^\s<]*)${MAX_OPTS}\s*<<`)],
];

/** Rótulo da primeira operação de escrita que o comando cita, ou "". */
function writeOp(command) {
  if (REDIRECT.test(command.replace(MAIL, " "))) return "redirecionamento para arquivo";
  for (const [label, rx] of WRITE_OPS) {
    const m = rx.exec(command);
    if (m) return typeof label === "function" ? label(m) : label;
  }
  return "";
}

function decideBash(command, cwd) {
  const cli = CLI_MUT.exec(command);
  if (cli) return `O comando altera a catraca de standards (baseline/enforce/eject) e exige o operador. Casou: devflow-standards ${cli[1].toLowerCase()}.`;
  const target = citedPath(command.replace(CLI_RUN, " "));
  // cwd da sessão dentro de um diretório da catraca: o caminho relativo do comando é da catraca.
  if (!target && !PATH_DIR.test(cwd)) return "";
  const op = writeOp(command);
  if (!op) return "";
  const where = target ? inlineSafe(target, 60) : "diretório atual dentro da catraca";
  return `O comando parece escrever em arquivo da catraca de standards e exige o operador. Casou: ${op} + ${where}.`;
}

// Todas as strings de um valor JSON, como [texto, éChave], sem recursão (aninhamento fundo não
// estoura a pilha). Chave também é lida: `{ files: { "<caminho>": "<conteúdo>" } }`.
function* stringsOf(root) {
  const stack = [root];
  while (stack.length) {
    const v = stack.pop();
    if (typeof v === "string") yield [v, false];
    else if (v && typeof v === "object") {
      if (!Array.isArray(v)) for (const k of Object.keys(v)) yield [k, true];
      for (const x of Object.values(v)) stack.push(x);
    }
  }
}

// Verbos que dizem, pelo NOME, que a ferramenta só lê. Vale o primeiro ou o último termo do nome.
const READ_VERBS = new Set([
  "get", "list", "read", "search", "find", "fetch", "query", "view", "show", "describe", "status",
  "info", "stats", "count", "inspect", "lookup", "explore", "ls", "cat", "grep", "glob", "diff", "exists",
]);
// Qualquer um destes em qualquer posição desfaz a leitura (`get_or_create`, `search_and_replace`).
const WRITE_VERBS = new Set([
  "write", "create", "update", "delete", "remove", "edit", "put", "set", "patch", "post", "insert",
  "upsert", "append", "add", "replace", "move", "rename", "copy", "save", "store", "upload", "download",
  "import", "export", "execute", "exec", "run", "eval", "apply", "commit", "push", "merge", "send", "sync",
  "modify", "mutate", "drop", "truncate", "mkdir", "rm", "mv", "cp", "touch", "install", "deploy",
  "restore", "reset", "checkout", "clean", "revert", "init", "generate", "manage", "convert",
]);

/**
 * A ferramenta MCP é CLARAMENTE de leitura, a julgar pelo nome? `mcp__<servidor>__<ferramenta>`: a
 * parte da ferramenta é partida em termos (`_`, `-`, camelCase); é leitura quando o primeiro ou o
 * último termo é um verbo de leitura e nenhum termo é verbo de escrita. Heurística: o nome não
 * prova o que a ferramenta faz. Na dúvida (verbo de leitura no meio, nome sem verbo) → não é.
 */
export function isReadOnlyMcpTool(name) {
  const m = /^mcp__.+?__(.+)$/s.exec(String(name ?? ""));
  if (!m) return false;
  const terms = m[1].replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!terms.length || terms.some((t) => WRITE_VERBS.has(t))) return false;
  return READ_VERBS.has(terms[0]) || READ_VERBS.has(terms[terms.length - 1]);
}

// Valor de MCP com cara de caminho ou de comando: curto e de uma linha. Nota de plano, memória ou
// mensagem (prosa longa ou multilinha) que só cita a catraca não pede ask — o preço é a escrita
// MCP com o caminho embutido em texto longo passar sem ask local; quem pega é o gate do CI.
const MCP_VALUE_MAX = 300;
const looksLikePathOrCommand = (s) => s.length <= MCP_VALUE_MAX && !s.includes("\n");

function decideMcp(tool, input) {
  if (isReadOnlyMcpTool(tool)) return "";
  for (const [s, isKey] of stringsOf(input)) {
    if (!isKey && !looksLikePathOrCommand(s)) continue;
    const cli = CLI_MUT.exec(s);
    const hit = cli ? `devflow-standards ${cli[1].toLowerCase()}` : citedPath(s);
    if (hit) return `Ferramenta MCP citando arquivo da catraca de standards. Casou: ${inlineSafe(hit, 60)}.`;
  }
  return "";
}

/**
 * Razão do `ask` para um evento PreToolUse de Bash, NotebookEdit ou mcp__*; "" quando não há o
 * que perguntar. A razão é texto fixo mais o que casou (rótulo da operação e marcador do
 * caminho): nenhum outro trecho do comando entra nela.
 */
export function decideRatchet(ev) {
  if (!ev || typeof ev !== "object" || Array.isArray(ev)) return "";
  const tool = typeof ev.tool_name === "string" ? ev.tool_name : "";
  const input = ev.tool_input && typeof ev.tool_input === "object" ? ev.tool_input : {};
  const cwd = typeof ev.cwd === "string" ? ev.cwd : "";
  if (tool === "Bash") {
    // `command` fora do formato: vale o conjunto dos valores string do tool_input.
    const command = typeof input.command === "string" ? input.command : [...stringsOf(input)].map(([s]) => s).join("\n");
    return decideBash(command, cwd);
  }
  if (tool === "NotebookEdit") {
    return citedPath(String(input.notebook_path ?? "")) ? "Edição de notebook em caminho da catraca de standards." : "";
  }
  if (tool.startsWith("mcp__")) return decideMcp(tool, input);
  return "";
}

// O formato é fixo e a ordem das chaves também: o hook confere o prefixo antes de repassar.
const askJson = (why) => `${JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: `${TAG} ${inlineSafe(why, 540)} ${ADR}`,
  },
})}\n`;

/**
 * Saída do hook para o stdin recebido: UM JSON `ask` (uma linha) ou "". Nunca lança. Stdin que
 * não é JSON (cortado, corrompido) e cita a catraca → ask: na dúvida, com marcador à vista,
 * quem decide é o operador.
 */
export function ratchetOutput(input) {
  let text = "";
  try {
    text = Buffer.isBuffer(input) ? input.toString("utf8") : String(input ?? "");
    let ev;
    try {
      ev = JSON.parse(text);
    } catch {
      return RATCHET_MARKERS.test(text)
        ? askJson("O evento desta chamada não pôde ser lido e cita a catraca de standards: exige confirmação do operador.")
        : "";
    }
    const why = decideRatchet(ev);
    return why ? askJson(why) : "";
  } catch {
    try {
      return RATCHET_MARKERS.test(text)
        ? askJson("O guard da catraca falhou ao avaliar esta chamada, que cita a catraca de standards: exige confirmação do operador.")
        : "";
    } catch {
      return "";
    }
  }
}
