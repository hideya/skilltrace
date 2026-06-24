import { badRequestError } from '~/lib/.server/errors'

export async function jsonFromRequest(request: Request) {
  let type = request.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    throw badRequestError('Expected application/json')
  }

  try {
    return await request.json()
  } catch {
    throw badRequestError('Invalid JSON')
  }
}
