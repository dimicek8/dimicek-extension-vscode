import type { FileChange } from './fileChanges';

export class Inclusion {
  private readonly included = new Set<string>();
  private known = new Set<string>();

  update(changes: readonly FileChange[]): void {
    const current = new Set(changes.map((change) => change.path));
    for (const change of changes) {
      if (!this.known.has(change.path) && change.kind !== 'unversioned') {
        this.included.add(change.path);
      }
    }
    for (const path of this.included) {
      if (!current.has(path)) {
        this.included.delete(path);
      }
    }
    this.known = current;
  }

  isIncluded(path: string): boolean {
    return this.included.has(path);
  }

  set(paths: Iterable<string>, included: boolean): void {
    for (const path of paths) {
      if (!this.known.has(path)) {
        continue;
      }
      if (included) {
        this.included.add(path);
      } else {
        this.included.delete(path);
      }
    }
  }

  includedChanges(changes: readonly FileChange[]): FileChange[] {
    return changes.filter((change) => this.included.has(change.path));
  }
}
