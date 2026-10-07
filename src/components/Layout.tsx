import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'

export default function Layout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <main className="flex-1 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-24">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
