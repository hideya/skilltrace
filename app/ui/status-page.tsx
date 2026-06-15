import { TriangleAlertIcon } from 'lucide-react'
import { Link } from 'react-router'

export function StatusPage({ title, heading, description }: StatusPageProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <section className="rounded-box border border-base-300 bg-base-100 p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <TriangleAlertIcon className="size-6" aria-hidden="true" />
        </div>
        <p className="mt-6 text-sm font-semibold tracking-wide text-primary uppercase">
          {title}
        </p>
        <h1 className="mt-2 text-3xl font-light text-balance">{heading}</h1>
        <p className="mt-3 text-base-content/70">{description}</p>
        <Link to="/" className="btn mt-8 btn-primary">
          Go home
        </Link>
      </section>
    </main>
  )
}

type StatusPageProps = {
  title: string
  heading: string
  description: string
}
