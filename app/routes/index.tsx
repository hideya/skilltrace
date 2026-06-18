import { redirect } from 'react-router'

export async function loader() {
  return redirect('/app/runs')
}

export default function Page() {
  return null
}
