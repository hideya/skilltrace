import { describe, expect, test } from 'vitest'
import {
  isConnectionFailure,
  serverUnavailableMessage,
} from './skilltrace-http'

describe('skilltrace HTTP helpers', () => {
  test('formats a server unavailable message with the active command name', () => {
    let message = serverUnavailableMessage(
      new URL('http://127.0.0.1:5777/api/sessions/status'),
      { commandName: 'traceskill-dev' },
    )

    expect(message).toContain(
      'SkillTrace server is not reachable at http://127.0.0.1:5777.',
    )
    expect(message).toContain('`traceskill-dev daemon start`')
    expect(message).toContain('`traceskill-dev serve`')
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
})
