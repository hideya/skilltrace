import { Google } from 'arctic'

export function googleAuth(request: Request) {
  let origin = new URL(request.url).origin
  return new Google(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${origin}/oauth/google/callback`,
  )
}
