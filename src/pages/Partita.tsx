import { useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import EventIcons from '../components/EventIcons'
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
import type { Fixture, Matchday, Player, PlayerRole } from '../lib/types'
import { eventIcons, type VoteEvents } from '../lib/voteEvents'

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

interface PlayerVote {
  vote: number | null
  fantavote: number | null
  events: VoteEvents
}

type Votes = Map<string, PlayerVote>

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

  // Giornata calcolata: voto base, fantavoto e bonus/malus dei giocatori schierati
  const playerIds = lineupRows.flatMap((l) =>
    l.lineup_players.map((r) => r.player.id),
  )
  const votes = new Map<string, PlayerVote>()
  if (f.matchday.status === 'scored' && playerIds.length > 0) {
    const res = await supabase
      .from('player_votes')
      .select('player_id, vote, fantavote, events')
      .eq('matchday_id', f.matchday_id)
      .in('player_id', playerIds)
    if (res.error) throw res.error
    for (const v of res.data as ({ player_id: string } & PlayerVote)[])
      votes.set(v.player_id, {
        vote: v.vote === null ? null : Number(v.vote),
        fantavote: v.fantavote === null ? null : Number(v.fantavote),
        events: v.events,
      })
  }
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
    votes,
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

      <MatchBoard
        home={buildSide(
          data.lineups.get(f.home_user_id) ?? null,
          scored ? (data.scores.get(f.home_user_id) ?? null) : null,
          data.votes,
        )}
        away={buildSide(
          data.lineups.get(f.away_user_id) ?? null,
          scored ? (data.scores.get(f.away_user_id) ?? null) : null,
          data.votes,
        )}
      />

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

// Mezza riga: un giocatore di una delle due squadre
interface Cell {
  id: string
  name: string
  role: PlayerRole
  // Voto base sopra, fantavoto sotto; null prima del calcolo
  pill: { vote: string; fantavote: string; tone: PillTone } | null
  events?: VoteEvents
  // Testo sotto il nome (es. chi è entrato al suo posto)
  note?: string
  // Non conta nel punteggio: sbiadito
  dim: boolean
  // Entrato dalla panchina: nome in verde
  accent?: boolean
}

type PillTone = 'counted' | 'muted' | 'red'

interface Side {
  info: string | null
  message: string | null
  starters: Cell[]
  bench: Cell[]
  total: number | null
}

function pillValue(value: number | null | undefined): string {
  return value === null || value === undefined ? '–' : formatValue(value)
}

function plainCell(p: LineupPlayer): Cell {
  return { id: p.id, name: p.name, role: p.role, pill: null, dim: false }
}

// Dati di una squadra per la sfida: prima del calcolo solo i nomi,
// dopo il calcolo voto base, fantavoto, bonus/malus e sostituzioni
function buildSide(
  lineup: TeamLineup | null,
  score: TeamScore | null,
  votes: Votes,
): Side {
  if (score && !score.details.missing && score.details.starters) {
    const d = score.details
    const entered = new Set(
      d.starters.flatMap((s) => (s.sub ? [s.sub.id] : [])),
    )
    return {
      info: `${d.formation} · ${d.substitutions === 1 ? '1 sost.' : `${d.substitutions} sost.`}`,
      message: null,
      starters: d.starters.map((s) => {
        const v = votes.get(s.id)
        return s.sub
          ? {
              id: s.id,
              name: s.name,
              role: s.role,
              pill: { vote: '–', fantavote: '–', tone: 'muted' },
              events: v?.events,
              note: `↑ ${s.sub.name}`,
              dim: true,
            }
          : {
              id: s.id,
              name: s.name,
              role: s.role,
              pill: {
                vote: pillValue(v?.vote),
                fantavote: formatValue(s.value),
                tone: s.fantavote === null ? 'red' : 'counted',
              },
              events: v?.events,
              dim: false,
            }
      }),
      bench: (lineup?.bench ?? []).map((p) => {
        const v = votes.get(p.id)
        const inGame = entered.has(p.id)
        return {
          id: p.id,
          name: inGame ? `↑ ${p.name}` : p.name,
          role: p.role,
          pill: {
            vote: pillValue(v?.vote),
            fantavote: pillValue(v?.fantavote),
            tone: inGame ? 'counted' : 'muted',
          },
          events: v?.events,
          accent: inGame,
          dim: !inGame,
        }
      }),
      total: score.points,
    }
  }
  if (!lineup) {
    return {
      info: null,
      message: score
        ? 'Formazione non inserita: 0 punti'
        : 'Formazione non inserita',
      starters: [],
      bench: [],
      total: null,
    }
  }
  return {
    info: `Modulo ${lineup.formation}`,
    message: null,
    starters: lineup.starters.map(plainCell),
    bench: lineup.bench.map(plainCell),
    total: null,
  }
}

function pairs(a: Cell[], b: Cell[]): [Cell | undefined, Cell | undefined][] {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [
    a[i],
    b[i],
  ])
}

