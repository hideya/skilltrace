export async function getJson(
  server: string,
  pathname: string,
  options: SkillTraceHttpOptions = {},
) {
  let url = new URL(pathname, server)
  let response = await fetchJson(url, undefined, options)
  return await jsonResponse(response)
}

export async function postJson(
  server: string,
  pathname: string,
  body: any,
  options: SkillTraceHttpOptions = {},
) {
  let url = new URL(pathname, server)
  let response = await fetchJson(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  }, options)

  return await jsonResponse(response)
}

export function isConnectionFailure(error: unknown) {
  if (!(error instanceof Error)) return false
  let cause = error.cause as any
  if (isNetworkFailureCode(cause?.code)) return true
  if (Array.isArray(cause?.errors)) {
    return cause.errors.some((item: any) => isNetworkFailureCode(item?.code))
  }

  return error.message === 'fetch failed'
}

export function serverUnavailableMessage(
  url: URL,
  options: SkillTraceHttpOptions = {},
) {
  let command = options.commandName ?? 'skilltrace'

  return [
    `SkillTrace server is not reachable at ${url.origin}.`,
    `Start it with \`${command} daemon start\` or \`${command} serve\`, then retry.`,
    'Use `--server <url>` if the server is running somewhere else.',
  ].join('\n')
}

async function fetchJson(
  url: URL,
  init?: RequestInit,
  options: SkillTraceHttpOptions = {},
) {
  try {
    return await fetch(url, init)
  } catch (error) {
    if (isConnectionFailure(error)) {
      throw new Error(serverUnavailableMessage(url, options))
    }

    throw error
  }
}

async function jsonResponse(response: Response) {
  if (!response.ok) {
    let body = await response.text()
    throw new Error(`SkillTrace request failed: ${response.status} ${body}`)
  }

  return await response.json()
}

function isNetworkFailureCode(code: unknown) {
  return [
    'ECONNREFUSED',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENOTFOUND',
    'ETIMEDOUT',
  ].includes(String(code))
}

export type SkillTraceHttpOptions = {
  commandName?: string
}
