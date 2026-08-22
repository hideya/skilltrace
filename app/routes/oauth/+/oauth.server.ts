import { createHash, randomBytes } from 'node:crypto'

export function generateOauthState() {
  return randomBytes(32).toString('base64url')
}

export function generateCodeVerifier() {
  return randomBytes(32).toString('base64url')
}

export function codeChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function tokenResult(value: any) {
  let accessToken = value?.access_token
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('OAuth token response did not include an access token')
  }

  return {
    accessToken: () => accessToken,
  }
}
