import { useEffect } from 'react'
import {
  data,
  isRouteErrorResponse,
  Links,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
  useRouteError,
} from 'react-router'
import { getToast } from 'remix-toast'
import { toast as notify, Toaster } from 'sonner'
import { getUser } from '~/.server/auth/cookie'
import { PublicEnv } from '~/config/.server/env'
import { appName } from '~/config/app-name'
import { StatusPage } from '~/ui/status-page'
import './tailwind.css'

const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX'

export async function loader({ request }) {
  let { toast, headers } = await getToast(request)
  let user = await getUser(request)

  return data({ toast, user, PublicEnv }, { headers })
}

export function Layout({ children }: { children: React.ReactNode }) {
  let data = useRouteLoaderData<typeof loader>('root')
  let { toast, PublicEnv } = data ?? ({} as any)

  useEffect(() => {
    if (toast) notify[toast.type](toast.message)
  }, [toast])

  return (
    // Keep this in sync with `app/tailwind.css` custom daisyUI theme name.
    <html lang="en" className="h-full" data-theme="my-light">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{appName}</title>
        <link rel="icon" href="/favicon.svg" sizes="any" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Poppins:wght@100;200;300;400;500;600;700&display=swap"
        />
        <Links />
        <script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        />
        <Links />
        {PublicEnv && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.ENV = ${JSON.stringify(PublicEnv)}`,
            }}
          />
        )}
      </head>
      <body className="h-full bg-base-200">
        <div className="app-fade-in">{children}</div>
        <ScrollRestoration />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || []
function gtag(){dataLayer.push(arguments)}
gtag('js', new Date())
gtag('config', '${GA_MEASUREMENT_ID}')`,
          }}
        />
        <Toaster
          toastOptions={{
            unstyled: true,
            classNames: {
              toast:
                'w-full flex gap-2 items-center bg-base-100 p-4 rounded-lg shadow-lg text-sm border border-base-300',
              error: 'text-red-600',
              success: 'text-teal-600',
              warning: 'text-yellow-600',
              info: 'text-gray-600',
            },
          }}
        />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary() {
  let error = useRouteError()

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <StatusPage
        title="404"
        heading="Page not found"
        description="The page you are looking for does not exist or has moved."
      />
    )
  }

  return (
    <StatusPage
      title="Error"
      heading="Something went wrong"
      description="Please try again from the home page."
    />
  )
}
