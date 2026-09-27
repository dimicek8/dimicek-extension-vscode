import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Manifest {
  contributes: {
    commands: Array<{ command: string }>;
    keybindings: Array<{ command: string; when?: string }>;
    menus: Record<string, Array<{ command: string }>>;
    views: Record<string, Array<{ id: string }>>;
  };
}

const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as Manifest;
const commands = new Set(manifest.contributes.commands.map((command) => command.command));
const viewFocusCommands = new Set(
  Object.values(manifest.contributes.views)
    .flat()
    .map((view) => `${view.id}.focus`),
);
const known = (command: string) => commands.has(command) || viewFocusCommands.has(command);

describe('package.json', () => {
  it('only refers to contributed commands in menus and keybindings', () => {
    const referenced = [
      ...manifest.contributes.keybindings.map((binding) => binding.command),
      ...Object.values(manifest.contributes.menus)
        .flat()
        .map((item) => item.command),
    ];
    expect(referenced.filter((command) => !known(command))).toEqual([]);
  });

  it('enables IntelliJ shortcuts only through the setting', () => {
    const intellij = manifest.contributes.keybindings.filter((binding) =>
      binding.when?.includes('config.dimicek.keymap.intellij'),
    );
    expect(intellij.map((binding) => binding.command).sort()).toEqual([
      'dimicek.branches.newBranch',
      'dimicek.changes.focus',
      'dimicek.commit.show',
      'dimicek.log.show',
      'dimicek.push.show',
      'dimicek.update.project',
    ]);
    const global = manifest.contributes.keybindings.filter(
      (binding) => !binding.when?.includes('focusedView'),
    );
    expect(
      global.every((binding) => binding.when?.includes('config.dimicek.keymap.intellij')),
    ).toBe(true);
  });
});
