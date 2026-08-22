import { tokenResult } from './oauth.server'

export function githubAuth(request: Request) {
  let origin = new URL(request.url).origin
  let redirectUri = `${origin}/oauth/github/callback`

  return {
    createAuthorizationURL(state: string, scopes: string[]) {
      let url = new URL('https://github.com/login/oauth/authorize')
      url.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID!)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('scope', scopes.join(' '))
      url.searchParams.set('state', state)
      return url
    },

    async validateAuthorizationCode(code: string) {
      let response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.GITHUB_CLIENT_ID!,
          client_secret: process.env.GITHUB_CLIENT_SECRET!,
          code,
          redirect_uri: redirectUri,
        }),
      })

      if (!response.ok) throw new Error('GitHub OAuth token exchange failed')
      return tokenResult(await response.json())
    },
  }
}
