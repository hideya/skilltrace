import { ShieldCheckIcon } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import {
  requireAdmin as requireAdminContext,
  requireAdminMiddleware,
} from '~/.server/auth/middlewares'

export const middleware = [requireAdminMiddleware]
const activeClass = 'underline underline-offset-4 decoration-2'
const navItemClass =
  'btn rounded-full btn-ghost btn-sm font-normal tracking-wider h-8 min-h-8' +
  ' hover:bg-white/20 hover:text-white' +
  ' px-2 text-xs whitespace-nowrap sm:h-9 sm:min-h-9 sm:px-3' +
  ' sm:text-sm border-none shadow-none'

export async function loader({ context }) {
  let user = requireAdminContext(context)
  return { user }
}

export default function Layout({ loaderData }: LayoutProps) {
  let navRef = useRef<HTMLElement>(null)
  let isPastNav = useIsPastNavHeight(navRef)
  let user = loaderData.user

  return (
    <div className="min-h-screen bg-base-200 pt-16">
      <header
        ref={navRef}
        className={
          `navbar fixed inset-x-0 top-0 z-50 border-b border-none px-8` +
          ` text-white backdrop-blur-xs transition-colors duration-200 ${
            isPastNav ? 'bg-secondary/50' : 'bg-secondary'
          }`
        }
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="">
              <ShieldCheckIcon className="size-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-light">Admin</h1>
            </div>
            <span className="badge rounded-full badge-outline">Protected</span>
          </div>

          <div className="flex items-center gap-3">
            <AdminNavLink to="/admin" end>
              Users
            </AdminNavLink>
            <AdminNavLink to="/admin/notes">All Notes</AdminNavLink>
            <span className="hidden text-sm sm:inline">
              {user.name || user.email}
            </span>
            <Link
              className={
                'btn border-none font-normal tracking-wider btn-ghost btn-sm' +
                ' hover:bg-white/20 hover:text-white'
              }
              to="/app"
            >
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

function useIsPastNavHeight(ref: RefObject<HTMLElement | null>) {
  let [isPast, setIsPast] = useState(false)

  useEffect(() => {
    let update = () => {
      let height = ref.current?.getBoundingClientRect().height || 0
      setIsPast(window.scrollY > height / 2)
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [ref])

  return isPast
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
