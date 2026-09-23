import { defineConfig } from '@vscode/test-cli';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  launchArgs: [`--user-data-dir=${join(tmpdir(), 'dimicek-vscode-test')}`],
  mocha: {
    ui: 'bdd',
    timeout: 20000,
  },
});
