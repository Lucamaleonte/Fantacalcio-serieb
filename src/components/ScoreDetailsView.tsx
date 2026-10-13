import type { ScoreDetails } from '../lib/scoring'
import type { VoteEvents } from '../lib/voteEvents'
import EventIcons from './EventIcons'
import { RoleBadge } from './ui'

function format(value: number | null): string {
  return value === null ? 'SV' : String(value).replace('.', ',')
}

// Voto base e bonus/malus per giocatore (se disponibili)
export type VoteInfo = Map<
  string,
  { vote: number | null; events?: VoteEvents | null }
>

// Dettaglio del punteggio: titolari, voti usati e sostituzioni
export default function ScoreDetailsView({
  details,
  points,
  votes,
}: {
  details: ScoreDetails
  points: number
  votes?: VoteInfo
}) {
  if (details.missing) {
    return (
      <p className="text-sm text-red-600">Formazione non inserita: 0 punti.</p>
    )
  }

  const baseVote = (id: string) => (
    <span className="w-8 shrink-0 text-right text-slate-500 tabular-nums dark:text-slate-400">
      {format(votes?.get(id)?.vote ?? null)}
    </span>
  )

  return (
    <div className="text-sm">
      <p className="mb-2 flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <span className="flex-1">
          Modulo {details.formation} ·{' '}
          {details.substitutions === 1
            ? '1 sostituzione'
            : `${details.substitutions} sostituzioni`}
        </span>
        {votes && (
          <>
            <span className="w-8 text-right text-xs" title="Voto base">
              V
            </span>
            <span className="w-12 text-right text-xs" title="Fantavoto">
              FV
            </span>
          </>
        )}
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {details.starters.map((s) => {
          const shown = s.sub ? s.sub.id : s.id
          return (
            <li key={s.id} className="flex items-center gap-2 py-1.5">
              <RoleBadge role={s.role} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span
                    className={`truncate ${s.sub ? 'text-slate-400 line-through' : ''}`}
                  >
                    {s.name}
                    {s.sub && <span className="no-underline"> (SV)</span>}
                  </span>
                  {!s.sub && <EventIcons events={votes?.get(s.id)?.events} />}
                </span>
                {s.sub && (
                  <span className="flex items-center gap-1 font-medium text-green-700 dark:text-green-400">
                    <span className="truncate">↑ {s.sub.name}</span>
                    <EventIcons events={votes?.get(s.sub.id)?.events} />
                  </span>
                )}
              </span>
              {votes && baseVote(shown)}
              <span
                className={`shrink-0 text-right tabular-nums ${votes ? 'w-12' : ''} ${
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
          )
        })}
      </ul>
      <p className="mt-2 text-right font-bold">Totale {format(points)}</p>
    </div>
  )
}
