import { Link, Form } from 'react-router'
import { replaceWithSuccess } from 'remix-toast'
import { requireUser } from '~/.server/auth/middlewares'
import { userUpdateSchema } from '~/.server/db/validators'
import { payloadFromRequest } from '~/lib/data/payload'
import { validate } from '~/lib/data/validate'
import { matchesCode } from '~/models/.server/base/error'
import { User } from '~/models/.server/user'
import { InputError } from '~/ui/forms/input-error'

const settingsSchema = userUpdateSchema.pick({
  name: true,
  email: true,
})

export async function loader({ context }) {
  let user = requireUser(context)
  return { user }
}

export async function action({ request, context }) {
  let user = requireUser(context)
  let payload = await payloadFromRequest(request)
  let { data, errors } = validate(payload, settingsSchema)
  if (errors) return { errors }

  try {
    await User.update(user.id, {
      name: data.name,
      email: data.email,
    })
  } catch (error) {
    if (matchesCode(error, ['SQLITE_CONSTRAINT_UNIQUE'])) {
      return { errors: { email: ['Email already taken'] } }
    }
    throw error
  }

  return replaceWithSuccess('/app/settings', 'Settings updated')
}

export default function Page({ loaderData: { user } }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="space-y-3">
        <p className="badge badge-outline">Protected</p>
        <div className="space-y-1">
          <h1 className="text-4xl font-bold text-balance">Settings</h1>
          <p className="text-base-content/70">
            Update the name and email tied to your account.
          </p>
        </div>
      </header>

      <section className="rounded-box border border-base-300 bg-base-100 p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="form-control gap-2">
            <span className="label-text">Name</span>
            <input
              className="input w-full"
              name="name"
              type="text"
              defaultValue={user.name || ''}
              autoComplete="name"
              form="settings-form"
            />
            <InputError name="name" />
          </label>

          <label className="form-control gap-2">
            <span className="label-text">Email</span>
            <input
              className="input w-full"
              name="email"
              type="email"
              defaultValue={user.email}
              autoComplete="email"
              form="settings-form"
            />
            <InputError name="email" />
          </label>
        </div>

        <div className="mt-2 text-sm text-base-content/60">
          Current account: {user.name || user.email}
        </div>

        <Form id="settings-form" method="post" replace className="mt-6 flex gap-3">
          <button className="btn btn-primary">Save changes</button>
          <Link to="/app" className="btn btn-ghost">
            Back to dashboard
          </Link>
        </Form>
      </section>
    </main>
  )
}
