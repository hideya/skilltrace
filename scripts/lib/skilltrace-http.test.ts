import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  getJson,
  isConnectionFailure,
  serverUnavailableMessage,
} from './skilltrace-http'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('skilltrace HTTP helpers', () => {
  test('formats a server unavailable message with the active command name', () => {
    let message = serverUnavailableMessage(
      new URL('http://127.0.0.1:5777/api/sessions/status'),
      { commandName: 'skilltrace-dev' },
    )

    expect(message).toContain(
      'SkillTrace server is not reachable at http://127.0.0.1:5777.',
    )
    expect(message).toContain('`skilltrace-dev daemon start`')
    expect(message).toContain('`skilltrace-dev serve`')
  })

  test('detects undici aggregate connection failures', () => {
    let error = new Error('fetch failed', {
      cause: {
        errors: [
          { code: 'ECONNREFUSED' },
          { code: 'ECONNREFUSED' },
        ],
      },
    })

    expect(isConnectionFailure(error)).toBe(true)
  })

  test('does not treat ordinary errors as connection failures', () => {
    expect(isConnectionFailure(new Error('bad json'))).toBe(false)
  })

  test('formats non-ok HTTP responses with the SkillTrace name', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response('not good', { status: 500 })
    )

    await expect(getJson('http://127.0.0.1:7555', '/api/test')).rejects.toThrow(
      'SkillTrace request failed: 500 not good',
    )
  })
})
