import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import ScoreDetailsView from '../components/ScoreDetailsView'
import StandingsTabs from '../components/StandingsTabs'
import { Alert, Button, Card, Select, Sheet } from '../components/ui'
import { useCurrentLeague } from '../hooks/league'
import { useAsyncData } from '../hooks/useAsyncData'
import type { ScoreDetails } from '../lib/scoring'
import { sortStandings, type Standing } from '../lib/standings'
import { supabase } from '../lib/supabase'
import type { Fixture, Matchday } from '../lib/types'

function formatPoints(value: number | string | null): string {
  return value === null ? '–' : String(Number(value)).replace('.', ',')
}

async function loadClassifica(leagueId: string) {
  const [standings, matchdays] = await Promise.all([
    supabase.from('standings').select('*').eq('league_id', leagueId),
    supabase
      .from('matchdays')
      .select('id, league_id, number, deadline, status')
      .eq('league_id', leagueId)
      .eq('status', 'scored')
      .order('number', { ascending: false }),
  ])
  if (standings.error) throw standings.error
  if (matchdays.error) throw matchdays.error
  return {
    standings: sortStandings(standings.data as Standing[]),
    matchdays: matchdays.data as Matchday[],
  }
}

export default function Classifica() {
  const { league, membership } = useCurrentLeague()
  const loader = useCallback(() => loadClassifica(league.id), [league.id])
  const { data, error, loading, reload } = useAsyncData(loader)
  const [matchdayId, setMatchdayId] = useState<string | null>(null)

  const selected =
    data?.matchdays.find((m) => m.id === matchdayId) ?? data?.matchdays[0]

  return (
    <section className="space-y-4">
      <PageTitle>Classifica</PageTitle>
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

      {data && (
        <>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[22rem] border-separate border-spacing-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm dark:border-slate-800 dark:bg-slate-900">
              <thead className="bg-slate-100 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Squadra</th>
                  <th className="px-2 py-2" title="Punti">
                    Pt
                  </th>
                  <th className="px-1 py-2" title="Giocate">
                    G
                  </th>
                  <th className="px-1 py-2" title="Vinte">
                    V
                  </th>
                  <th className="px-1 py-2" title="Pareggiate">
                    N
                  </th>
                  <th className="px-1 py-2" title="Perse">
                    P
                  </th>
                  <th className="px-1 py-2" title="Gol fatti e subiti">
                    Gol
                  </th>
                  <th
                    className="px-2 py-2 text-right"
                    title="Fantapunti totali"
                  >
                    FP
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.standings.map((s, i) => (
                  <tr
                    key={s.user_id}
                    className={
                      s.user_id === membership.user_id
                        ? 'bg-green-50 dark:bg-green-950/50'
                        : ''
                    }
                  >
                    <td className="border-t border-slate-100 px-2 py-2.5 text-slate-500 dark:border-slate-800">
                      {i + 1}
                    </td>
                    <td className="max-w-[9rem] truncate border-t border-slate-100 px-2 py-2.5 font-semibold dark:border-slate-800">
                      {s.team_name}
                    </td>
                    <td className="border-t border-slate-100 px-2 py-2.5 text-center text-base font-bold dark:border-slate-800">
                      {s.points}
                    </td>
                    {[s.played, s.won, s.drawn, s.lost].map((v, k) => (
                      <td
                        key={k}
                        className="border-t border-slate-100 px-1 py-2.5 text-center tabular-nums dark:border-slate-800"
                      >
                        {v}
                      </td>
                    ))}
                    <td className="border-t border-slate-100 px-1 py-2.5 text-center whitespace-nowrap tabular-nums dark:border-slate-800">
                      {s.goals_for}-{s.goals_against}
                    </td>
                    <td className="border-t border-slate-100 px-2 py-2.5 text-right tabular-nums dark:border-slate-800">
                      {formatPoints(s.fantapoints)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Vittoria 3, pareggio 1, sconfitta 0. A parità di punti: fantapunti
            totali, poi differenza reti.
          </p>

          {data.matchdays.length === 0 ? (
            <Alert kind="info">Nessuna giornata ancora calcolata.</Alert>
          ) : (
            <>
              <Select
                aria-label="Giornata"
                value={selected!.id}
                onChange={(e) => setMatchdayId(e.target.value)}
              >
                {data.matchdays.map((m) => (
                  <option key={m.id} value={m.id}>
                    {`Giornata ${m.number}`}
                  </option>
                ))}
              </Select>
              <MatchdayResults
                key={selected!.id}
                matchday={selected!}
                leagueId={league.id}
              />
            </>
          )}
        </>
      )}
    </section>
  )
}

async function loadResults(matchdayId: string, leagueId: string) {
  const [fixtures, scores, members] = await Promise.all([
    supabase
      .from('fixtures')
      .select(
        'id, matchday_id, home_user_id, away_user_id, home_points, away_points, home_goals, away_goals',
      )
      .eq('matchday_id', matchdayId),
    supabase
      .from('matchday_scores')
      .select('user_id, points, details')
      .eq('matchday_id', matchdayId),
    supabase
      .from('league_members')
      .select('user_id, team_name')
      .eq('league_id', leagueId),
  ])
  for (const r of [fixtures, scores, members]) if (r.error) throw r.error
  return {
    fixtures: fixtures.data as Fixture[],
    scores: new Map(
      (
        scores.data as {
          user_id: string
          points: number
          details: ScoreDetails
        }[]
      ).map((s) => [s.user_id, s]),
    ),
    teams: new Map(
      (members.data as { user_id: string; team_name: string }[]).map((m) => [
        m.user_id,
        m.team_name,
      ]),
    ),
  }
}

function MatchdayResults({
  matchday,
  leagueId,
}: {
  matchday: Matchday
  leagueId: string
}) {
  const loader = useCallback(
    () => loadResults(matchday.id, leagueId),
    [matchday.id, leagueId],
  )
  const { data, error } = useAsyncData(loader)
  const [open, setOpen] = useState<string | null>(null)
  const closeSheet = useCallback(() => setOpen(null), [])

  if (error) return <Alert>{error}</Alert>
  if (!data)
    return <p className="text-slate-500 dark:text-slate-400">Caricamento…</p>

  const opened = open ? data.scores.get(open) : undefined

  const TeamButton = ({
    userId,
    align,
  }: {
    userId: string
    align: 'left' | 'right'
  }) => (
    <button
      type="button"
      onClick={() => setOpen(userId)}
      className={`min-h-11 truncate font-semibold text-green-700 underline decoration-dotted dark:text-green-400 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {data.teams.get(userId)}
    </button>
  )

  return (
    <Card title={`Risultati giornata ${matchday.number}`}>
      {data.fixtures.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nessuna partita.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.fixtures.map((f) => (
            <li
              key={f.id}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm"
            >
              <TeamButton userId={f.home_user_id} align="right" />
              <Link
                to={`/partita/${f.id}`}
                aria-label="Apri la sfida"
                className="flex min-h-11 items-center rounded-lg bg-slate-100 px-2 text-center text-base font-bold tabular-nums dark:bg-slate-800"
              >
                {f.home_goals ?? '–'} - {f.away_goals ?? '–'} ›
              </Link>
              <TeamButton userId={f.away_user_id} align="left" />
              <span className="text-right text-xs text-slate-500">
                {formatPoints(f.home_points)}
              </span>
              <span />
              <span className="text-xs text-slate-500">
                {formatPoints(f.away_points)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Tocca una squadra per vedere titolari, voti e sostituzioni, o il
        risultato per vedere la sfida con le due formazioni.
      </p>

      {open && (
        <Sheet title={data.teams.get(open) ?? ''} onClose={closeSheet}>
          {opened ? (
            <ScoreDetailsView
              details={opened.details}
              points={Number(opened.points)}
            />
          ) : (
            <p className="text-sm text-slate-500">
              Nessun punteggio per questa squadra.
            </p>
          )}
        </Sheet>
      )}
    </Card>
  )
}
