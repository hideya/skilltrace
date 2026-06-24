import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequestListener } from '@react-router/node'
import './lib/skilltrace-runtime-env.js'
import * as build from '../build/server/index.js'
import { initLocalDb } from './init-local-db.ts'

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const CLIENT_BUILD_DIR = path.join(PROJECT_ROOT, 'build/client')
const DEFAULT_PORT = 7555
const DEFAULT_HOST = '127.0.0.1'

async function main() {
  await initLocalDb()

  let port = Number(process.env.PORT || DEFAULT_PORT)
  let host = process.env.HOST || DEFAULT_HOST
  let requestListener = createRequestListener({ build, mode: process.env.NODE_ENV })
  let server = http.createServer((req, res) => {
    if (serveAsset(req, res)) return
    requestListener(req, res)
  })

  server.listen(port, host, () => {
    console.log(`SkillTrace server listening on http://localhost:${port}`)
  })
}

function serveAsset(req, res) {
  if (!req.url) return false
  if (req.method !== 'GET' && req.method !== 'HEAD') return false

  let url = new URL(req.url, 'http://localhost')
  let pathname = decodeURIComponent(url.pathname)
  let filePath = path.join(CLIENT_BUILD_DIR, pathname)
  let relative = path.relative(CLIENT_BUILD_DIR, filePath)

  if (relative.startsWith('..') || path.isAbsolute(relative)) return false
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false

  res.statusCode = 200
  res.setHeader('content-type', contentType(filePath))
  if (req.method === 'HEAD') {
    res.end()
  } else {
    fs.createReadStream(filePath).pipe(res)
  }
  return true
}

function contentType(filePath) {
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
  if (filePath.endsWith('.svg')) return 'image/svg+xml'
  if (filePath.endsWith('.png')) return 'image/png'
  if (filePath.endsWith('.ico')) return 'image/x-icon'
  return 'application/octet-stream'
}

await main()
