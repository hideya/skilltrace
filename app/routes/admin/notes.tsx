import { useRef } from 'react'
import { Form } from 'react-router'
import { replaceWithSuccess } from 'remix-toast'
import { requireAdmin } from '~/.server/auth/middlewares'
import { DataTable } from '~/ui/data-table'
import { notFoundError } from '~/lib/.server/errors'
import { payloadFromRequest } from '~/lib/data/payload'
import { Note } from '~/models/.server/note'

export async function loader() {
  let notes = await Note.newest({
    with: {
      user: true,
    },
  })

  return {
    notes,
    totalNotes: notes.length,
  }
}

export async function action({ request, context }) {
  requireAdmin(context)

  let payload = await payloadFromRequest(request)
  if (payload.intent !== 'delete') throw notFoundError()

  let noteId = Number(payload.note_id)
  if (!Number.isInteger(noteId) || noteId <= 0) throw notFoundError()

  let note = await Note.findByID(noteId)
  if (!note) throw notFoundError()

  await Note.delete(note.id)
  return replaceWithSuccess('/admin/notes', 'Note deleted')
}

export default function Page({ loaderData }: PageProps) {
  let { notes, totalNotes } = loaderData

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="badge badge-neutral badge-outline">Admin index</p>
          <h2 className="text-3xl font-bold">All Notes</h2>
          <p className="text-base-content/70">
            {totalNotes} note{totalNotes === 1 ? '' : 's'} total
          </p>
        </div>

        <div className="rounded-box border border-base-300 bg-base-100 px-4 py-3 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-base-content/50">
            Total notes
          </p>
          <p className="text-3xl font-bold">{totalNotes}</p>
        </div>
      </div>

      <div className="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
        <DataTable
          className="table-zebra"
          rows={notes}
          columns={{
            title: 'Title',
            content: 'Content',
            user: ['Author', (note) => authorLabel(note.user)],
            created_at: 'Created',
            delete: ['Delete', (note) => <DeleteNoteCell noteId={note.id} />],
          }}
        />
      </div>
    </section>
  )
}

function authorLabel(user: any) {
  return (
    <div className="min-w-0">
      <div className="font-medium">{user.name || '—'}</div>
      <div className="text-xs text-base-content/60">{user.email}</div>
    </div>
  )
}

function DeleteNoteCell({ noteId }: DeleteNoteCellProps) {
  let dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        className="btn btn-ghost btn-xs text-error"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        Delete
      </button>

      <dialog ref={dialogRef} className="modal">
        <div className="modal-box">
          <h3 className="text-lg font-bold">Delete this note?</h3>
          <p className="py-3 text-base-content/70">
            This action cannot be undone.
          </p>

          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost">Cancel</button>
            </form>

            <Form method="post" replace>
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="note_id" value={noteId} />
              <button className="btn btn-error">Delete</button>
            </Form>
          </div>
        </div>

        <form method="dialog" className="modal-backdrop">
          <button aria-label="Close">close</button>
        </form>
      </dialog>
    </>
  )
}

type PageProps = {
  loaderData: LoaderData
}

type LoaderData = {
  notes: any[]
  totalNotes: number
}

type DeleteNoteCellProps = {
  noteId: number
}
