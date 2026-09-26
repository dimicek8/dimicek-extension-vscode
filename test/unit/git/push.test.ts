import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findGit, Git } from '../../../src/git/gitExec';
import { Repository } from '../../../src/git/repository';
import { createHistoryRepo, type HistoryRepo } from '../../fixtures/testRepo';

describe('Repository push', () => {
  let fixture: HistoryRepo;
  let repository: Repository;

  beforeEach(async () => {
    fixture = createHistoryRepo();
    repository = new Repository(fixture.repo.root, new Git(await findGit([])));
  });

  afterEach(() => fixture?.repo.dispose());

  const git = (...args: string[]) => fixture.repo.git(...args);
  const subjects = (commits: { subject: string }[]) => commits.map((commit) => commit.subject);

  it('lists commits that are not on the remote branch yet', async () => {
    expect(subjects(await repository.getOutgoingCommits('main', 'origin', 'main'))).toEqual([
      'Local change',
    ]);
  });

  it('lists commits of a new branch that are not on any remote', async () => {
    git('switch', '--quiet', '--create', 'topic');
    fixture.repo.commit('Topic one');
    fixture.repo.commit('Topic two');
    expect(subjects(await repository.getOutgoingCommits('topic', 'origin', 'topic'))).toEqual([
      'Topic two',
      'Topic one',
      'Local change',
    ]);
  });

  it('pushes to a chosen remote branch and sets the upstream', async () => {
    git('switch', '--quiet', '--create', 'topic');
    fixture.repo.commit('Topic one');
    await repository.pushBranch({
      branch: 'topic',
      remote: 'origin',
      remoteBranch: 'feature/topic',
      setUpstream: true,
    });
    expect(git('rev-parse', '--abbrev-ref', 'topic@{upstream}')).toBe('origin/feature/topic');
    expect(await repository.getOutgoingCommits('topic', 'origin', 'feature/topic')).toEqual([]);
  });

  it('is rejected when the remote has new commits unless forced with lease', async () => {
    await expect(
      repository.pushBranch({ branch: 'main', remote: 'origin', remoteBranch: 'main' }),
    ).rejects.toMatchObject({ code: 'PushRejected' });

    await repository.pushBranch({
      branch: 'main',
      remote: 'origin',
      remoteBranch: 'main',
      force: true,
    });
    expect(git('rev-parse', 'origin/main')).toBe(fixture.commits.local);
  });

  it('pushes annotated tags that point into the pushed history', async () => {
    fixture.repo.commit('Tagged work');
    git('tag', '--annotate', '-m', 'Release', 'v2.0');
    git('switch', '--quiet', '--create', 'release');
    await repository.pushBranch({
      branch: 'release',
      remote: 'origin',
      remoteBranch: 'release',
      tags: true,
    });
    expect(git('ls-remote', '--tags', 'origin', 'v2.0')).toContain('refs/tags/v2.0');
  });
});

describe('Repository remote URLs', () => {
  it('reads the configured URL of every remote', async () => {
    const fixture = createHistoryRepo();
    try {
      const repository = new Repository(fixture.repo.root, new Git(await findGit([])));
      fixture.repo.git('remote', 'add', 'github', 'git@github.com:acme/app.git');
      const urls = await repository.getRemoteUrls();
      expect(urls.get('github')).toBe('git@github.com:acme/app.git');
      expect(urls.get('origin')).toMatch(/origin\.git$/);
    } finally {
      fixture.repo.dispose();
    }
  });
});
