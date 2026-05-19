import { Form } from 'react-router'
import { requireUser } from '~/.server/auth/middlewares'

export async function loader({ context }) {
  let user = requireUser(context)
  return { user }
}

export default function Page({ loaderData: { user } }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="badge badge-outline">Protected</p>
        <h1 className="text-4xl font-bold text-balance">Signed-in area</h1>
        <p className="text-base-content/70">
          You are logged in as {user.email}
        </p>
      </header>

      <section className="rounded-box border border-base-300 bg-base-100 p-6">
        <p className="text-base-content/80">
          This page is protected by `requireUserMiddleware`, and the loader gets
          the user from context.
        </p>

        <div className="mt-6 flex gap-3">
          <Form action="/logout" method="post">
            <button className="btn">Logout</button>
          </Form>
        </div>
      </section>
    </main>
  )
}
