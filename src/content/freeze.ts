export type Frozen<T> = T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T;
// Content is shared by every simulation and the renderer; consumers must not mutate it.
export function freeze<T>(value: T): Frozen<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as Frozen<T>;
}
