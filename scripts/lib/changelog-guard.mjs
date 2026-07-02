// scripts/lib/changelog-guard.mjs
// Guard de release (fail-loud, irmão do version-guard): exige que o CHANGELOG
// tenha uma seção "## [X.Y.Z]" NÃO-VAZIA para a versão sendo lançada. Chamado
// pelo version-guard quando ele detecta um bump (transição != none). Reusa
// extractSection do changelog-extract. Puro + zero-dep.
import { extractSection } from "./changelog-extract.mjs";

export function checkReleaseChangelog(text, version) {
  const sec = extractSection(String(text), version); // null | "" | corpo (trimado)
  if (sec == null) {
    return { ok: false, reason: `sem seção "## [${version}]" no CHANGELOG` };
  }
  if (sec.length === 0) {
    return { ok: false, reason: `seção "## [${version}]" existe mas está vazia — documente as mudanças` };
  }
  return { ok: true, reason: `seção "## [${version}]" presente e não-vazia` };
}
