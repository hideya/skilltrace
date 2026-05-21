import { Form, Link } from 'react-router'
import { replaceWithSuccess } from 'remix-toast'
import { requireUser } from '~/.server/auth/middlewares'
import { noteInsertSchema } from '~/.server/db/validators'
import { notFoundError } from '~/lib/.server/errors'
import { payloadFromRequest } from '~/lib/data/payload'
import { validate } from '~/lib/data/validate'
import { Note } from '~/models/.server/note'
import { useBusy } from '~/hooks/use-busy'
import { InputError } from '~/ui/forms/input-error'

const createNoteSchema = noteInsertSchema.pick({
  title: true,
  content: true,
})

export async function loader({ context }) {
  let user = requireUser(context)
  let notes = await Note.newestBy('created_at', {
    where: { user_id: user.id },
  })

  return { user, notes }
}

export async function action({ request, context }) {
  let user = requireUser(context)
  let payload = await payloadFromRequest(request)

  if (payload.intent === 'delete') {
    let noteId = Number(payload.note_id)
    if (!Number.isInteger(noteId) || noteId <= 0) throw notFoundError()

    let note = await Note.findBy({ id: noteId, user_id: user.id })
    if (!note) throw notFoundError()

    await Note.delete(note.id)
    return replaceWithSuccess('/app', 'Note deleted')
  }

  let { data, errors } = validate(payload, createNoteSchema)
  if (errors) return { errors }

  await Note.create({
    user_id: user.id,
    title: data.title,
    content: data.content,
  })

  return replaceWithSuccess('/app', 'Note created')
}

export default function Page({ loaderData: { user, notes } }) {
  let busy = useBusy()

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="badge badge-outline">Protected</p>
          <div className="space-y-1">
            <h1 className="text-4xl font-bold text-balance">
              Hello, {user.name || user.email}
            </h1>
            <p className="text-base-content/70">
              Your private notes dashboard is ready.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Link to="/app/settings" className="btn btn-ghost">
            Settings
          </Link>
          <Form action="/logout" method="post" replace>
            <button className="btn" disabled={busy}>
              Logout
            </button>
          </Form>
        </div>
      </header>

      <section className="rounded-box border border-base-300 bg-base-100 p-6 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">New note</h2>
          <p className="text-sm text-base-content/60">
            Capture a quick thought, task, or draft.
          </p>
        </div>

        <Form method="post" replace className="mt-6 space-y-4">
          <input type="hidden" name="intent" value="create" />

          <div className="space-y-2">
            <input
              className="input w-full"
              name="title"
              type="text"
              placeholder="Title"
              autoComplete="off"
            />
            <InputError name="title" />
          </div>

          <div className="space-y-2">
            <textarea
              className="textarea min-h-32 w-full"
              name="content"
              placeholder="Content (optional)"
            />
            <InputError name="content" />
          </div>

          <div className="flex justify-end">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving...' : 'Create note'}
            </button>
          </div>
        </Form>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Your notes</h2>
            <p className="text-sm text-base-content/60">
              {notes.length} note{notes.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {notes.length > 0 ? (
          <div className="grid gap-4">
            {notes.map((note) => (
              <article
                className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm"
                key={note.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <h3 className="text-lg font-semibold">{note.title}</h3>
                    {note.content ? (
                      <p className="whitespace-pre-wrap text-base-content/80">
                        {note.content}
                      </p>
                    ) : (
                      <p className="text-sm text-base-content/50">
                        No content yet.
                      </p>
                    )}
                  </div>

                  <Form method="post" replace>
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="note_id" value={note.id} />
                    <button className="btn btn-ghost btn-sm text-error" disabled={busy}>
                      Delete
                    </button>
                  </Form>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-box border border-dashed border-base-300 bg-base-100 p-8 text-center text-base-content/60">
            No notes yet. Create your first one above.
          </div>
        )}
      </section>
    </main>
  )
}
