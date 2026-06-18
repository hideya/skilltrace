import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const TEMPLATE_DIR = path.join(ROOT, 'agent-sandbox-repo-template')
const TARGET_DIR = path.join(ROOT, 'agent-sandbox-repo')

function main() {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    throw new Error(`Missing template directory: ${TEMPLATE_DIR}`)
  }

  fs.rmSync(TARGET_DIR, { recursive: true, force: true })
  fs.cpSync(TEMPLATE_DIR, TARGET_DIR, { recursive: true })

  console.log(`Reset ${path.relative(ROOT, TARGET_DIR)} from template`)
}

main()
