import * as vscode from 'vscode';

export const QUIET_SCM_SETTING = 'dimicek.quietBuiltInSourceControl';

const QUIET_VALUES: ReadonlyArray<readonly [string, unknown]> = [
  ['scm.countBadge', 'off'],
  ['git.enableStatusBarSync', false],
];

export class BuiltInSourceControl implements vscode.Disposable {
  private readonly subscription: vscode.Disposable;

  constructor() {
    this.subscription = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(QUIET_SCM_SETTING)) {
        void this.apply(true);
      }
    });
  }

  private get quiet(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>(QUIET_SCM_SETTING, false);
  }

  async initialize(): Promise<void> {
    if (this.quiet) {
      await this.apply(false);
    }
  }

  async apply(announce: boolean): Promise<void> {
    const configuration = vscode.workspace.getConfiguration();
    const quiet = this.quiet;
    for (const [key, value] of QUIET_VALUES) {
      const current = configuration.inspect(key)?.globalValue;
      if (quiet && current !== value) {
        await configuration.update(key, value, vscode.ConfigurationTarget.Global);
      } else if (!quiet && current === value) {
        await configuration.update(key, undefined, vscode.ConfigurationTarget.Global);
      }
    }
    if (announce && quiet) {
      void vscode.window.showInformationMessage(
        'The built-in Source Control badge and sync button are turned off. To hide its icon, right-click it in the Activity Bar and choose "Hide". To hide its branch in the status bar, right-click the status bar and uncheck "Source Control".',
      );
    }
  }

  dispose(): void {
    this.subscription.dispose();
  }
}
