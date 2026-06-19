// Cálculo de ondas (waves) a partir do DAG de dependências entre stories.
// Puro e determinístico — sem I/O.

/** Deps de uma story, filtradas para ids que existem no conjunto. */
function realDeps(story, ids) {
  return (story.depends_on || []).filter((d) => ids.has(d));
}

/**
 * Agrupa stories em ondas por nível topológico.
 * Onda 0 = sem dependências; onda N = todas as deps em ondas anteriores.
 * Lança Error se houver ciclo. Deps para ids inexistentes são ignoradas.
 */
export function computeWaves(stories) {
  const ids = new Set(stories.map((s) => s.id));
  const waves = [];
  const done = new Set();
  while (done.size < stories.length) {
    const wave = stories
      .filter((s) => !done.has(s.id) && realDeps(s, ids).every((d) => done.has(d)))
      .map((s) => s.id);
    if (wave.length === 0) {
      const restantes = stories.filter((s) => !done.has(s.id)).map((s) => s.id);
      throw new Error(`Ciclo de dependências detectado entre: ${restantes.join(", ")}`);
    }
    waves.push(wave);
    wave.forEach((id) => done.add(id));
  }
  return waves;
}

/**
 * Stories prontas para despachar agora (pipeline + cap de largura).
 * Pronta = não feita, não em voo, e todas as deps reais em doneIds.
 * Limita ao número de slots livres (maxWidth - inFlight).
 */
export function readyStories(stories, doneIds, inFlightIds, maxWidth = Infinity) {
  const ids = new Set(stories.map((s) => s.id));
  const done = new Set(doneIds);
  const inFlight = new Set(inFlightIds);
  const slots = maxWidth - inFlight.size;
  if (slots <= 0) return [];
  const ready = stories
    .filter(
      (s) =>
        !done.has(s.id) &&
        !inFlight.has(s.id) &&
        realDeps(s, ids).every((d) => done.has(d))
    )
    .map((s) => s.id);
  return ready.slice(0, slots);
}
