// DEVE violar: skipped-heading tambem em tsx (h1 -> h4)
export function Page() {
  return (
    <section>
      <h1>Alpha</h1>
      <h4>Beta</h4>
    </section>
  );
}
