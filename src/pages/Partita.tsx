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
import type { Fixture, Matchday, Player } from '../lib/types'
import type { VoteEvents } from '../lib/voteEvents'

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

      {/* Calcolata: una squadra sotto l'altra (su telefono servono spazio
          per voto, fantavoto e bonus); prima: affiancate */}
      <div
        className={`grid gap-2 ${scored ? 'sm:grid-cols-2' : 'grid-cols-2'}`}
      >
        {[f.home_user_id, f.away_user_id].map((userId) => (
          <TeamColumn
            key={userId}
            teamName={scored ? team(userId).name : null}
            lineup={data.lineups.get(userId) ?? null}
            score={scored ? (data.scores.get(userId) ?? null) : null}
            votes={data.votes}
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
  teamName,
  lineup,
  score,
  votes,
}: {
  teamName: string | null
  lineup: TeamLineup | null
  score: TeamScore | null
  votes: Votes
}) {
  const title = teamName && (
    <p className="mb-1 truncate font-semibold">{teamName}</p>
  )

  // Giornata calcolata: voto base, fantavoto e bonus/malus di titolari e panchina
  if (score && !score.details.missing && score.details.starters) {
    const d = score.details
    const entered = new Set(
      d.starters.flatMap((s) => (s.sub ? [s.sub.id] : [])),
    )
    return (
      <div className={columnClass}>
        {title}
        <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="min-w-0 flex-1 truncate">
            {d.formation} ·{' '}
            {d.substitutions === 1 ? '1 sost.' : `${d.substitutions} sost.`}
          </span>
          <VoteHeader />
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {d.starters.map((s) => (
            <li key={s.id} className="py-1">
              <div className="flex items-center gap-1.5">
                <RoleBadge role={s.role} small />
                <PlayerName
                  name={s.name}
                  events={votes.get(s.id)?.events}
                  className={s.sub ? 'text-slate-400 line-through' : ''}
                />
                <VoteValues
                  vote={votes.get(s.id)?.vote ?? null}
                  fantavote={s.sub ? '–' : formatValue(s.value)}
                  fantavoteClass={
                    s.sub
                      ? 'text-slate-400'
                      : s.fantavote === null
                        ? 'text-red-600'
                        : ''
                  }
                />
              </div>
              {s.sub && (
                <div className="flex items-center gap-1.5 pl-6.5 font-medium text-green-700 dark:text-green-400">
                  <PlayerName
                    name={`↑ ${s.sub.name}`}
                    events={votes.get(s.sub.id)?.events}
                  />
                  <VoteValues
                    vote={votes.get(s.sub.id)?.vote ?? null}
                    fantavote={formatValue(s.sub.fantavote)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-right font-bold">
          Totale {formatValue(score.points)}
        </p>
        {lineup && (
          <Bench players={lineup.bench} votes={votes} entered={entered} />
        )}
      </div>
    )
  }

  if (!lineup) {
    return (
      <div className={columnClass}>
        {title}
        <p className="text-slate-500 dark:text-slate-400">
          Formazione non inserita
          {score ? ': 0 punti' : ''}.
        </p>
      </div>
    )
  }

  return (
    <div className={columnClass}>
      {title}
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

// Intestazione delle colonne: voto base e fantavoto (voto + bonus/malus)
function VoteHeader() {
  return (
    <>
      <span className="w-8 shrink-0 text-right" title="Voto base">
        V
      </span>
      <span className="w-9 shrink-0 text-right" title="Fantavoto">
        FV
      </span>
    </>
  )
}

function PlayerName({
  name,
  events,
  className = '',
}: {
  name: string
  events: VoteEvents | undefined
  className?: string
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <span className={`truncate ${className}`}>{name}</span>
      <EventIcons events={events} />
    </span>
  )
}

function VoteValues({
  vote,
  fantavote,
  fantavoteClass = '',
}: {
  vote: number | null
  fantavote: string
  fantavoteClass?: string
}) {
  return (
    <>
      <span className="w-8 shrink-0 text-right text-slate-500 tabular-nums dark:text-slate-400">
        {formatValue(vote)}
      </span>
      <span
        className={`w-9 shrink-0 text-right font-semibold tabular-nums ${fantavoteClass}`}
      >
        {fantavote}
      </span>
    </>
  )
}

function Bench({
  players,
  votes,
  entered,
}: {
  players: LineupPlayer[]
  votes?: Votes
  entered?: Set<string>
}) {
  if (players.length === 0) return null
  // Giornata calcolata: voti anche dei panchinari (in verde chi è entrato)
  if (votes && entered) {
    return (
      <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span className="flex-1">Panchina</span>
          <VoteHeader />
        </div>
        <ol className="space-y-0.5">
          {players.map((p, i) => {
            const v = votes.get(p.id)
            const inGame = entered.has(p.id)
            return (
              <li
                key={p.id}
                className={`flex items-center gap-1.5 ${
                  inGame ? 'font-medium text-green-700 dark:text-green-400' : ''
                }`}
              >
                <span className="w-4 shrink-0 text-right text-xs text-slate-400">
                  {i + 1}
                </span>
                <span className="w-3 shrink-0 text-xs font-bold text-slate-500">
                  {p.role}
                </span>
                <PlayerName
                  name={inGame ? `↑ ${p.name}` : p.name}
                  events={v?.events}
                />
                <VoteValues
                  vote={v?.vote ?? null}
                  fantavote={formatValue(v?.fantavote ?? null)}
                  fantavoteClass={
                    inGame
                      ? ''
                      : 'font-normal text-slate-500 dark:text-slate-400'
                  }
                />
              </li>
            )
          })}
        </ol>
      </div>
    )
  }
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
