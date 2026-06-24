#!/usr/bin/env node
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

let binDir = path.dirname(fileURLToPath(import.meta.url))
let packageRoot = path.resolve(binDir, '..')
let tsxPath = path.join(packageRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs')
let cliPath = path.join(packageRoot, 'scripts', 'traceskill.ts')

let result = spawnSync(process.execPath, [
  '--import',
  tsxPath,
  cliPath,
  ...process.argv.slice(2),
], {
  stdio: 'inherit',
  env: {
    ...process.env,
    SKILLTRACE_TARGET_ROOT: process.env.SKILLTRACE_TARGET_ROOT || process.cwd(),
  },
})

process.exit(result.status ?? 1)
