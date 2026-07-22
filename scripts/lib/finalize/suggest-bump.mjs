// finalize/suggest-bump.mjs — sugere o tipo de bump semver a partir dos conventional
// commits do range mergeado. É SUGESTÃO para o signpost de release (o humano confirma
// ao rodar `gh workflow run release.yml -f bump=<X>`); nunca dispara nada.
// Puro, zero-dep, nunca lança. Precedência: major > minor > patch.
// git é lido SÓ via execFileSync (argv), como os demais helpers de finalize/.
import { execFileSync } from "node:child_process";

const BREAKING_BANG = /^[a-z]+(\([^)]*\))?!:/i;      // feat!:  fix(scope)!:
const BREAKING_BODY = /\bBREAKING[ -]CHANGE\b/;       // "BREAKING CHANGE:" / "BREAKING-CHANGE:"
const FEAT = /^feat(\([^)]*\))?:/i;                    // feat:  feat(scope):

// Tiers de resolução da tag-base, do mais específico ao mais frouxo.
// `git describe` é ancestralidade-first: a última tag ALCANÇÁVEL a partir do HEAD —
// que é a semântica certa para "o último release nesta linha de história". Sem
// `--match`, porém, ele aceita qualquer tag no caminho (ex.: `cli-v3.2.0` num
// monorepo), truncando o range.
const TAG_TIERS = [
  { match: "v[0-9]*", source: "tag" },        // convenção do DevFlow (vX.Y.Z)
  { match: "[0-9]*", source: "tag" },         // cliente sem prefixo (X.Y.Z)
  { match: null, source: "tag-loose" },       // convenção exótica: qualquer tag
];

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

// Base do range de commits. NUNCA lança: cada tier é try/catch e o último degrau
// é literal. `origin/main` é só o último recurso (repo sem tag) — usá-lo como
// default fazia o helper responder sempre "patch" quando chamado depois do merge,
// porque aí `origin/main..HEAD` já está vazio.
export function resolveBase(cwd = ".") {
  for (const tier of TAG_TIERS) {
    try {
      const args = ["describe", "--tags", "--abbrev=0"];
      if (tier.match) args.push("--match", tier.match);
      const tag = git(cwd, args).trim();
      if (tag) return { base: tag, source: tier.source };
    } catch {
      // Nenhuma tag casa neste tier — tenta o próximo.
    }
  }
  return { base: "origin/main", source: "fallback" };
}

// messages: array de mensagens de commit (primeira linha = subject; corpo opcional).
export function suggestBump(messages) {
  const list = Array.isArray(messages) ? messages : [];
  let sawFeat = false;
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const msg = raw;
    const subject = msg.split("\n", 1)[0].trim();
    if (BREAKING_BANG.test(subject) || BREAKING_BODY.test(msg)) return "major";
    if (FEAT.test(subject)) sawFeat = true;
  }
  return sawFeat ? "minor" : "patch";
}

function main(argv) {
  // Uso: node suggest-bump.mjs [baseRef]   (default: última tag de release)
  // Lê as mensagens de commit do range baseRef..HEAD e imprime o bump sugerido.
  // Fallback silencioso p/ patch — nunca quebra o chamador (o signpost). Sem shell -c.
  const cwd = ".";
  const explicit = argv[0];
  const { base, source } = explicit
    ? { base: explicit, source: "explicit" }
    : resolveBase(cwd);

  let messages = [];
  let rangeOk = true;
  try {
    // %x00 separa mensagens completas (subject+body); %B traz o corpo p/ BREAKING CHANGE.
    const out = git(cwd, ["log", "--format=%B%x00", `${base}..HEAD`]);
    messages = out.split("\0").map(s => s.trim()).filter(Boolean);
  } catch {
    rangeOk = false; /* git ausente/range inválido → patch */
  }

  const bump = suggestBump(messages);
  // Procedência no stderr: o stdout é contrato ($(…) no Step 8.1 da
  // prevc-confirmation). Um range de 0 commits fica visível em vez de silencioso.
  process.stderr.write(
    rangeOk
      ? `suggest-bump: base=${base} (source=${source}, ${messages.length} commits)\n`
      : `suggest-bump: base=${base} (source=${source}, range indisponível → ${bump})\n`
  );
  process.stdout.write(bump);
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
