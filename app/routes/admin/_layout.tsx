import { ShieldCheckIcon } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'
import {
  requireAdmin as requireAdminContext,
  requireAdminMiddleware,
} from '~/.server/auth/middlewares'

export const middleware = [requireAdminMiddleware]

export async function loader({ context }) {
  let user = requireAdminContext(context)
  return { user }
}

export default function Layout({ loaderData }: LayoutProps) {
  let user = loaderData.user

  return (
    <div className="min-h-screen bg-base-200">
      <header className="navbar border-b border-base-300 bg-base-100/90 px-6 shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-box bg-error/10 p-2 text-error">
              <ShieldCheckIcon className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-base-content/50">
                Admin
              </p>
              <h1 className="text-lg font-bold">Admin</h1>
            </div>
            <span className="badge badge-error badge-outline">Protected</span>
          </div>

          <div className="flex items-center gap-2">
            <NavLink
              className={({ isActive }) =>
                `btn btn-ghost btn-sm ${isActive ? 'btn-active' : ''}`
              }
              to="/admin"
              end
            >
              Users
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                `btn btn-ghost btn-sm ${isActive ? 'btn-active' : ''}`
              }
              to="/admin/notes"
            >
              All Notes
            </NavLink>
            <span className="hidden text-sm text-base-content/60 sm:inline">
              {user.name || user.email}
            </span>
            <Link className="btn btn-ghost btn-sm" to="/app">
              Back to app
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}

type LayoutProps = {
  loaderData: {
    user: any
  }
}
