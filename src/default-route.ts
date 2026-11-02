/** Only the unparameterized home adopts the visually reviewed training build.
 * Superseded movement-v2 links return here; other explicit options keep their meaning.
 * ground-v1 remains opt-in: visual blind review does not approve movement.
 */
export const reviewedTrainingSearch = '?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&lighting=courtyard-light-v1';
export const legacySearch = '?gameplay=legacy-v1';
export const groundCandidateSearch = `${reviewedTrainingSearch}&feel=ground-v1`;
export function resolveHomeSearch(search: string): string {
  // The existing fixed tape exercises the exact home configuration, not another scene.
  if (search === '?smoke=ground-v1') return `${reviewedTrainingSearch}&smoke=ground-v1`;
  if (new URLSearchParams(search).getAll('gameplay').includes('movement-v2')) return reviewedTrainingSearch;
  return search === '' || search === '?' ? reviewedTrainingSearch : search;
}
