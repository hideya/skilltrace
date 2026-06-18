import { useEffect, useRef, useState, type RefObject } from 'react'
import { Form, NavLink, Outlet, useLocation, useNavigation } from 'react-router'
import { requireUser, requireUserMiddleware } from '~/.server/auth/middlewares'
import { appName } from '~/config/app-name'

export const middleware = [requireUserMiddleware]
const activeClass = 'underline underline-offset-4 decoration-2'
const navItemClass =
  'btn rounded-full btn-ghost btn-sm font-normal tracking-wider h-8 min-h-8' +
  ' hover:bg-white/20 hover:text-white' +
  ' px-2 text-xs whitespace-nowrap sm:h-9 sm:min-h-9 sm:px-3' +
  ' sm:text-sm border-none shadow-none'

export async function loader({ context }) {
  let user = requireUser(context)
  return { user }
}

export default function Layout({ loaderData }: LayoutProps) {
  let navRef = useRef<HTMLElement>(null)
  let isPastNav = useIsPastNavHeight(navRef)
  let user = loaderData.user
  let location = useLocation()
  let navigation = useNavigation()
  let pendingPath = navigation.location?.pathname || null
  let currentPath = `${location.pathname}${location.search}${location.hash}`
  let settingsReturnTo =
    location.pathname === '/app/settings' ? '/app' : currentPath
  let logoutBusy =
    navigation.state !== 'idle' &&
    navigation.formMethod?.toLowerCase() === 'post' &&
    !!navigation.formAction &&
    navigation.formAction.endsWith('/logout')
  let homeBusy = pendingPath === '/app'
  let runsBusy = pendingPath?.startsWith('/app/runs')
  let adminBusy = pendingPath?.startsWith('/admin')
  let settingsBusy = pendingPath === '/app/settings'

  return (
    <div className="min-h-screen bg-base-200 pt-12">
      <header
        ref={navRef}
        className={`navbar fixed inset-x-0 top-0 z-50 h-12 min-h-12 px-6 py-0 text-white backdrop-blur transition-colors duration-200 ${
          isPastNav ? 'bg-primary/50' : 'bg-primary'
        }`}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-nowrap items-center justify-between gap-4">
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="text-2xl">{appName}</div>
            <AppNavLink to="/app" end busy={homeBusy}>
              Home
            </AppNavLink>
            <AppNavLink to="/app/runs" busy={runsBusy}>
              Runs
            </AppNavLink>
          </div>
          <div className="ml-auto flex w-auto items-center justify-end gap-0 sm:gap-1">
            {user.role === 'admin' ? (
              <AppNavLink to="/admin" className="shrink-0" busy={adminBusy}>
                Admin
              </AppNavLink>
            ) : null}
            <AppNavLink
              to="/app/settings"
              state={{ returnTo: settingsReturnTo }}
              className="shrink-0"
              busy={settingsBusy}
            >
              <UserNavLabel user={user} />
            </AppNavLink>
            <Form action="/logout" method="post" replace>
              <button
                className={`${navItemClass} relative shrink-0`}
                disabled={logoutBusy}
              >
                <span className={logoutBusy ? 'invisible' : ''}>Logout</span>
                {logoutBusy ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="loading loading-sm loading-spinner" />
                  </span>
                ) : null}
              </button>
            </Form>
          </div>
        </div>
      </header>

      <div className="app-fade-in">
        <Outlet />
      </div>
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

function UserNavLabel({ user }: UserNavLabelProps) {
  let name = user.name || '???'

  return (
    <span className="flex items-center gap-0.5">
      <span>{name}</span>
    </span>
  )
}

function AppNavLink({
  to,
  end,
  state,
  busy = false,
  className = '',
  children,
}: AppNavLinkProps) {
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

type AppNavLinkProps = {
  to: string
  end?: boolean
  state?: any
  busy?: boolean
  className?: string
  children: any
}

type UserNavLabelProps = {
  user: any
}

type LayoutProps = {
  loaderData: {
    user: any
  }
}
