import { useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import TeamLogo from '../components/TeamLogo'
import { Alert, Button, Card, RoleBadge } from '../components/ui'
import { useCurrentLeague } from '../hooks/league'
import { useAsyncData } from '../hooks/useAsyncData'
import { useNow } from '../hooks/useNow'
import {
  formatCountdown,
  formatDeadline,
  isLineupOpen,
  STATUS_LABELS,
} from '../lib/matchdays'
import { comparePlayers } from '../lib/roles'
import type { ScoreDetails } from '../lib/scoring'
import { supabase } from '../lib/supabase'
import type { Fixture, Matchday, Player } from '../lib/types'

type LineupPlayer = Pick<Player, 'id' | 'name' | 'role' | 'real_team'>

interface TeamLineup {
  formation: string
  starters: LineupPlayer[]
  bench: LineupPlayer[]
}

interface TeamScore {
  points: number
  details: ScoreDetails
}

async function loadPartita(fixtureId: string, leagueId: string) {
  const fixture = await supabase
    .from('fixtures')
    .select(
      'id, matchday_id, home_user_id, away_user_id, home_points, away_points, home_goals, away_goals, matchday:matchdays(id, league_id, number, deadline, status)',
    )
    .eq('id', fixtureId)
    .maybeSingle()
  if (fixture.error) throw fixture.error
  if (!fixture.data) return null
  const f = fixture.data as unknown as Fixture & { matchday: Matchday }
  const users = [f.home_user_id, f.away_user_id]

  // Le policy restituiscono solo le formazioni visibili all'utente
  const [members, lineups, scores] = await Promise.all([
    supabase
      .from('league_members')
      .select('user_id, team_name, logo_path')
      .eq('league_id', leagueId)
      .in('user_id', users),
    supabase
      .from('lineups')
      .select(
        'user_id, formation, lineup_players(slot, position, player:players(id, name, role, real_team))',
      )
      .eq('matchday_id', f.matchday_id)
      .in('user_id', users),
    supabase
      .from('matchday_scores')
      .select('user_id, points, details')
      .eq('matchday_id', f.matchday_id)
      .in('user_id', users),
  ])
  for (const r of [members, lineups, scores]) if (r.error) throw r.error

  const lineupRows = lineups.data as unknown as {
    user_id: string
    formation: string
    lineup_players: { slot: string; position: number; player: LineupPlayer }[]
  }[]
  const byUser = new Map<string, TeamLineup>()
  for (const l of lineupRows) {
    const rows = [...l.lineup_players].sort((a, b) => a.position - b.position)
    byUser.set(l.user_id, {
      formation: l.formation,
      starters: rows
        .filter((r) => r.slot === 'starter')
        .map((r) => r.player)
        .sort(comparePlayers),
      bench: rows.filter((r) => r.slot === 'bench').map((r) => r.player),
    })
  }

  return {
    fixture: f,
    matchday: f.matchday,
    teams: new Map(
      (
        members.data as {
          user_id: string
          team_name: string
          logo_path: string | null
        }[]
      ).map((m) => [m.user_id, { name: m.team_name, logo: m.logo_path }]),
    ),
    lineups: byUser,
    scores: new Map(
      (
        scores.data as {
          user_id: string
          points: number
          details: ScoreDetails
        }[]
      ).map((s) => [
        s.user_id,
        { points: Number(s.points), details: s.details } as TeamScore,
      ]),
    ),
  }
}

function formatValue(value: number | string | null): string {
  return value === null ? 'SV' : String(Number(value)).replace('.', ',')
}

// Sfida tra due squadre: formazioni affiancate, in sola lettura
export default function Partita() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { league, membership } = useCurrentLeague()
  const now = useNow(1000)
  const loader = useCallback(() => loadPartita(id, league.id), [id, league.id])
  const { data, error, loading, reload } = useAsyncData(loader)

  const back = (
    <button
      type="button"
      onClick={() =>
        history.length > 1 ? navigate(-1) : navigate('/calendario')
      }
      className="text-sm font-semibold text-green-700 dark:text-green-400"
    >
      ‹ Indietro
    </button>
  )

  if (error)
    return (
      <section className="space-y-4">
        {back}
        <Alert>{error}</Alert>
        <Button variant="secondary" onClick={reload}>
          Riprova
        </Button>
      </section>
    )
  if (loading)
    return <p className="text-slate-500 dark:text-slate-400">Caricamento…</p>
  if (!data)
    return (
      <section className="space-y-4">
        {back}
        <Alert>Partita non trovata.</Alert>
      </section>
    )

  const { fixture: f, matchday } = data
  const me = membership.user_id
  const involved = f.home_user_id === me || f.away_user_id === me
  const open = isLineupOpen(matchday, now)
  const scored = matchday.status === 'scored'
  const team = (userId: string) =>
    data.teams.get(userId) ?? { name: '?', logo: null }

  return (
    <section className="space-y-4">
      <div>
        {back}
        <PageTitle>Giornata {matchday.number}</PageTitle>
      </div>

      <Card>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <TeamName {...team(f.home_user_id)} mine={f.home_user_id === me} />
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-center text-xl font-bold tabular-nums dark:bg-slate-800">
            {scored ? `${f.home_goals ?? 0} - ${f.away_goals ?? 0}` : 'vs'}
          </span>
          <TeamName {...team(f.away_user_id)} mine={f.away_user_id === me} />
          {scored && (
            <>
              <span className="text-center text-xs text-slate-500">
                {formatValue(f.home_points)}
              </span>
              <span />
              <span className="text-center text-xs text-slate-500">
                {formatValue(f.away_points)}
              </span>
            </>
          )}
        </div>
        <p className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
          {open ? (
            <>
              Scadenza {formatDeadline(matchday.deadline)} · mancano{' '}
              <strong>
                {formatCountdown(
                  new Date(matchday.deadline).getTime() - now.getTime(),
                )}
              </strong>
            </>
          ) : (
            `${STATUS_LABELS[matchday.status]} · scadenza ${formatDeadline(matchday.deadline)}`
          )}
        </p>
      </Card>

      {open && (
        <Alert kind="info">
          Fino alla scadenza le formazioni si possono ancora cambiare.
          {involved && (
            <>
              {' '}
              <Link to="/formazione" className="font-semibold underline">
                Modifica la tua
              </Link>
            </>
          )}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-2">
        {[f.home_user_id, f.away_user_id].map((userId) => (
          <TeamColumn
            key={userId}
            lineup={data.lineups.get(userId) ?? null}
            score={scored ? (data.scores.get(userId) ?? null) : null}
          />
        ))}
      </div>

      {!scored && (
        <Button variant="secondary" className="w-full" onClick={reload}>
          Aggiorna
        </Button>
      )}
    </section>
  )
}

function TeamName({
  name,
  logo,
  mine,
}: {
  name: string
  logo: string | null
  mine: boolean
}) {
  return (
    <span
      className={`flex min-w-0 flex-col items-center gap-2 text-center font-semibold break-words ${
        mine ? 'text-green-700 dark:text-green-400' : ''
      }`}
    >
      <TeamLogo path={logo} name={name} size="lg" />
      {name}
    </span>
  )
}

const columnClass =
  'min-w-0 rounded-2xl border border-slate-200 bg-white p-2 text-sm dark:border-slate-800 dark:bg-slate-900'

function TeamColumn({
  lineup,
  score,
}: {
  lineup: TeamLineup | null
  score: TeamScore | null
}) {
  // Giornata calcolata: titolari con i voti usati e le sostituzioni
  if (score && !score.details.missing && score.details.starters) {
    const d = score.details
    return (
      <div className={columnClass}>
        <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
          {d.formation} · {d.substitutions} sost.
        </p>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {d.starters.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5 py-1">
              <RoleBadge role={s.role} small />
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate ${s.sub ? 'text-slate-400 line-through' : ''}`}
                >
                  {s.name}
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
                {s.sub ? formatValue(s.sub.fantavote) : formatValue(s.value)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-right font-bold">
          Totale {formatValue(score.points)}
        </p>
        {lineup && <Bench players={lineup.bench} />}
      </div>
    )
  }

  if (!lineup) {
    return (
      <div className={columnClass}>
        <p className="text-slate-500 dark:text-slate-400">
          Formazione non inserita
          {score ? ': 0 punti' : ''}.
        </p>
      </div>
    )
  }

  return (
    <div className={columnClass}>
      <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
        Modulo {lineup.formation}
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {lineup.starters.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5 py-1">
            <RoleBadge role={p.role} small />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
          </li>
        ))}
      </ul>
      <Bench players={lineup.bench} />
    </div>
  )
}

function Bench({ players }: { players: LineupPlayer[] }) {
  if (players.length === 0) return null
  return (
    <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
      <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
        Panchina
      </p>
      <ol className="space-y-0.5 text-xs">
        {players.map((p, i) => (
          <li key={p.id} className="flex items-center gap-1.5">
            <span className="w-4 shrink-0 text-right text-slate-400">
              {i + 1}
            </span>
            <span className="w-3 shrink-0 font-bold text-slate-500">
              {p.role}
            </span>
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
