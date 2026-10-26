import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import TeamLogo from '../components/TeamLogo'
import { Alert, Card } from '../components/ui'
import { useCurrentLeague } from '../hooks/league'
import { useAsyncData } from '../hooks/useAsyncData'
import { useNow } from '../hooks/useNow'
import { calendarTeams, pairingsForRound, SEASON_ROUNDS } from '../lib/calendar'
import {
  formatCountdown,
  formatDeadline,
  isLineupOpen,
  roundAfterLastScored,
} from '../lib/matchdays'
import { sortStandings, type Standing } from '../lib/standings'
import { supabase } from '../lib/supabase'
import type { Fixture, Matchday } from '../lib/types'

async function loadHome(leagueId: string, userId: string) {
  const [matchdays, lineups, fixtures, members, standings, trades] =
    await Promise.all([
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
        .select('user_id, team_name, logo_path, calendar_position')
        .eq('league_id', leagueId),
      supabase.from('standings').select('*').eq('league_id', leagueId),
      // Proposte di scambio da valutare
      supabase
        .from('trades')
        .select('id')
        .eq('league_id', leagueId)
        .eq('receiver_id', userId)
        .eq('status', 'pending'),
    ])
  for (const r of [matchdays, lineups, fixtures, members, standings, trades])
    if (r.error) throw r.error
  return {
    pendingTrades: (trades.data as { id: string }[]).length,
    teamOrder: calendarTeams(
      members.data as { user_id: string; calendar_position: number | null }[],
    ),
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
    logos: new Map(
      (members.data as { user_id: string; logo_path: string | null }[]).map(
        (m) => [m.user_id, m.logo_path],
      ),
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

  const me = membership.user_id
  // Giornata mostrata: la successiva all'ultima calcolata, anche se l'admin
  // non l'ha ancora creata (avversario preso dal sorteggio del calendario)
  const round = data ? roundAfterLastScored(data.matchdays) : null
  const lastRound = data
    ? Math.max(
        data.teamOrder.length >= 2 ? SEASON_ROUNDS : 0,
        ...data.matchdays.map((m) => m.number),
      )
    : 0
  const seasonOver = round !== null && lastRound > 0 && round > lastRound
  const matchday =
    data?.matchdays.find((m) => m.number === round && !seasonOver) ?? null
  const open = matchday ? isLineupOpen(matchday, now) : false
  const hasLineup = matchday ? data!.withLineup.has(matchday.id) : false
  const fixture = matchday
    ? data!.fixtures.find((f) => f.matchday_id === matchday.id)
    : undefined
  const pairing =
    data && round !== null && !matchday && !seasonOver
      ? pairingsForRound(data.teamOrder, round).find(
          (p) => p.home === me || p.away === me,
        )
      : undefined
  const homeId = fixture?.home_user_id ?? pairing?.home ?? null
  const awayId = fixture?.away_user_id ?? pairing?.away ?? null
  const opponentId = homeId === me ? awayId : homeId

  return (
    <section className="space-y-4">
      <PageTitle>Ciao, {membership.team_name}!</PageTitle>

      {error && <Alert>{error}</Alert>}

      <Card
        title={
          round !== null && !seasonOver
            ? `Giornata ${round}`
            : 'Prossima giornata'
        }
      >
        {!data ? (
          <p className="text-slate-500 dark:text-slate-400">Caricamento…</p>
        ) : seasonOver ? (
          <p className="text-slate-500 dark:text-slate-400">
            Campionato concluso: tutte le giornate sono state calcolate.
          </p>
        ) : !matchday ? (
          <div className="space-y-3">
            {opponentId && (
              <OpponentLine
                opponentName={data.teams.get(opponentId) ?? ''}
                opponentLogo={data.logos.get(opponentId)}
                atHome={homeId === me}
              />
            )}
            <p className="text-sm text-slate-500 dark:text-slate-400">
              La giornata non è ancora stata aperta: si potrà inserire la
              formazione quando l'admin la crea.{' '}
              {isAdmin && (
                <Link
                  to="/admin"
                  className="font-semibold text-green-700 underline dark:text-green-400"
                >
                  Crea la giornata
                </Link>
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {opponentId && (
              <OpponentLine
                opponentName={data.teams.get(opponentId) ?? ''}
                opponentLogo={data.logos.get(opponentId)}
                atHome={homeId === me}
                fixtureId={fixture?.id}
              />
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
        {data && (
          <Link
            to="/calendario"
            className="mt-3 inline-block text-sm font-semibold text-green-700 underline dark:text-green-400"
          >
            Calendario completo
          </Link>
        )}
      </Card>

      {data && (league.trade_market_open || data.pendingTrades > 0) && (
        <Card title="Mercato scambi">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {data.pendingTrades > 0
              ? `Hai ${data.pendingTrades} ${data.pendingTrades === 1 ? 'proposta' : 'proposte'} di scambio da valutare.`
              : 'Il mercato è aperto: puoi proporre scambi alle altre squadre.'}
          </p>
          <Link
            to="/mercato"
            className="mt-2 inline-block text-sm font-semibold text-green-700 underline dark:text-green-400"
          >
            Vai al mercato
          </Link>
        </Card>
      )}

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
                  <TeamLogo
                    path={data.logos.get(s.user_id)}
                    name={s.team_name}
                    size="xs"
                  />
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

function OpponentLine({
  opponentName,
  opponentLogo,
  atHome,
  fixtureId,
}: {
  opponentName: string
  opponentLogo: string | null | undefined
  atHome: boolean
  fixtureId?: string
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <TeamLogo path={opponentLogo} name={opponentName} size="md" />
      {atHome ? 'In casa contro ' : 'In trasferta contro '}
      <strong>{opponentName}</strong>
      {fixtureId && (
        <>
          {' · '}
          <Link
            to={`/partita/${fixtureId}`}
            className="font-semibold text-green-700 underline dark:text-green-400"
          >
            Vedi la sfida
          </Link>
        </>
      )}
    </p>
  )
}
