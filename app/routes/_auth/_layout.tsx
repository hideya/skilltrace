import { LockKeyholeIcon } from 'lucide-react'
import { Outlet } from 'react-router'

export default function Layout() {
  return (
    <div className="flex min-h-full flex-col justify-center bg-base-200 px-4 py-10">
      <div className="mx-auto w-full max-w-md px-8 py-8">
        <div className="mb-8 flex justify-center">
          {/* <div className="rounded-full bg-base-200 p-3">
            <LockKeyholeIcon className="size-6" />
          </div> */}
          <div className="text-4xl">App Name Here</div>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
