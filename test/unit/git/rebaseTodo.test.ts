import { describe, expect, it } from 'vitest';
import { buildRebaseTodo, validateRebaseEntries } from '../../../src/git/rebase/rebaseTodo';

describe('buildRebaseTodo', () => {
  it('writes git todo lines and turns rewords into an amend with a message file', () => {
    expect(
      buildRebaseTodo(
        [
          { hash: 'aaa', action: 'pick' },
          { hash: 'bbb', action: 'reword', message: 'New message' },
          { hash: 'ccc', action: 'squash' },
          { hash: 'ddd', action: 'fixup' },
          { hash: 'eee', action: 'drop' },
        ],
        (hash) => `C:\\Temp\\msg-${hash}.txt`,
      ),
    ).toBe(
      [
        'pick aaa',
        'pick bbb',
        'exec git commit --amend --quiet --allow-empty --no-verify --file "C:/Temp/msg-bbb.txt"',
        'squash ccc',
        'fixup ddd',
        'drop eee',
        '',
      ].join('\n'),
    );
  });
});

describe('validateRebaseEntries', () => {
  it('rejects squashing the first kept commit and empty rewords', () => {
    expect(
      validateRebaseEntries([
        { hash: 'a', action: 'drop' },
        { hash: 'b', action: 'squash' },
      ]),
    ).toMatch(/cannot be squashed/);
    expect(validateRebaseEntries([{ hash: 'a', action: 'reword', message: ' ' }])).toMatch(
      /Enter a message/,
    );
    expect(
      validateRebaseEntries([
        { hash: 'a', action: 'pick' },
        { hash: 'b', action: 'fixup' },
      ]),
    ).toBeUndefined();
  });
});
