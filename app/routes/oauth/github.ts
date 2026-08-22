import { redirect } from 'react-router'
import { getUser, setCookie } from '~/.server/auth/cookie'
import { getSearchParam } from '~/lib/.server/url'
import { githubAuth } from './+/github'
import { generateOauthState } from './+/oauth.server'

export async function loader({ request }) {
  let user = await getUser(request)
  if (user) return redirect('/')

  let state = generateOauthState()
  let scopes = ['user:email']
  let auth = githubAuth(request)
  let url = auth.createAuthorizationURL(state, scopes)
  let redirect_to = getSearchParam(request, 'redirect_to')
  let headers = await setCookie(request, { oauth_state: state, redirect_to })

  return redirect(url.toString(), { headers })
}
