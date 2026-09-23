import { defineConfig } from '@vscode/test-cli';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  // The default user data dir inside the project can exceed the macOS
  // socket path limit (~104 chars) on CI, so keep it in the temp dir.
  launchArgs: [`--user-data-dir=${join(tmpdir(), 'dimicek-vscode-test')}`],
  mocha: {
    ui: 'bdd',
    timeout: 20000,
  },
});
