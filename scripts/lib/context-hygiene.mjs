// lib/context-hygiene.mjs — inventaria artefatos de processo e emite FATOS.
//
// A fronteira é deliberada (ADR-013): esta lib NUNCA decide se um plano foi
// entregue. Ela observa e reporta; o julgamento "a entrega existe no código?"
// é do agente, sobre evidência. `releasesAfter` é contagem bruta, não veredito —
// inferir abandono de data/inatividade é o que a ADR-014 proíbe.
//
// git só via execFileSync com argv — nunca shell, nunca string interpolada.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync, mkdirSync, readFileSync } from "node:fs";
import { join, relative, basename, resolve } from "node:path";
import { contextPaths } from "./context-paths.mjs";

// Convenção do superpowers (writing-plans/brainstorming), estável de 5.0.6 a
// 6.1.1 — não é path deste repo. Sob o trilho DevFlow o dir aparece por
// construção, porque prevc-planning sempre invoca superpowers:writing-plans.
const PLANS_DIR = "docs/superpowers/plans";
const SPECS_DIR = "docs/superpowers/specs";

// Distingue FALHA de VAZIO: null = comando falhou, "" = sucesso sem saída.
// Engolir a falha como "" faria `dirty` degradar para false — fail-open sobre
// WIP, exatamente o que a salvaguarda existe para impedir.
function gitRaw(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024, // o default de 1MiB estoura em monorepo (ENOBUFS)
    });
  } catch {
    return null;
  }
}

function git(cwd, args) {
  const out = gitRaw(cwd, args);
  return out === null ? null : out.trim();
}

// -z emite paths NUL-separated e sem C-quoting. Sem isso um plano acentuado
// ("configuração.md") volta escapado em octal, não casa a chave, e seria
// reportado como "untracked" estando commitado — fato falso num plugin pt-BR/es-ES.
//
// Usa gitRaw (SEM trim): no `status --porcelain` a primeira coluna é significativa
// e um arquivo modificado-não-staged sai como " M path". Aparar a string comeria
// esse espaço e o slice(3) cortaria um byte do path — o arquivo sujo passaria
// despercebido no scan (fail-open). Achado por teste, não por leitura.
function gitZ(cwd, args) {
  const out = gitRaw(cwd, [...args, "-z"]);
  if (out === null) return null;
  return out.split("\0").filter(Boolean);
}

// Não-recursivo por design: `archive/` é subdiretório, logo não é re-escaneado.
// statSync lança em symlink pendurado ou em arquivo removido durante a varredura —
// o CLI degrada por entrada, nunca morre com stack trace.
function listMd(dir) {
  if (!existsSync(dir)) return [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => {
      if (!f.endsWith(".md")) return false;
      try {
        return statSync(join(dir, f)).isFile();
      } catch {
        return false;
      }
    })
    .map((f) => join(dir, f));
}

// O sufixo -design só é removido de SPECS. Removê-lo sempre faria um plano
// "token-design.md" parear com a spec "token-design-design.md".
const slugOf = (p, isSpec) => {
  const base = basename(p, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "");
  return isSpec ? base.replace(/-design$/, "") : base;
};

// Plano vinculado ao workflow ativo. Degrada para null em qualquer erro —
// nunca lança, nunca bloqueia o scan.
function readActivePlanPath(root) {
  for (const p of ["runtime/workflows/prevc.json", "workflow/prevc.json"]) {
    try {
      const j = JSON.parse(readFileSync(join(root, ".context", p), "utf8"));
      const plan = j?.plan?.sources?.plan ?? j?.activePlanPath;
      if (typeof plan === "string" && plan) return plan;
    } catch {
      /* segue para o próximo candidato */
    }
  }
  return null;
}

