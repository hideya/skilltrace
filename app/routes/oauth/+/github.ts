import { GitHub } from 'arctic'

export function githubAuth(request: Request) {
  let origin = new URL(request.url).origin
  return new GitHub(
    process.env.GITHUB_CLIENT_ID!,
    process.env.GITHUB_CLIENT_SECRET!,
    `${origin}/oauth/github/callback`,
  )
}
