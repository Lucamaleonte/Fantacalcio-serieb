import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import StandingsTabs from '../components/StandingsTabs'
import { Alert, Button, Card } from '../components/ui'
import { useCurrentLeague } from '../hooks/league'
import { useAsyncData } from '../hooks/useAsyncData'
import { useNow } from '../hooks/useNow'
import { calendarTeams, pairingsForRound } from '../lib/calendar'
import {
  formatDeadline,
  pickCurrentMatchday,
  STATUS_LABELS,
} from '../lib/matchdays'
import { supabase } from '../lib/supabase'
import type { Fixture, Matchday } from '../lib/types'

// Giornate mostrate anche se non ancora create: la lega parte dalla 6ª
// giornata di Serie B e finisce con la 38ª, quindi 33 giornate
const SEASON_ROUNDS = 33

interface Match {
  // Solo per le giornate già create
  fixtureId: string | null
  home: string
  away: string
  homeGoals: number | null
  awayGoals: number | null
}

interface Round {
  number: number
  matchday: Matchday | null
  matches: Match[]
}

async function loadCalendario(leagueId: string) {
  const [matchdays, fixtures, members] = await Promise.all([
    supabase
      .from('matchdays')
      .select('id, league_id, number, deadline, status')
      .eq('league_id', leagueId),
    supabase
      .from('fixtures')
      .select(
        'id, matchday_id, home_user_id, away_user_id, home_points, away_points, home_goals, away_goals',
      )
      .eq('league_id', leagueId),
    supabase
      .from('league_members')
      .select('user_id, team_name, calendar_position')
      .eq('league_id', leagueId),
  ])
  for (const r of [matchdays, fixtures, members]) if (r.error) throw r.error
  const memberRows = members.data as {
    user_id: string
    team_name: string
    calendar_position: number | null
  }[]
  return {
    matchdays: matchdays.data as Matchday[],
    fixtures: fixtures.data as Fixture[],
    teamOrder: calendarTeams(memberRows),
    teams: new Map(memberRows.map((m) => [m.user_id, m.team_name])),
  }
}

// Giornate create: partite salvate nel database.
// Giornate future: accoppiamenti calcolati dal sorteggio.
function buildRounds(data: Awaited<ReturnType<typeof loadCalendario>>) {
  const byNumber = new Map(data.matchdays.map((m) => [m.number, m]))
  const last = Math.max(
    data.teamOrder.length >= 2 ? SEASON_ROUNDS : 0,
    ...data.matchdays.map((m) => m.number),
  )
  const rounds: Round[] = []
  for (let n = 1; n <= last; n++) {
    const matchday = byNumber.get(n) ?? null
    const matches: Match[] = matchday
      ? data.fixtures
          .filter((f) => f.matchday_id === matchday.id)
          .map((f) => ({
            fixtureId: f.id,
            home: f.home_user_id,
            away: f.away_user_id,
            homeGoals: f.home_goals,
            awayGoals: f.away_goals,
          }))
      : pairingsForRound(data.teamOrder, n).map((p) => ({
          fixtureId: null,
          ...p,
          homeGoals: null,
          awayGoals: null,
        }))
    rounds.push({ number: n, matchday, matches })
  }
  return rounds
}

function roundStatus(matchday: Matchday | null): string {
  if (!matchday) return 'Da creare'
  if (matchday.status === 'scored') return STATUS_LABELS.scored
  return `Scadenza ${formatDeadline(matchday.deadline)}`
}

function score(m: Match): string | null {
  return m.homeGoals === null || m.awayGoals === null
    ? null
    : `${m.homeGoals} - ${m.awayGoals}`
}

// Partita di una giornata già creata: apre la sfida con le formazioni
function MatchLink({
  fixtureId,
  className,
  children,
}: {
  fixtureId: string | null
  className: string
  children: ReactNode
}) {
  return fixtureId ? (
    <Link to={`/partita/${fixtureId}`} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  )
}

type View = 'mine' | 'all'

