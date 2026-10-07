import { Link, NavLink, Outlet } from 'react-router-dom'
import { useCurrentLeague } from '../hooks/league'
import BottomNav from './BottomNav'

export default function Layout() {
  const { league, membership, isAdmin } = useCurrentLeague()

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/90 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <span className="min-w-0 truncate text-sm font-semibold text-slate-500 dark:text-slate-400">
          {league.name}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex min-h-11 items-center rounded-full px-3 text-sm font-semibold ${
                  isActive
                    ? 'bg-green-600 text-white'
                    : 'text-slate-700 dark:text-slate-300'
                }`
              }
            >
              Admin
            </NavLink>
          )}
          <Link
            to="/profilo"
            className="flex min-h-11 max-w-[45vw] items-center rounded-full px-3 text-sm font-semibold text-green-700 dark:text-green-400"
          >
            <span className="truncate">{membership.team_name}</span>&nbsp;›
          </Link>
        </div>
      </header>
      <main className="flex-1 px-4 pt-4 pb-24">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
