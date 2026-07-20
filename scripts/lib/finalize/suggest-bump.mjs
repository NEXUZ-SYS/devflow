// finalize/suggest-bump.mjs — sugere o tipo de bump semver a partir dos conventional
// commits do range mergeado. É SUGESTÃO para o signpost de release (o humano confirma
// ao rodar `gh workflow run release.yml -f bump=<X>`); nunca dispara nada.
// Puro, zero-dep, nunca lança. Precedência: major > minor > patch.

const BREAKING_BANG = /^[a-z]+(\([^)]*\))?!:/i;      // feat!:  fix(scope)!:
const BREAKING_BODY = /\bBREAKING[ -]CHANGE\b/;       // "BREAKING CHANGE:" / "BREAKING-CHANGE:"
const FEAT = /^feat(\([^)]*\))?:/i;                    // feat:  feat(scope):

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

async function main(argv) {
  // Uso: node suggest-bump.mjs [baseRef]   (default: origin/main)
  // Lê as mensagens de commit do range baseRef..HEAD e imprime o bump sugerido.
  // Fallback silencioso p/ patch — nunca quebra o chamador (o signpost). Sem shell -c.
  const base = argv[0] || "origin/main";
  let messages = [];
  try {
    const { execFileSync } = await import("node:child_process");
    // %x00 separa mensagens completas (subject+body); %B traz o corpo p/ BREAKING CHANGE.
    const out = execFileSync("git", ["log", "--format=%B%x00", `${base}..HEAD`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    messages = out.split("\0").map(s => s.trim()).filter(Boolean);
  } catch {
    /* git ausente/range inválido → patch */
  }
  process.stdout.write(suggestBump(messages));
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
