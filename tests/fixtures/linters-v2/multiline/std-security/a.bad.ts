export function q(id: string) {
  return `SELECT * FROM users
    WHERE id = ${id}`;
}
