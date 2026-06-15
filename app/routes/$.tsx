import { data, useLocation } from 'react-router'
import { StatusPage } from '~/ui/status-page'

export function loader() {
  return data(null, { status: 404 })
}

export default function Page() {
  let location = useLocation()

  return (
    <StatusPage
      title="404"
      heading="No route matches this URL"
      description={`No route matches ${location.pathname}.`}
    />
  )
}
