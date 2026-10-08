import { NavLink } from 'react-router-dom'

// Schede in cima a Classifica e Calendario
export default function StandingsTabs() {
  return (
    <nav className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
      {[
        { to: '/classifica', label: 'Classifica' },
        { to: '/calendario', label: 'Calendario' },
      ].map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex min-h-11 items-center justify-center rounded-lg text-sm font-semibold ${
              isActive
                ? 'bg-white shadow dark:bg-slate-950'
                : 'text-slate-600 dark:text-slate-400'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