export function scanArtifacts(cwd = ".") {
  // ÂNCORA: tudo se mede da raiz. `ls-files` é relativo ao cwd e
  // `status --porcelain` é relativo à raiz — fora da raiz as chaves não batem e
  // `dirty` vira false para arquivo COM WIP (fail-open provado na fase R).
  const root = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (root === null) {
    return { artifacts: [], scannedDirs: [], root: null, error: "não é um repositório git" };
  }

  const trackedList = gitZ(root, ["ls-files", "--full-name"]);
  const statusList = gitZ(root, ["status", "--porcelain"]);
  // Falha de qualquer um dos dois ABORTA. Prosseguir com conjunto vazio diria
  // "nada está sujo" — o fail-open que esta salvaguarda existe para evitar.
  if (trackedList === null || statusList === null) {
    return {
      artifacts: [],
      scannedDirs: [],
      root,
      error: "git ls-files/status falhou — nada é movível",
    };
  }

  const tracked = new Set(trackedList);
  const dirty = new Set(
    statusList
      .filter((l) => !l.startsWith("??")) // untracked não é "modificado"
      .map((l) => l.slice(3))
      .flatMap((p) => p.split(" -> ")) // rename staged: R old -> new
      .filter(Boolean),
  );

  const rel = (abs) => relative(root, abs);

  // README/INDEX não é artefato de processo — arquivar o índice do próprio
  // diretório seria absurdo. Candidato exige prefixo de data.
  const isPlanFile = (f) => /^\d{4}-\d{2}-\d{2}-/.test(basename(f));
  const planFiles = listMd(join(root, PLANS_DIR)).filter(isPlanFile);
  const specFiles = listMd(join(root, SPECS_DIR));
  const specSlugs = new Set(specFiles.map((s) => slugOf(s, true)));
  const planSlugs = new Set(planFiles.map((p) => slugOf(p, false)));

  // ADR-006: o território dotcontext vem da lib canônica, nunca hardcode.
  // A própria lib marca estas chaves como "dotcontext-managed (INTOCADOS)".
  const cp = contextPaths(root);
  const trackingFiles = listMd(cp.plans).filter((f) => basename(f) !== "README.md");
  const trackingSlugs = new Set(trackingFiles.map((f) => slugOf(f, false)));

  const tagLines = git(root, ["tag", "-l", "--format=%(refname:short)|%(creatordate:unix)"]) ?? "";
  const tags = tagLines
    .split("\n")
    .filter(Boolean)
    .map((l) => Number(l.split("|")[1]));

  // O plano do workflow ATIVO nunca é movível: arquivá-lo no meio do próprio
  // workflow quebraria o ponteiro de retomada do SessionStart.
  const activePlan = readActivePlanPath(root);

  const describe = (abs, category) => {
    const r = rel(abs);
    const isTracked = tracked.has(r);
    const isDirty = dirty.has(r);
    const shaLine = git(root, ["log", "-1", "--format=%H|%ct", "--", r]);
    const [sha, ts] = shaLine ? shaLine.split("|") : [null, null];
    const lastCommit = sha ? { sha, date: new Date(Number(ts) * 1000).toISOString() } : null;
    const releasesAfter = ts ? tags.filter((t) => t > Number(ts)).length : 0;

    let movable = false;
    let reason = null;
    if (category === "B") reason = "ADR-006: território dotcontext — nunca movido";
    else if (category !== "A") reason = `categoria ${category} — só diagnóstico`;
    else if (activePlan && r === activePlan) reason = "plano do workflow ativo";
    else if (!isTracked) reason = "untracked — o git não protege este arquivo";
    else if (isDirty) reason = "dirty — há modificação não-commitada";
    else movable = true;

    return {
      path: r,
      category,
      tracked: isTracked,
      dirty: isDirty,
      // Só fazem sentido para planos: numa spec, hasSpec se compararia consigo
      // mesma e seria sempre true — fato sem significado.
      hasSpec: category === "A" ? specSlugs.has(slugOf(abs, false)) : null,
      hasTracking: category === "A" ? trackingSlugs.has(slugOf(abs, false)) : null,
      lastCommit,
      releasesAfter,
      movable,
      reason,
    };
  };

  const artifacts = [];
  for (const p of planFiles) artifacts.push(describe(p, "A"));
  for (const t of trackingFiles) artifacts.push(describe(t, "B"));
  for (const s of specFiles) if (!planSlugs.has(slugOf(s, true))) artifacts.push(describe(s, "C"));

  // PROCEDÊNCIA: sem isto, "achei nada porque está limpo" e "achei nada porque
  // procurei no lugar errado" produzem a mesma saída — o defeito que esta
  // ferramenta existe para combater.
  const scannedDirs = [
    { path: PLANS_DIR, exists: existsSync(join(root, PLANS_DIR)) },
    { path: SPECS_DIR, exists: existsSync(join(root, SPECS_DIR)) },
    { path: rel(cp.plans), exists: existsSync(cp.plans), readOnly: true },
  ];

  return { artifacts, scannedDirs, root, error: null };
}

