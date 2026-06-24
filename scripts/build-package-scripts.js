import fs from 'fs'
import path from 'path'
import { build } from 'esbuild'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const DIST_DIR = path.join(ROOT, 'dist')

fs.rmSync(DIST_DIR, { recursive: true, force: true })
fs.mkdirSync(DIST_DIR, { recursive: true })

await build({
  entryPoints: [
    'scripts/traceskill.ts',
    'scripts/skilltrace-mcp.ts',
    'scripts/traceskill-probe-worker.ts',
    'scripts/traceskill-serve.js',
  ],
  outdir: DIST_DIR,
  entryNames: '[name]',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  external: ['../build/server/index.js'],
  logLevel: 'info',
})

fs.copyFileSync(
  path.join(ROOT, 'scripts/lib/skilltrace-runtime-env.js'),
  path.join(DIST_DIR, 'skilltrace-runtime-env.js'),
)
