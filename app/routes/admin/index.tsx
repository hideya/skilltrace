import { DataTable } from '~/ui/data-table'
import { User } from '~/models/.server/user'

export async function loader() {
  let users = await User.newest({
    with: {
      notes: true,
    },
  })

  return {
    users,
    totalUsers: users.length,
  }
}

export default function Page({ loaderData }: PageProps) {
  let { users, totalUsers } = loaderData

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="badge badge-neutral badge-outline">Admin index</p>
          <h2 className="text-3xl font-bold">Users</h2>
          <p className="text-base-content/70">
            {totalUsers} user{totalUsers === 1 ? '' : 's'} total
          </p>
        </div>

        <div className="rounded-box border border-base-300 bg-base-100 px-4 py-3 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-base-content/50">
            Total users
          </p>
          <p className="text-3xl font-bold">{totalUsers}</p>
        </div>
      </div>

      <div className="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
        <DataTable
          className="table-zebra"
          rows={users}
          columns={{
            name: ['Name', (user) => user.name || '—'],
            email: 'Email',
            role: ['Role', (user) => roleLabel(user.role)],
            notes: ['Notes', (user) => user.notes.length],
            created_at: 'Signed up',
          }}
        />
      </div>
    </section>
  )
}

function roleLabel(role: string | null | undefined) {
  if (role === 'admin') {
    return <span className="badge badge-error badge-outline">Admin</span>
  }

  return <span className="badge badge-ghost">Member</span>
}

type PageProps = {
  loaderData: LoaderData
}

type LoaderData = {
  users: any[]
  totalUsers: number
}
