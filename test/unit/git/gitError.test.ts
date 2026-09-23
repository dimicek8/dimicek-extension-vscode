import { describe, expect, it } from 'vitest';
import { classifyGitError } from '../../../src/git/gitError';

describe('classifyGitError', () => {
  it.each([
    ['fatal: not a git repository (or any of the parent directories): .git', 'NotARepository'],
    [
      "fatal: Unable to create '/repo/.git/index.lock': File exists.\n\nAnother git process seems to be running",
      'RepositoryLocked',
    ],
    [
      'error: Your local changes to the following files would be overwritten by checkout:\n\ta.txt\nPlease commit your changes or stash them before you switch branches.',
      'LocalChangesOverwritten',
    ],
    [
      'CONFLICT (content): Merge conflict in a.txt\nAutomatic merge failed; fix conflicts and then commit the result.',
      'Conflict',
    ],
    [
      " ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs to 'origin'",
      'PushRejected',
    ],
    [
      "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
      'AuthenticationFailed',
    ],
    ['git@github.com: Permission denied (publickey).', 'AuthenticationFailed'],
    ['fatal: something unexpected', 'Unknown'],
  ])('%s → %s', (stderr, code) => {
    expect(classifyGitError(stderr)).toBe(code);
  });
});
