import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import { Alert, Card } from '../components/ui'
import { useCurrentLeague } from '../hooks/league'
import { useAsyncData } from '../hooks/useAsyncData'
import { useNow } from '../hooks/useNow'
import {
  formatCountdown,
  formatDeadline,
  isLineupOpen,
  pickCurrentMatchday,
} from '../lib/matchdays'
import { sortStandings, type Standing } from '../lib/standings'
import { supabase } from '../lib/supabase'
import type { Fixture, Matchday } from '../lib/types'

async function loadHome(leagueId: string, userId: string) {
  const [matchdays, lineups, fixtures, members, standings] = await Promise.all([
    supabase
      .from('matchdays')
      .select('id, league_id, number, deadline, status')
      .eq('league_id', leagueId),
    supabase
      .from('lineups')
      .select('matchday_id')
      .eq('league_id', leagueId)
      .eq('user_id', userId),
    supabase
      .from('fixtures')
      .select(
        'id, matchday_id, home_user_id, away_user_id, home_points, away_points, home_goals, away_goals',
      )
      .eq('league_id', leagueId)
      .or(`home_user_id.eq.${userId},away_user_id.eq.${userId}`),
    supabase
      .from('league_members')
      .select('user_id, team_name')
      .eq('league_id', leagueId),
    supabase.from('standings').select('*').eq('league_id', leagueId),
  ])
  for (const r of [matchdays, lineups, fixtures, members, standings])
    if (r.error) throw r.error
  return {
    standings: sortStandings(standings.data as Standing[]),
    matchdays: matchdays.data as Matchday[],
    withLineup: new Set(
      (lineups.data as { matchday_id: string }[]).map((l) => l.matchday_id),
    ),
    fixtures: fixtures.data as Fixture[],
    teams: new Map(
      (members.data as { user_id: string; team_name: string }[]).map((m) => [
        m.user_id,
        m.team_name,
      ]),
    ),
  }
}

export default function Home() {
  const { league, membership, isAdmin } = useCurrentLeague()
  const now = useNow(1000)
  const loader = useCallback(
    () => loadHome(league.id, membership.user_id),
    [league.id, membership.user_id],
  )
  const { data, error } = useAsyncData(loader)

  const matchday = data ? pickCurrentMatchday(data.matchdays, now) : null
  const open = matchday ? isLineupOpen(matchday, now) : false
  const hasLineup = matchday ? data!.withLineup.has(matchday.id) : false
  const fixture = matchday
    ? data!.fixtures.find((f) => f.matchday_id === matchday.id)
    : undefined
  const opponentId = fixture
    ? fixture.home_user_id === membership.user_id
      ? fixture.away_user_id
      : fixture.home_user_id
    : null

  return (
    <section className="space-y-4">
      <PageTitle>Ciao, {membership.team_name}!</PageTitle>

      {error && <Alert>{error}</Alert>}

      <Card
        title={matchday ? `Giornata ${matchday.number}` : 'Prossima giornata'}
      >
        {!data ? (
          <p className="text-slate-500 dark:text-slate-400">Caricamento…</p>
        ) : !matchday ? (
          <p className="text-slate-500 dark:text-slate-400">
            Nessuna giornata in programma per ora.{' '}
            {isAdmin && (
              <Link
                to="/admin"
                className="font-semibold text-green-700 underline dark:text-green-400"
              >
                Crea una giornata
              </Link>
            )}
          </p>
        ) : (
          <div className="space-y-3">
            {opponentId && (
              <p>
                {fixture!.home_user_id === membership.user_id
                  ? 'In casa contro '
                  : 'In trasferta contro '}
                <strong>{data.teams.get(opponentId)}</strong>
              </p>
            )}
            {open ? (
              <>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Scadenza formazione: {formatDeadline(matchday.deadline)}
                </p>
                <p className="text-3xl font-bold tabular-nums">
                  {formatCountdown(
                    new Date(matchday.deadline).getTime() - now.getTime(),
                  )}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Formazioni chiuse ({formatDeadline(matchday.deadline)})
              </p>
            )}
            <p
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                hasLineup
                  ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
                  : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
              }`}
            >
              {hasLineup ? '✓ Formazione inserita' : '✗ Formazione mancante'}
            </p>
            <Link
              to="/formazione"
              className="flex min-h-11 items-center justify-center rounded-xl bg-green-600 px-4 font-semibold text-white"
            >
              {open
                ? hasLineup
                  ? 'Modifica formazione'
                  : 'Inserisci formazione'
                : 'Vedi formazioni'}
            </Link>
          </div>
        )}
      </Card>

      {data && data.standings.length > 0 && (
        <Card title="Classifica">
          {data.standings.every((s) => s.played === 0) ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              La classifica parte dopo la prima giornata calcolata.
            </p>
          ) : (
            <ol className="space-y-1 text-sm">
              {data.standings.slice(0, 6).map((s, i) => (
                <li
                  key={s.user_id}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                    s.user_id === membership.user_id
                      ? 'bg-green-50 font-semibold dark:bg-green-950/50'
                      : ''
                  }`}
                >
                  <span className="w-5 text-slate-500">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{s.team_name}</span>
                  <span className="font-bold tabular-nums">{s.points} pt</span>
                </li>
              ))}
            </ol>
          )}
          <Link
            to="/classifica"
            className="mt-2 inline-block text-sm font-semibold text-green-700 underline dark:text-green-400"
          >
            Classifica completa e risultati
          </Link>
        </Card>
      )}

      {isAdmin && (
        <Card title="Invita gli amici">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Codice invito di {league.name}:{' '}
            <span className="font-semibold tracking-widest text-slate-900 dark:text-slate-100">
              {league.invite_code}
            </span>
          </p>
          <Link
            to="/profilo"
            className="mt-2 inline-block text-sm font-semibold text-green-700 underline dark:text-green-400"
          >
            Copia o rigenera il codice
          </Link>
        </Card>
      )}
    </section>
  )
}
