import { redirect } from 'react-router'
import { getUser, setCookie } from '~/.server/auth/cookie'
import { getSearchParam } from '~/lib/.server/url'
import { googleAuth } from './+/google'
import { generateCodeVerifier, generateOauthState } from './+/oauth.server'

export async function loader({ request }) {
  let user = await getUser(request)
  if (user) return redirect('/')

  let state = generateOauthState()
  let codeVerifier = generateCodeVerifier()
  let auth = googleAuth(request)
  let url = auth.createAuthorizationURL(state, codeVerifier, [
    'openid',
    'profile',
    'email',
  ])

  let redirect_to = getSearchParam(request, 'redirect_to')
  let headers = await setCookie(request, {
    oauth_state: state,
    oauth_verifier: codeVerifier,
    redirect_to,
  })

  return redirect(url.toString(), { headers })
}
