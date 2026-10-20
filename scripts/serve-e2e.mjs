import { resolve, join } from 'node:path';
import { build, preview } from 'vite';

// Each run builds its own site so local production output and other runs stay independent.
const results = resolve(process.env.MAPLET_TEST_RUN_DIR ?? 'test-results/unmanaged/e2e');
const outDir = join(results, 'site');
await build({ build: { outDir } });
// The native-fetch contract runs this adapter directly inside each real browser.
await build({
  configFile: false,
  build: {
    outDir: join(outDir, 'test-modules'),
    lib: {
      entry: resolve('src/adapters/drive/client.ts'),
      formats: ['es'],
      fileName: 'drive-client',
    },
    minify: false,
  },
});
const server = await preview({
  build: { outDir },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
server.printUrls();