export default function Calendario() {
  const { league, membership } = useCurrentLeague()
  const now = useNow(60_000)
  const loader = useCallback(() => loadCalendario(league.id), [league.id])
  const { data, error, loading, reload } = useAsyncData(loader)
  const [view, setView] = useState<View>('mine')

  const me = membership.user_id
  const rounds = data ? buildRounds(data) : []
  // Giornata da evidenziare: quella in corso, o la successiva all'ultima calcolata
  const picked = data ? pickCurrentMatchday(data.matchdays, now) : null
  const current = !data
    ? null
    : !picked
      ? 1
      : picked.status === 'scored'
        ? picked.number + 1
        : picked.number
  const inCalendar = data?.teamOrder.includes(me) ?? false

  // All'apertura e al cambio di vista: porta in vista la giornata corrente
  useEffect(() => {
    if (current === null) return
    document
      .getElementById(`giornata-${current}`)
      ?.scrollIntoView({ block: 'center' })
  }, [current, view])

  const name = (userId: string) => data?.teams.get(userId) ?? '?'

  return (
    <section className="space-y-4">
      <PageTitle>Calendario</PageTitle>
      <StandingsTabs />

      {error && (
        <div className="space-y-2">
          <Alert>{error}</Alert>
          <Button variant="secondary" onClick={reload}>
            Riprova
          </Button>
        </div>
      )}
      {loading && (
        <p className="text-slate-500 dark:text-slate-400">Caricamento…</p>
      )}

      {data &&
        (rounds.length === 0 ? (
          <Alert kind="info">
            Il calendario non è ancora stato sorteggiato.
          </Alert>
        ) : (
          <>
            <div
              className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800"
              role="tablist"
            >
              {(
                [
                  ['mine', 'Le mie partite'],
                  ['all', 'Tutte le partite'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={`min-h-11 rounded-lg text-sm font-semibold ${
                    view === id
                      ? 'bg-white shadow dark:bg-slate-950'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {!inCalendar && (
              <Alert kind="info">
                La tua squadra non è ancora nel calendario: l'admin deve
                rigenerarlo.
              </Alert>
            )}

            {view === 'mine' ? (
              <ol className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {rounds.map((r) => {
                  const m = r.matches.find(
                    (x) => x.home === me || x.away === me,
                  )
                  const isCurrent = r.number === current
                  return (
                    <li
                      key={r.number}
                      id={`giornata-${r.number}`}
                      className={
                        isCurrent ? 'bg-green-50 dark:bg-green-950/50' : ''
                      }
                    >
                      <MatchLink
                        fixtureId={m?.fixtureId ?? null}
                        className="flex min-h-14 items-center gap-3 px-3 py-2 text-sm"
                      >
                        <span className="w-8 shrink-0 font-bold text-slate-500">
                          G{r.number}
                        </span>
                        <span className="min-w-0 flex-1">
                          {m ? (
                            <>
                              <span className="block truncate font-semibold">
                                {m.home === me ? 'vs ' : '@ '}
                                {name(m.home === me ? m.away : m.home)}
                              </span>
                              <span className="block text-xs text-slate-500 dark:text-slate-400">
                                {m.home === me ? 'In casa' : 'In trasferta'} ·{' '}
                                {roundStatus(r.matchday)}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-500 dark:text-slate-400">
                              {inCalendar && r.matches.length > 0
                                ? 'Riposo'
                                : 'Nessuna partita'}
                            </span>
                          )}
                        </span>
                        {m && score(m) && (
                          <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 font-bold tabular-nums dark:bg-slate-800">
                            {m.home === me
                              ? score(m)
                              : `${m.awayGoals} - ${m.homeGoals}`}
                          </span>
                        )}
                        {m?.fixtureId && (
                          <span className="shrink-0 text-lg text-slate-400">
                            ›
                          </span>
                        )}
                      </MatchLink>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <div className="space-y-3">
                {rounds.map((r) => (
                  <div
                    key={r.number}
                    id={`giornata-${r.number}`}
                    className={
                      r.number === current
                        ? 'rounded-2xl ring-2 ring-green-600'
                        : ''
                    }
                  >
                    <Card title={`Giornata ${r.number}`}>
                      <p className="-mt-2 mb-3 text-xs text-slate-500 dark:text-slate-400">
                        {roundStatus(r.matchday)}
                      </p>
                      {r.matches.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Nessuna partita.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {r.matches.map((m) => {
                            const mine = m.home === me || m.away === me
                            return (
                              <li key={m.home}>
                                <MatchLink
                                  fixtureId={m.fixtureId}
                                  className={`grid min-h-11 grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg px-1 py-1 text-sm ${
                                    mine
                                      ? 'bg-green-50 font-semibold dark:bg-green-950/50'
                                      : ''
                                  }`}
                                >
                                  <span className="truncate text-right">
                                    {name(m.home)}
                                  </span>
                                  <span className="min-w-12 rounded-lg bg-slate-100 px-2 py-1 text-center font-bold tabular-nums dark:bg-slate-800">
                                    {score(m) ?? '-'}
                                  </span>
                                  <span className="truncate">
                                    {name(m.away)}
                                  </span>
                                </MatchLink>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </Card>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Le giornate future seguono il sorteggio: se l'admin rigenera il
              calendario, cambiano solo quelle non ancora calcolate.
            </p>
          </>
        ))}
    </section>
  )
}
