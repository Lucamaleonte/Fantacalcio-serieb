import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ScoreDetailsView from '../../components/ScoreDetailsView'
import { Alert, Button, Card } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import {
  buildLineup,
  pointsToGoals,
  scoreTeam,
  type Fantavotes,
  type LineupPlayer,
} from '../../lib/scoring'
import { supabase } from '../../lib/supabase'
import type { League } from '../../lib/types'
import type { MatchdayData } from './matchdayData'

function formatPoints(value: number): string {
  return String(value).replace('.', ',')
}

export default function MatchdayCalc({
  league,
  data,
  now,
  onSaved,
}: {
  league: League
  data: MatchdayData
  now: Date
  onSaved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const deadlinePassed =
    now.getTime() >= new Date(data.matchday.deadline).getTime()

  const results = useMemo(() => {
    const players = new Map<string, LineupPlayer>(
      data.players.map((p) => [p.id, p]),
    )
    const fantavotes: Fantavotes = new Map(
      [...data.votes].map(([id, v]) => [id, v.fantavote]),
    )
    const rules = {
      maxSubstitutions: league.max_substitutions,
      noVoteValue: Number(league.no_vote_value),
    }
    return data.teams.map((t) => {
      const row = data.lineups.find((l) => l.user_id === t.user_id)
      const lineup = row
        ? buildLineup(row.formation, row.lineup_players, players)
        : null
      return { ...t, ...scoreTeam(lineup, fantavotes, rules) }
    })
  }, [data, league])

  // Giocatori schierati senza nessuna riga di voto (né voto né SV importato)
  const withoutVoteRow = useMemo(() => {
    const ids = new Set<string>()
    for (const l of data.lineups)
      for (const p of l.lineup_players) ids.add(p.player_id)
    return [...ids].filter((id) => !data.votes.has(id)).length
  }, [data])

  const pointsOf = (userId: string) =>
    results.find((r) => r.user_id === userId)?.points ?? 0
  const nameOf = (userId: string) =>
    data.teams.find((t) => t.user_id === userId)?.team_name ?? '?'
  const goals = (points: number) =>
    pointsToGoals(
      points,
      Number(league.goal_threshold),
      Number(league.goal_step),
    )

  async function handleSave() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('save_matchday_results', {
      p_matchday_id: data.matchday.id,
      p_scores: results.map((r) => ({
        user_id: r.user_id,
        points: r.points,
        details: r.details,
      })),
    })
    if (error) {
      setError(errorMessage(error))
    } else {
      setSaved(true)
      onSaved()
    }
    setBusy(false)
  }

  if (!deadlinePassed) {
    return (
      <Alert kind="info">
        Il calcolo è disponibile dopo la scadenza delle formazioni. Intanto puoi
        già importare i voti.
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      {data.votes.size === 0 ? (
        <Alert>
          Nessun voto inserito per questa giornata: tutte le squadre farebbero
          0.
        </Alert>
      ) : (
        withoutVoteRow > 0 && (
          <Alert kind="info">
            {withoutVoteRow === 1
              ? '1 giocatore schierato non ha nessun voto inserito e conta come SV.'
              : `${withoutVoteRow} giocatori schierati non hanno nessun voto inserito e contano come SV.`}{' '}
            Se è un errore, correggilo in &quot;A mano&quot;.
          </Alert>
        )
      )}

      {data.fixtures.length > 0 && (
        <Card title="Risultati">
          <ul className="space-y-2">
            {data.fixtures.map((f) => {
              const hp = pointsOf(f.home_user_id)
              const ap = pointsOf(f.away_user_id)
              return (
                <li
                  key={f.id}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm"
                >
                  <span className="truncate text-right font-semibold">
                    {nameOf(f.home_user_id)}
                  </span>
                  <span className="rounded-lg bg-slate-100 px-2 py-1 text-center font-bold tabular-nums dark:bg-slate-800">
                    {goals(hp)} - {goals(ap)}
                  </span>
                  <span className="truncate font-semibold">
                    {nameOf(f.away_user_id)}
                  </span>
                  <span className="text-right text-xs text-slate-500">
                    {formatPoints(hp)}
                  </span>
                  <span />
                  <span className="text-xs text-slate-500">
                    {formatPoints(ap)}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card title="Punteggi">
        <ul className="space-y-2">
          {[...results]
            .sort((a, b) => b.points - a.points)
            .map((r) => (
              <li key={r.user_id}>
                <details className="rounded-xl border border-slate-200 dark:border-slate-800">
                  <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-3">
                    <span className="truncate font-semibold">
                      {r.team_name}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {r.details.missing ? (
                        <span className="text-red-600">
                          senza formazione · 0
                        </span>
                      ) : (
                        <strong>{formatPoints(r.points)}</strong>
                      )}
                    </span>
                  </summary>
                  <div className="px-3 pb-3">
                    <ScoreDetailsView details={r.details} points={r.points} />
                  </div>
                </details>
              </li>
            ))}
        </ul>
      </Card>

      {error && <Alert>{error}</Alert>}
      {saved && (
        <Alert kind="success">
          Risultati salvati.{' '}
          <Link to="/classifica" className="font-semibold underline">
            Vai alla classifica
          </Link>
        </Alert>
      )}

      <Button className="w-full" loading={busy} onClick={handleSave}>
        {data.matchday.status === 'scored'
          ? 'Ricalcola e salva'
          : 'Salva risultati'}
      </Button>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        Si può ricalcolare quando vuoi (es. dopo una correzione dei voti): i
        punteggi vengono sovrascritti.
      </p>
    </div>
  )
}
