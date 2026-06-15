import { ShieldCheckIcon } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'
import {
  requireAdmin as requireAdminContext,
  requireAdminMiddleware,
} from '~/.server/auth/middlewares'

export const middleware = [requireAdminMiddleware]
const activeClass = 'underline underline-offset-4 decoration-2'
const navItemClass =
  'btn rounded-full btn-ghost btn-sm font-normal tracking-wider h-8 min-h-8' +
  ' px-2 text-xs whitespace-nowrap sm:h-9 sm:min-h-9 sm:px-3' +
  ' sm:text-sm border-none shadow-none'

export async function loader({ context }) {
  let user = requireAdminContext(context)
  return { user }
}

export default function Layout({ loaderData }: LayoutProps) {
  let user = loaderData.user

  return (
    <div className="min-h-screen bg-base-200">
      <header className="navbar border-b border-base-300 bg-base-100/90 px-8 shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="text-error">
              <ShieldCheckIcon className="size-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-light">Admin</h1>
            </div>
            <span className="badge rounded-full badge-outline badge-error">
              Protected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <AdminNavLink to="/admin" end>
              Users
            </AdminNavLink>
            <AdminNavLink to="/admin/notes">All Notes</AdminNavLink>
            <span className="hidden text-sm sm:inline">
              {user.name || user.email}
            </span>
            <Link className="btn btn-ghost btn-sm" to="/app">
              Go App
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

function AdminNavLink({
  to,
  end,
  state,
  busy = false,
  className = '',
  children,
}: AdminNavLinkProps) {
  return (
    <NavLink
      to={to}
      end={end}
      state={state}
      className={({ isActive }) =>
        `${navItemClass} relative ${className} ${isActive ? activeClass : ''}`
      }
    >
      <span className={busy ? 'invisible' : ''}>{children}</span>
      {busy ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="loading loading-sm loading-spinner" />
        </span>
      ) : null}
    </NavLink>
  )
}

type AdminNavLinkProps = {
  to: string
  end?: boolean
  state?: any
  busy?: boolean
  className?: string
  children: any
}

type LayoutProps = {
  loaderData: {
    user: any
  }
}
