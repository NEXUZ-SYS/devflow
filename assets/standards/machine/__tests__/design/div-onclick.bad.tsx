// Regressao: div onClick sem role AINDA viola (regra JSX preservada)
export function Save({ handler }) {
  return <div onClick={handler}>Save</div>;
}
