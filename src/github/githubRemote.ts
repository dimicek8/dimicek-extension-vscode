export interface GitHubRepoId {
  owner: string;
  repo: string;
}

const PATTERNS = [
  /^https?:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  /^(?:ssh:\/\/)?git@github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
];

export function parseGitHubRemote(url: string): GitHubRepoId | undefined {
  const trimmed = url.trim();
  for (const pattern of PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      return { owner: match[1]!, repo: match[2]! };
    }
  }
  return undefined;
}

export function sameRepo(a: GitHubRepoId, b: GitHubRepoId): boolean {
  return (
    a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase()
  );
}
