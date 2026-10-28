// An exact, unique opt-in. Unknown/duplicate values retain the default game.
export function movementCandidateEnabled(search: string): boolean {
  const values = new URLSearchParams(search).getAll('gameplay');
  return values.length === 1 && values[0] === 'movement-v2';
}
