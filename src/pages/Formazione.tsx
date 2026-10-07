import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import { Alert, Button, Card, RoleBadge, Select, Sheet } from '../components/ui'
import { useCurrentLeague } from '../hooks/league'
import { useAsyncData } from '../hooks/useAsyncData'
import { useNow } from '../hooks/useNow'
import { errorMessage } from '../lib/errors'
import {
  arrangeStarters,
  fillBench,
  formationSlots,
  moveItem,
  validateLineup,
} from '../lib/lineup'
import {
  formatCountdown,
  formatDeadline,
  isLineupOpen,
  pickCurrentMatchday,
  STATUS_LABELS,
} from '../lib/matchdays'
import { comparePlayers } from '../lib/roles'
import { supabase } from '../lib/supabase'
import type { League, Matchday, Player, PlayerRole } from '../lib/types'

const ROW_ORDER: PlayerRole[] = ['A', 'C', 'D', 'P']

async function loadMatchdays(leagueId: string): Promise<Matchday[]> {
  const { data, error } = await supabase
    .from('matchdays')
    .select('id, league_id, number, deadline, status')
    .eq('league_id', leagueId)
    .order('number')
  if (error) throw error
  return data as Matchday[]
}

export default function Formazione() {
  const { league, membership, isAdmin } = useCurrentLeague()
  const now = useNow(1000)
  const loader = useCallback(() => loadMatchdays(league.id), [league.id])
  const { data: matchdays, error, loading, reload } = useAsyncData(loader)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const matchday =
    matchdays?.find((m) => m.id === selectedId) ??
    pickCurrentMatchday(matchdays ?? [], now)
  const open = matchday ? isLineupOpen(matchday, now) : false

  return (
    <section className="space-y-4">
      <PageTitle>Formazione</PageTitle>

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

      {matchdays && !matchday && (
        <Alert kind="info">
          Nessuna giornata in programma.{' '}
          {isAdmin ? (
            <Link to="/admin" className="font-semibold underline">
              Crea la prima giornata
            </Link>
          ) : (
            'La crea l’admin.'
          )}
        </Alert>
      )}

      {matchdays && matchday && (
        <>
          <div className="flex items-center gap-2">
            <Select
              aria-label="Giornata"
              value={matchday.id}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {matchdays.map((m) => (
                <option key={m.id} value={m.id}>
                  {`Giornata ${m.number} – ${STATUS_LABELS[m.status]}`}
                </option>
              ))}
            </Select>
          </div>

          <DeadlineBanner matchday={matchday} now={now} open={open} />

          <LineupLoader
            key={matchday.id}
            league={league}
            matchday={matchday}
            userId={membership.user_id}
            open={open}
          />

          {!open && <OtherLineups matchday={matchday} leagueId={league.id} />}
        </>
      )}
    </section>
  )
}

function DeadlineBanner({
  matchday,
  now,
  open,
}: {
  matchday: Matchday
  now: Date
  open: boolean
}) {
  const remaining = new Date(matchday.deadline).getTime() - now.getTime()
  if (!open) {
    return (
      <Alert kind="info">
        Formazioni chiuse ({formatDeadline(matchday.deadline)}): sola lettura.
      </Alert>
    )
  }
  const urgent = remaining < 3600_000
  return (
    <p
      className={`rounded-xl px-3 py-2 text-sm ${
        urgent
          ? 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
          : 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
      }`}
    >
      Scadenza <strong>{formatDeadline(matchday.deadline)}</strong> · mancano{' '}
      <strong>{formatCountdown(remaining)}</strong>
    </p>
  )
}

interface SavedLineup {
  formation: string
  starters: string[]
  bench: string[]
  updated_at: string
}