export function archivePaths(cwd, paths) {
  const scan = scanArtifacts(cwd);
  if (scan.error) {
    return { moved: [], refused: paths.map((p) => ({ path: p, reason: scan.error })) };
  }

  const root = scan.root;
  const cp = contextPaths(root);
  const plansAbs = join(root, PLANS_DIR);
  const byPath = new Map(scan.artifacts.map((f) => [f.path, f]));
  const moved = [];
  const refused = [];
  const seen = new Set();

  for (const p of paths) {
    // Sem dedup, o 2º path idêntico "recusa" com a mensagem errada de destino
    // existente — descrevendo como conflito o arquivo que ele mesmo moveu.
    if (seen.has(p)) {
      refused.push({ path: p, reason: "path duplicado na mesma invocação" });
      continue;
    }
    seen.add(p);

    // Guard 1 — território dotcontext, EXPLÍCITO e antes de tudo. Não depender do
    // inventário: hoje ele protege por não enumerar, mas no dia em que alguém
    // ampliar o listMd a proteção evaporaria em silêncio.
    const abs = resolve(root, p);
    if (abs === cp.root || abs.startsWith(cp.root + "/")) {
      refused.push({ path: p, reason: "ADR-006: território dotcontext — nunca movido" });
      continue;
    }

    // Guard 2 — containment: o alvo tem de estar sob o dir de planos, sempre.
    if (!abs.startsWith(plansAbs + "/")) {
      refused.push({ path: p, reason: `fora de ${PLANS_DIR} — recusado` });
      continue;
    }

    // Guard 3 — allowlist por igualdade exata contra o inventário do scan.
    const f = byPath.get(p);
    if (!f) {
      refused.push({ path: p, reason: "não encontrado no inventário" });
      continue;
    }
    if (!f.movable) {
      refused.push({ path: p, reason: f.reason });
      continue;
    }

    // Guard 4 — reconfere a sujeira IMEDIATAMENTE antes de mover, fechando a
    // janela TOCTOU entre o scan e este mv (um editor salvando durante o laço).
    const nowDirty = git(root, ["status", "--porcelain", "--", p]);
    if (nowDirty === null || nowDirty !== "") {
      refused.push({ path: p, reason: "ficou sujo entre o scan e o mv — recusado" });
      continue;
    }

    const dest = join(PLANS_DIR, "archive", basename(p));
    if (existsSync(join(root, dest))) {
      refused.push({
        path: p,
        reason: `destino já existe: ${dest} — preservado, nada sobrescrito`,
      });
      continue;
    }

    mkdirSync(join(root, PLANS_DIR, "archive"), { recursive: true });
    try {
      // --end-of-options: hoje o prefixo do diretório impede que p comece com
      // "-", mas a proteção seria incidental. Este repo já pagou o preço de uma
      // base "--output=" fazendo o git ESCREVER arquivo. Defesa explícita.
      execFileSync("git", ["-C", root, "mv", "--end-of-options", p, dest], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      moved.push({ path: p, dest });
    } catch (e) {
      refused.push({ path: p, reason: `git mv falhou: ${String(e.stderr || e.message).trim()}` });
    }
  }

  return { moved, refused };
}
