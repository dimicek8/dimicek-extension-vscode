import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const tests = process.argv.includes('--tests');

const watchMarkerPlugin = {
  name: 'watch-markers',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      }
      console.log('[watch] build finished');
    });
  },
};

const nodeOptions = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  external: ['vscode'],
  sourcesContent: false,
  logLevel: 'silent',
  plugins: [watchMarkerPlugin],
};

const extensionOptions = {
  ...nodeOptions,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  minify: production,
  sourcemap: !production,
};

const integrationTestOptions = {
  ...nodeOptions,
  entryPoints: ['test/integration/**/*.test.ts'],
  outbase: 'test/integration',
  outdir: 'out/test/integration',
  sourcemap: true,
};

async function main() {
  const ctx = await esbuild.context(tests ? integrationTestOptions : extensionOptions);
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
