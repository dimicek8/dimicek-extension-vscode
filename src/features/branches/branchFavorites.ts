import type { Memento } from 'vscode';

const DEFAULT_FAVORITES = ['refs/heads/main', 'refs/heads/master'];

export class BranchFavorites {
  constructor(private readonly storage: Memento) {}

  private key(root: string): string {
    return `dimicek.favoriteBranches:${root}`;
  }

  get(root: string): Set<string> {
    return new Set(this.storage.get<string[]>(this.key(root), DEFAULT_FAVORITES));
  }

  async toggle(root: string, fullName: string): Promise<boolean> {
    const favorites = this.get(root);
    const favorite = !favorites.delete(fullName);
    if (favorite) {
      favorites.add(fullName);
    }
    await this.storage.update(this.key(root), [...favorites].sort());
    return favorite;
  }
}
