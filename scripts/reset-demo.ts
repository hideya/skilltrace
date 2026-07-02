import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()

function main() {
  let name = process.argv[2]
  if (!name) {
    throw new Error('Usage: pnpm demo:reset <demo-name>')
  }
  if (name !== path.basename(name)) {
    throw new Error(`Demo name must not contain path separators: ${name}`)
  }

  let sourceDir = path.join(ROOT, 'examples', name)
  let targetDir = path.join(ROOT, 'tmp', name)

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Missing demo directory: ${sourceDir}`)
  }

  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    verbatimSymlinks: true,
  })

  console.log(
    `Reset ${path.relative(ROOT, targetDir)} from ${path.relative(ROOT, sourceDir)}`,
  )
}

main()
