/** Only the unparameterized home adopts the visually reviewed training build.
 * Explicit links, capture routes and unknown options keep their existing meaning.
 * ground-v1 remains opt-in: visual blind review does not approve movement.
 */
export const reviewedTrainingSearch = '?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&lighting=courtyard-light-v1';
export const legacySearch = '?gameplay=legacy-v1';
export const groundCandidateSearch = `${reviewedTrainingSearch}&feel=ground-v1`;
export function resolveHomeSearch(search: string): string {
  return search === '' || search === '?' ? reviewedTrainingSearch : search;
}
