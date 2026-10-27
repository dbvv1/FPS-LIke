// Tiny boot-time gate: do not load capture/simulation dependencies on this path.
export const isCaptureRequest = (search: string) => new URLSearchParams(search).has('shot');
