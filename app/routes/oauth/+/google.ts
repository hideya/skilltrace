import { codeChallenge, tokenResult } from './oauth.server'

export function googleAuth(request: Request) {
  let origin = new URL(request.url).origin
  let redirectUri = `${origin}/oauth/google/callback`

  return {
    createAuthorizationURL(
      state: string,
      codeVerifier: string,
      scopes: string[],
    ) {
      let url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', scopes.join(' '))
      url.searchParams.set('state', state)
      url.searchParams.set('code_challenge', codeChallenge(codeVerifier))
      url.searchParams.set('code_challenge_method', 'S256')
      return url
    },

    async validateAuthorizationCode(code: string, codeVerifier: string) {
      let response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          code,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      })

      if (!response.ok) throw new Error('Google OAuth token exchange failed')
      return tokenResult(await response.json())
    },
  }
}
