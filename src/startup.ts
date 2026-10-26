export interface StartupView {
  slow(): void;
  failed(error: unknown): void;
  finished(): void;
}

// Slow networks are not failures. Reload is a real page navigation, never a second Game.
export async function loadClient(load: () => Promise<unknown>, view: StartupView) {
  const timer = setTimeout(() => view.slow(), 12_000);
  try {
    await load();
    view.finished();
  } catch (error) {
    view.failed(error);
  } finally {
    clearTimeout(timer);
  }
}