// Le due formazioni affiancate a specchio: casa a sinistra, trasferta a
// destra, voti al centro
function MatchBoard({ home, away }: { home: Side; away: Side }) {
  const hasBench = home.bench.length > 0 || away.bench.length > 0
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2 text-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="grid grid-cols-2 gap-3 px-1 pb-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="truncate">{home.info ?? home.message}</span>
        <span className="truncate text-right">{away.info ?? away.message}</span>
      </div>
      <Rows rows={pairs(home.starters, away.starters)} />
      {(home.total !== null || away.total !== null) && (
        <div className="grid grid-cols-2 gap-3 border-t border-slate-200 px-1 pt-2 font-bold dark:border-slate-800">
          <span>
            {home.total !== null && `Totale ${formatValue(home.total)}`}
          </span>
          <span className="text-right">
            {away.total !== null && `Totale ${formatValue(away.total)}`}
          </span>
        </div>
      )}
      {hasBench && (
        <>
          <p className="mt-4 mb-1 text-center">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold dark:bg-slate-800">
              Panchine
            </span>
          </p>
          <Rows rows={pairs(home.bench, away.bench)} />
        </>
      )}
    </div>
  )
}

function Rows({ rows }: { rows: [Cell | undefined, Cell | undefined][] }) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map(([left, right], i) => (
        <li key={i} className="grid grid-cols-2 gap-2 py-1.5">
          {left ? <Half cell={left} side="left" /> : <span />}
          {right ? <Half cell={right} side="right" /> : <span />}
        </li>
      ))}
    </ul>
  )
}

function Half({ cell, side }: { cell: Cell; side: 'left' | 'right' }) {
  const right = side === 'right'
  const dim = cell.dim ? 'opacity-50' : ''
  const hasIcons = eventIcons(cell.events).length > 0
  return (
    <div
      className={`flex min-w-0 items-start gap-1.5 ${right ? 'flex-row-reverse text-right' : ''}`}
    >
      <span className={dim}>
        <RoleBadge role={cell.role} small />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`line-clamp-2 leading-tight font-medium break-words ${dim} ${cell.accent ? 'text-green-700 dark:text-green-400' : ''}`}
        >
          {cell.name}
        </span>
        {(hasIcons || cell.note) && (
          <span
            className={`mt-0.5 flex min-w-0 items-center gap-1 ${right ? 'flex-row-reverse' : ''}`}
          >
            <EventIcons events={cell.events} className={dim} />
            {cell.note && (
              <span className="truncate text-xs font-medium text-green-700 dark:text-green-400">
                {cell.note}
              </span>
            )}
          </span>
        )}
      </span>
      {cell.pill && <Pill {...cell.pill} className={dim} />}
    </div>
  )
}

// Voto base (sopra) e fantavoto (sotto)
function Pill({
  vote,
  fantavote,
  tone,
  className,
}: {
  vote: string
  fantavote: string
  tone: PillTone
  className: string
}) {
  const bottom = {
    counted: 'bg-green-600 text-white',
    muted: 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    red: 'bg-red-600 text-white',
  }[tone]
  return (
    <span
      className={`flex w-9 shrink-0 flex-col overflow-hidden rounded-md text-center text-xs leading-5 font-bold tabular-nums ${className}`}
      aria-label={`Voto ${vote}, fantavoto ${fantavote}`}
    >
      <span className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        {vote}
      </span>
      <span className={bottom}>{fantavote}</span>
    </span>
  )
}
