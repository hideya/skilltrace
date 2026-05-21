import { spawnSync } from 'node:child_process'
import readline from 'node:readline'

const defaultSkipPaths = []
const skipPaths = [
  ...new Set([...defaultSkipPaths, ...parseSkipPaths(process.argv.slice(2))]),
]
const gitArgs = ['clean', '-fdx', ...skipPaths.flatMap((path) => ['-e', path])]
const dryRunArgs = [...gitArgs, '-n']

const dryRun = spawnSync('git', dryRunArgs, { stdio: 'inherit' })

if (dryRun.status !== 0) process.exit(dryRun.status ?? 1)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

rl.question('\nOK? ', (answer) => {
  rl.close()

  if (answer.trim().toLowerCase() !== 'y') return

  const run = spawnSync('git', gitArgs, { stdio: 'inherit' })

  if (run.status !== 0) process.exit(run.status ?? 1)
})

function parseSkipPaths(args) {
  let skipPaths = []

  for (let index = 0; index < args.length; index += 1) {
    let arg = args[index]

    if (arg === '--exclude' || arg === '-e') {
      let path = args[index + 1]

      if (!path || path.startsWith('-')) continue

      skipPaths.push(path)
      index += 1
      continue
    }
  }

  return [...new Set(skipPaths)]
}
