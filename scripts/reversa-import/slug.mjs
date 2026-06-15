// scripts/reversa-import/slug.mjs
// Slug seguro e único para todo o importador. Neutraliza path traversal a partir
// de input de terceiro (basename de dir, título de decisão): só [a-z0-9-].
export function toSlug(input) {
  const s = String(input)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // tira acentos
    .replace(/^\d+-/, "")        // prefixo NNN- (ondas Reversa)
    .replace(/[^a-z0-9]+/g, "-") // tudo que não é alfanum vira hífen (mata ../, /, .)
    .replace(/^-+|-+$/g, "")     // trim de hífens
    .replace(/^\d+/, "")         // não pode começar com dígito
    .replace(/^-+/, "")
    .slice(0, 60);
  return s || "imported";
}
