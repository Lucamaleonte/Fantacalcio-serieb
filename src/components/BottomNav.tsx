import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home' },
  { to: '/giocatori', label: 'Giocatori' },
  { to: '/rosa', label: 'Rosa' },
  { to: '/formazione', label: 'Formazione' },
  { to: '/classifica', label: 'Classifica' },
]

export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900">
      <ul className="mx-auto flex max-w-xl">
        {links.map(({ to, label }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `block py-3 text-center text-xs font-medium ${
                  isActive
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
