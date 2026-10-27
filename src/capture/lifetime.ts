/** Also owns resources that arrive after a page was left during an await. */
export class CaptureLifetime {
  private resources: { dispose(): void }[] = [];
  cancelled = false;
  own<T extends { dispose(): void }>(resource: T): T {
    if (this.cancelled) { resource.dispose(); throw new Error('Capture cancelled'); }
    this.resources.push(resource); return resource;
  }
  assertActive() { if (this.cancelled) throw new Error('Capture cancelled'); }
  dispose() {
    if (this.cancelled) return;
    this.cancelled = true;
    for (const resource of this.resources.splice(0).reverse()) resource.dispose();
  }
}
