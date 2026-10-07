import type { ScoreDetails } from '../lib/scoring'
import { RoleBadge } from './ui'

function format(value: number | null): string {
  return value === null ? 'SV' : String(value).replace('.', ',')
}

// Dettaglio del punteggio: titolari, voti usati e sostituzioni
export default function ScoreDetailsView({
  details,
  points,
}: {
  details: ScoreDetails
  points: number
}) {
  if (details.missing) {
    return (
      <p className="text-sm text-red-600">Formazione non inserita: 0 punti.</p>
    )
  }

  return (
    <div className="text-sm">
      <p className="mb-2 text-slate-500 dark:text-slate-400">
        Modulo {details.formation} ·{' '}
        {details.substitutions === 1
          ? '1 sostituzione'
          : `${details.substitutions} sostituzioni`}
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {details.starters.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-1.5">
            <RoleBadge role={s.role} />
            <span className="min-w-0 flex-1">
              <span
                className={`block truncate ${s.sub ? 'text-slate-400 line-through' : ''}`}
              >
                {s.name}
                {s.sub && <span className="no-underline"> (SV)</span>}
              </span>
              {s.sub && (
                <span className="block truncate font-medium text-green-700 dark:text-green-400">
                  ↑ {s.sub.name}
                </span>
              )}
            </span>
            <span
              className={`shrink-0 tabular-nums ${
                s.fantavote === null && !s.sub
                  ? 'text-red-600'
                  : 'font-semibold'
              }`}
            >
              {s.sub
                ? format(s.sub.fantavote)
                : s.fantavote === null
                  ? `SV (${format(s.value)})`
                  : format(s.value)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-right font-bold">Totale {format(points)}</p>
    </div>
  )
}
