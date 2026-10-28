// An exact, unique opt-in. Unknown/duplicate values retain the default game.
export function movementCandidateEnabled(search: string): boolean {
  const values = new URLSearchParams(search).getAll('gameplay');
  return values.length === 1 && values[0] === 'movement-v2';
}

export function offlineTrainingCandidateEnabled(search: string): boolean {
  const values = new URLSearchParams(search).getAll('gameplay');
  return values.length === 1 && values[0] === 'offline-training-v1';
}

// This frozen candidate does not contain the v13 character or capture clients.
export function validateOfflineTrainingOptions(search: string): void {
  const params = new URLSearchParams(search);
  if (params.has('shot') || params.has('contentSet')) {
    throw new Error('Offline training does not support shot or contentSet; remove those parameters.');
  }
}
