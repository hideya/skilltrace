import { Form, Link } from 'react-router'
import { getUser } from '~/.server/auth/cookie'

export async function loader({ request }) {
  let user = await getUser(request)
  return { user }
}

export default function Page({ loaderData: { user } }) {
  if (user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
        <header className="space-y-3">
          <p className="badge badge-outline">Gista.js Auth Starter</p>
          <h1 className="text-4xl font-bold text-balance">Welcome back</h1>
          <p className="text-base-content/70">Signed in as {user.email}</p>
        </header>

        <section className="rounded-box border border-base-300 bg-base-100 p-6">
          <h2 className="text-lg font-semibold">Next steps</h2>
          <ol className="mt-3 list-inside list-decimal space-y-2 text-base-content/80">
            <li>Open the protected route at `/app`</li>
            <li>Add your first authenticated feature</li>
            <li>Wire your own emails for verify and reset links</li>
          </ol>

          <div className="mt-6 flex gap-3">
            <Link to="/app" className="btn btn-primary">
              Go to app
            </Link>
            <Form action="/logout" method="post">
              <button className="btn">Logout</button>
            </Form>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="badge badge-outline">Gista.js Auth Starter</p>
        <h1 className="text-4xl font-bold text-balance">Auth is prewired.</h1>
        <p className="text-base-content/70">
          Start from login, signup, OAuth, and protected routes.
        </p>
      </header>

      <section className="rounded-box border border-base-300 bg-base-100 p-6">
        <h2 className="text-lg font-semibold">Next steps</h2>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-base-content/80">
          <li>Create an account with email/password</li>
          <li>Try Google or GitHub OAuth</li>
          <li>Build your first protected page at `/app`</li>
        </ol>

        <div className="mt-6 flex gap-3">
          <Link to="/signup" className="btn btn-primary">
            Sign up
          </Link>
          <Link to="/login" className="btn">
            Log in
          </Link>
        </div>
      </section>
    </main>
  )
}