async function loadMyLineup(
  matchdayId: string,
  leagueId: string,
  userId: string,
) {
  const [roster, lineup] = await Promise.all([
    supabase
      .from('roster_entries')
      .select('player:players(id, league_id, name, role, real_team, active)')
      .eq('league_id', leagueId)
      .eq('user_id', userId),
    supabase
      .from('lineups')
      .select(
        'formation, updated_at, lineup_players(player_id, slot, position)',
      )
      .eq('matchday_id', matchdayId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])
  if (roster.error) throw roster.error
  if (lineup.error) throw lineup.error

  const players = (roster.data as unknown as { player: Player }[])
    .map((r) => r.player)
    .sort(comparePlayers)

  let saved: SavedLineup | null = null
  if (lineup.data) {
    const rows = (
      lineup.data.lineup_players as {
        player_id: string
        slot: string
        position: number
      }[]
    ).sort((a, b) => a.position - b.position)
    saved = {
      formation: lineup.data.formation,
      updated_at: lineup.data.updated_at,
      starters: rows
        .filter((r) => r.slot === 'starter')
        .map((r) => r.player_id),
      bench: rows.filter((r) => r.slot === 'bench').map((r) => r.player_id),
    }
  }
  return { players, saved }
}

function LineupLoader({
  league,
  matchday,
  userId,
  open,
}: {
  league: League
  matchday: Matchday
  userId: string
  open: boolean
}) {
  const loader = useCallback(
    () => loadMyLineup(matchday.id, league.id, userId),
    [matchday.id, league.id, userId],
  )
  const { data, error, loading, reload } = useAsyncData(loader)

  if (error) return <Alert>{error}</Alert>
  if (loading || !data)
    return <p className="text-slate-500 dark:text-slate-400">Caricamento…</p>

  if (data.players.length === 0) {
    return (
      <Alert kind="info">
        La tua rosa è vuota: la inserisce l&apos;admin dopo l&apos;asta.
      </Alert>
    )
  }

  if (!open && !data.saved) {
    return <Alert>Non hai inserito la formazione per questa giornata.</Alert>
  }

  return (
    <LineupEditor
      key={data.saved?.updated_at ?? 'new'}
      league={league}
      matchday={matchday}
      players={data.players}
      saved={data.saved}
      open={open}
      onSaved={reload}
    />
  )
}

function LineupEditor({
  league,
  matchday,
  players,
  saved,
  open,
  onSaved,
}: {
  league: League
  matchday: Matchday
  players: Player[]
  saved: SavedLineup | null
  open: boolean
  onSaved: () => void
}) {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

  // Stato iniziale: formazione salvata (senza chi non è più in rosa) o vuota
  const [initial] = useState(() => {
    const defaultFormation = league.allowed_formations.includes('4-4-2')
      ? '4-4-2'
      : league.allowed_formations[0]
    const formation = saved?.formation ?? defaultFormation
    const starters = (saved?.starters ?? [])
      .map((id) => byId.get(id))
      .filter((p) => !!p)
    const { slots, leftovers } = arrangeStarters(starters, formation)
    const bench = [
      ...leftovers,
      ...(saved?.bench ?? []).filter((id) => byId.has(id)),
    ]
    const removed =
      !!saved && [...saved.starters, ...saved.bench].some((id) => !byId.has(id))
    return { formation, starters: slots, bench, removed }
  })

  const [formation, setFormation] = useState(initial.formation)
  const [starters, setStarters] = useState<(string | null)[]>(initial.starters)
  const [bench, setBench] = useState<string[]>(initial.bench)
  const [dirty, setDirty] = useState(false)
  const [picking, setPicking] = useState<number | 'bench' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNow, setSavedNow] = useState(false)

  const slots = formationSlots(formation)
  const rosterInfo = useMemo(
    () => new Map(players.map((p) => [p.id, { name: p.name, role: p.role }])),
    [players],
  )
  const problems = validateLineup(
    { formation, starters, bench },
    rosterInfo,
    league.allowed_formations,
  )
  const used = new Set(
    [...starters, ...bench].filter((id): id is string => !!id),
  )

  function change(next: {
    starters?: (string | null)[]
    bench?: string[]
    formation?: string
  }) {
    if (next.formation !== undefined) setFormation(next.formation)
    if (next.starters !== undefined) setStarters(next.starters)
    if (next.bench !== undefined) setBench(next.bench)
    setDirty(true)
    setSavedNow(false)
    setError(null)
  }

  function changeFormation(value: string) {
    const current = starters
      .filter((id): id is string => !!id)
      .map((id) => byId.get(id)!)
    const { slots: nextSlots, leftovers } = arrangeStarters(current, value)
    change({
      formation: value,
      starters: nextSlots,
      bench: [...leftovers, ...bench.filter((id) => !leftovers.includes(id))],
    })
  }

  function putInSlot(index: number, playerId: string | null) {
    const next = [...starters]
    next[index] = playerId
    change({ starters: next, bench: bench.filter((id) => id !== playerId) })
    setPicking(null)
  }

  async function save() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('save_lineup', {
      p_matchday_id: matchday.id,
      p_formation: formation,
      p_starters: starters,
      p_bench: bench,
    })
    if (error) {
      setError(errorMessage(error))
    } else {
      setDirty(false)
      setSavedNow(true)
      onSaved()
    }
    setBusy(false)
  }

  const candidates =
    picking === null
      ? []
      : players.filter((p) =>
          picking === 'bench'
            ? !used.has(p.id)
            : p.role === slots[picking] && !starters.includes(p.id),
        )

  return (
    <div className="space-y-4">
      {initial.removed && (
        <Alert kind="info">
          Alcuni giocatori della formazione salvata non sono più nella tua rosa
          e sono stati tolti.
        </Alert>
      )}

      {open ? (
        <Select
          label="Modulo"
          value={formation}
          onChange={(e) => changeFormation(e.target.value)}
        >
          {league.allowed_formations.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
      ) : (
        <p className="font-semibold">Modulo {formation}</p>
      )}

      <Pitch
        slots={slots}
        starters={starters}
        byId={byId}
        onPick={open ? (i) => setPicking(i) : undefined}
      />

      <Card title={`Panchina (${bench.length})`}>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          L&apos;ordine conta: al titolare senza voto subentra il primo
          panchinaro dello stesso ruolo, fino a {league.max_substitutions}{' '}
          sostituzioni.
        </p>
        {bench.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nessun panchinaro.
          </p>
        ) : (
          <ol className="divide-y divide-slate-200 dark:divide-slate-800">
            {bench.map((id, i) => {
              const p = byId.get(id)
              if (!p) return null
              return (
                <li key={id} className="flex min-h-12 items-center gap-2 py-1">
                  <span className="w-5 text-right text-sm text-slate-500">
                    {i + 1}
                  </span>
                  <RoleBadge role={p.role} />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {p.name}
                  </span>
                  {open && (
                    <span className="flex shrink-0">
                      <IconButton
                        label={`Sposta su ${p.name}`}
                        disabled={i === 0}
                        onClick={() =>
                          change({ bench: moveItem(bench, i, i - 1) })
                        }
                      >
                        ↑
                      </IconButton>
                      <IconButton
                        label={`Sposta giù ${p.name}`}
                        disabled={i === bench.length - 1}
                        onClick={() =>
                          change({ bench: moveItem(bench, i, i + 1) })
                        }
                      >
                        ↓
                      </IconButton>
                      <IconButton
                        label={`Togli ${p.name} dalla panchina`}
                        onClick={() =>
                          change({ bench: bench.filter((b) => b !== id) })
                        }
                      >
                        ✕
                      </IconButton>
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        )}
        {open && used.size < players.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPicking('bench')}>
              + Aggiungi
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                change({
                  bench: fillBench(
                    players.map((p) => p.id),
                    starters,
                    bench,
                  ),
                })
              }
            >
              Aggiungi tutti i rimanenti
            </Button>
          </div>
        )}
      </Card>

      {open && (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] space-y-2">
          {problems.length > 0 && (
            <Alert>
              {problems.map((p) => (
                <span key={p} className="block">
                  {p}
                </span>
              ))}
            </Alert>
          )}
          {error && <Alert>{error}</Alert>}
          {savedNow && <Alert kind="success">Formazione salvata</Alert>}
          <Button
            className="w-full shadow-lg"
            loading={busy}
            disabled={problems.length > 0 || (!dirty && !!saved)}
            onClick={save}
          >
            {!dirty && saved ? 'Formazione salvata' : 'Salva formazione'}
          </Button>
        </div>
      )}

      {saved && (
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Ultimo salvataggio: {formatDeadline(saved.updated_at)}
        </p>
      )}

      {picking !== null && (
        <Sheet
          title={
            picking === 'bench'
              ? 'Aggiungi in panchina'
              : `Scegli il titolare (${slots[picking]})`
          }
          onClose={() => setPicking(null)}
        >
          {candidates.length === 0 ? (
            <Alert kind="info">Nessun giocatore disponibile.</Alert>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {candidates.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex min-h-12 w-full items-center gap-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => {
                      if (picking === 'bench') {
                        change({ bench: [...bench, p.id] })
                        setPicking(null)
                      } else {
                        putInSlot(picking, p.id)
                      }
                    }}
                  >
                    <RoleBadge role={p.role} />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {p.name}
                    </span>
                    <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">
                      {bench.includes(p.id) ? 'in panchina' : p.real_team}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {typeof picking === 'number' && starters[picking] && (
            <Button
              variant="danger"
              className="mt-4 w-full"
              onClick={() => putInSlot(picking, null)}
            >
              Svuota questo posto
            </Button>
          )}
        </Sheet>
      )}
    </div>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-lg text-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  )
}

// Campo: attaccanti in alto, portiere in basso
function Pitch({
  slots,
  starters,
  byId,
  onPick,
}: {
  slots: PlayerRole[]
  starters: (string | null)[]
  byId: Map<string, Player>
  onPick?: (index: number) => void
}) {
  return (
    <div className="space-y-3 rounded-2xl bg-gradient-to-b from-green-700 to-green-800 p-3">
      {ROW_ORDER.map((role) => (
        <div key={role} className="flex justify-center gap-2">
          {slots.map((slotRole, index) => {
            if (slotRole !== role) return null
            const player = starters[index]
              ? byId.get(starters[index]!)
              : undefined
            const content = (
              <>
                <RoleBadge role={role} />
                <span className="mt-1 block w-full truncate text-xs font-semibold">
                  {player ? player.name : onPick ? '+ Scegli' : '—'}
                </span>
              </>
            )
            const className = `flex min-h-16 w-0 max-w-24 flex-1 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-center ${
              player
                ? 'bg-white/95 text-slate-900'
                : 'border-2 border-dashed border-white/60 text-white'
            }`
            return onPick ? (
              <button
                key={index}
                type="button"
                className={className}
                onClick={() => onPick(index)}
              >
                {content}
              </button>
            ) : (
              <div key={index} className={className}>
                {content}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

interface OtherLineup {
  user_id: string
  formation: string
  lineup_players: {
    slot: string
    position: number
    player: Pick<Player, 'id' | 'name' | 'role' | 'real_team'>
  }[]
}

async function loadOtherLineups(matchdayId: string, leagueId: string) {
  const [lineups, members] = await Promise.all([
    supabase
      .from('lineups')
      .select(
        'user_id, formation, lineup_players(slot, position, player:players(id, name, role, real_team))',
      )
      .eq('matchday_id', matchdayId),
    supabase
      .from('league_members')
      .select('user_id, team_name')
      .eq('league_id', leagueId),
  ])
  if (lineups.error) throw lineups.error
  if (members.error) throw members.error
  const byUser = new Map(
    (lineups.data as unknown as OtherLineup[]).map((l) => [l.user_id, l]),
  )
  return (members.data as { user_id: string; team_name: string }[])
    .sort((a, b) => a.team_name.localeCompare(b.team_name, 'it'))
    .map((m) => ({ ...m, lineup: byUser.get(m.user_id) ?? null }))
}

// Dopo la scadenza: formazioni di tutte le squadre
function OtherLineups({
  matchday,
  leagueId,
}: {
  matchday: Matchday
  leagueId: string
}) {
  const loader = useCallback(
    () => loadOtherLineups(matchday.id, leagueId),
    [matchday.id, leagueId],
  )
  const { data, error } = useAsyncData(loader)

  if (error) return <Alert>{error}</Alert>
  if (!data) return null

  return (
    <Card title="Formazioni di tutte le squadre">
      <ul className="space-y-2">
        {data.map(({ user_id, team_name, lineup }) => {
          const rows = [...(lineup?.lineup_players ?? [])].sort(
            (a, b) => a.position - b.position,
          )
          const starters = rows
            .filter((r) => r.slot === 'starter')
            .map((r) => r.player)
          const bench = rows
            .filter((r) => r.slot === 'bench')
            .map((r) => r.player)
          return (
            <li key={user_id}>
              <details className="rounded-xl border border-slate-200 dark:border-slate-800">
                <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-3 font-semibold">
                  <span className="truncate">{team_name}</span>
                  <span className="shrink-0 text-sm font-normal text-slate-500 dark:text-slate-400">
                    {lineup ? lineup.formation : 'non inserita'}
                  </span>
                </summary>
                {lineup && (
                  <div className="space-y-2 px-3 pb-3 text-sm">
                    <ul className="space-y-1">
                      {[...starters].sort(comparePlayers).map((p) => (
                        <li key={p.id} className="flex items-center gap-2">
                          <RoleBadge role={p.role} />
                          <span className="truncate">{p.name}</span>
                        </li>
                      ))}
                    </ul>
                    {bench.length > 0 && (
                      <p className="text-slate-500 dark:text-slate-400">
                        Panchina: {bench.map((p) => p.name).join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </details>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
