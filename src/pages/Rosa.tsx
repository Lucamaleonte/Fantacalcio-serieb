import { useCallback, useMemo, useState, type FormEvent } from 'react'
import PageTitle from '../components/PageTitle'
import {
  Alert,
  Button,
  Card,
  Field,
  RoleBadge,
  Select,
  Sheet,
} from '../components/ui'
import { useCurrentLeague } from '../hooks/league'
import { useAsyncData } from '../hooks/useAsyncData'
import { errorMessage } from '../lib/errors'
import { normalizeName } from '../lib/normalize'
import { fetchAllPlayers } from '../lib/players'
import { comparePlayers, ROLE_LABELS } from '../lib/roles'
import {
  parseCost,
  summarizeRoster,
  validateAddition,
  validateCostChange,
  type RosterEntry,
  type RosterSummary,
} from '../lib/roster'
import { supabase } from '../lib/supabase'
import type { Player, PlayerRole } from '../lib/types'

const ROLES: PlayerRole[] = ['P', 'D', 'C', 'A']

async function loadRosters(leagueId: string) {
  const [members, entries] = await Promise.all([
    supabase
      .from('league_members')
      .select('user_id, team_name')
      .eq('league_id', leagueId),
    supabase
      .from('roster_entries')
      .select(
        'id, user_id, player_id, cost, player:players(id, league_id, name, role, real_team, active)',
      )
      .eq('league_id', leagueId),
  ])
  if (members.error) throw members.error
  if (entries.error) throw entries.error
  return {
    teams: (members.data as { user_id: string; team_name: string }[]).sort(
      (a, b) => a.team_name.localeCompare(b.team_name, 'it'),
    ),
    entries: entries.data as unknown as RosterEntry[],
  }
}

export default function Rosa() {
  const { league, membership, isAdmin } = useCurrentLeague()
  const loader = useCallback(() => loadRosters(league.id), [league.id])
  const { data, error, loading, reload } = useAsyncData(loader)

  const [teamId, setTeamId] = useState(membership.user_id)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<RosterEntry | null>(null)

  const entries = useMemo(
    () =>
      (data?.entries ?? [])
        .filter((e) => e.user_id === teamId)
        .sort((a, b) => comparePlayers(a.player, b.player)),
    [data, teamId],
  )
  const summary = useMemo(
    () => summarizeRoster(entries, league),
    [entries, league],
  )
  const ownedIds = useMemo(
    () => new Set(data?.entries.map((e) => e.player_id)),
    [data],
  )
  const teamName =
    data?.teams.find((t) => t.user_id === teamId)?.team_name ??
    membership.team_name
  const isOwn = teamId === membership.user_id

  const closeAdd = useCallback(() => setAdding(false), [])
  const closeEdit = useCallback(() => setEditing(null), [])

  return (
    <section className="space-y-4">
      <PageTitle>{isOwn ? 'La mia rosa' : teamName}</PageTitle>

      {data && data.teams.length > 1 && (
        <Select
          aria-label="Squadra"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {data.teams.map((t) => {
            const spent = data.entries
              .filter((e) => e.user_id === t.user_id)
              .reduce((sum, e) => sum + e.cost, 0)
            const size = data.entries.filter(
              (e) => e.user_id === t.user_id,
            ).length
            return (
              <option key={t.user_id} value={t.user_id}>
                {`${t.team_name}${t.user_id === membership.user_id ? ' (tu)' : ''} – ${size}/${summary.maxSize}, ${spent} cr`}
              </option>
            )
          })}
        </Select>
      )}

      {error && (
        <div className="space-y-2">
          <Alert>{error}</Alert>
          <Button variant="secondary" onClick={reload}>
            Riprova
          </Button>
        </div>
      )}
      {loading && (
        <p className="text-slate-500 dark:text-slate-400">Caricamento rosa…</p>
      )}

      {data && (
        <>
          <BudgetCard summary={summary} />
          <RoleCounters summary={summary} />

          {isAdmin && (
            <Button className="w-full" onClick={() => setAdding(true)}>
              + Aggiungi giocatore a {teamName}
            </Button>
          )}

          {entries.length === 0 ? (
            <Alert kind="info">
              {isAdmin
                ? 'Rosa vuota: aggiungi i giocatori presi all’asta.'
                : 'Rosa ancora vuota: la inserisce l’admin dopo l’asta.'}
            </Alert>
          ) : (
            <RosterList
              entries={entries}
              onEdit={isAdmin ? setEditing : undefined}
            />
          )}

          {!isAdmin && (
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Le rose le modifica solo l&apos;admin.
            </p>
          )}
        </>
      )}

      {adding && data && (
        <Sheet title={`Aggiungi a ${teamName}`} onClose={closeAdd}>
          <AddPlayer
            leagueId={league.id}
            userId={teamId}
            summary={summary}
            ownedIds={ownedIds}
            onAdded={reload}
          />
        </Sheet>
      )}

      {editing && (
        <Sheet title={editing.player.name} onClose={closeEdit}>
          <EditEntry
            entry={editing}
            summary={summary}
            onDone={() => {
              setEditing(null)
              reload()
            }}
          />
        </Sheet>
      )}
    </section>
  )
}

function BudgetCard({ summary }: { summary: RosterSummary }) {
  const percent = Math.min(
    100,
    Math.round((summary.spent / summary.budget) * 100),
  )
  const over = summary.remaining < 0
  return (
    <Card>
      <div className="mb-2 grid grid-cols-3 text-center">
        <Stat label="Speso" value={summary.spent} />
        <Stat label="Totale" value={summary.budget} />
        <Stat
          label="Residuo"
          value={summary.remaining}
          highlight={over ? 'bad' : 'good'}
        />
      </div>
      <div
        className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="progressbar"
        aria-valuenow={summary.spent}
        aria-valuemin={0}
        aria-valuemax={summary.budget}
        aria-label="Budget speso"
      >
        <div
          className={`h-full rounded-full ${over ? 'bg-red-600' : 'bg-green-600'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </Card>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: 'good' | 'bad'
}) {
  const color =
    highlight === 'bad'
      ? 'text-red-700 dark:text-red-400'
      : highlight === 'good'
        ? 'text-green-700 dark:text-green-400'
        : ''
  return (
    <div>
      <span className={`block text-2xl font-bold ${color}`}>{value}</span>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {label}
      </span>
    </div>
  )
}

function RoleCounters({ summary }: { summary: RosterSummary }) {
  return (
    <ul className="grid grid-cols-4 gap-2">
      {ROLES.map((r) => {
        const count = summary.counts[r]
        const limit = summary.limits[r]
        const state =
          count > limit
            ? 'border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950'
            : count === limit
              ? 'border-green-400 bg-green-50 dark:border-green-800 dark:bg-green-950'
              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
        return (
          <li
            key={r}
            className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 ${state}`}
            title={ROLE_LABELS[r]}
          >
            <RoleBadge role={r} />
            <span className="font-semibold">
              {count}/{limit}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function RosterList({
  entries,
  onEdit,
}: {
  entries: RosterEntry[]
  onEdit?: (entry: RosterEntry) => void
}) {
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
      {entries.map((e) => {
        const content = (
          <>
            <RoleBadge role={e.player.role} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {e.player.name}
              </span>
              <span className="block truncate text-sm text-slate-500 dark:text-slate-400">
                {e.player.real_team}
                {!e.player.active && ' · non più in Serie B'}
              </span>
            </span>
            <span className="shrink-0 font-semibold">{e.cost} cr</span>
          </>
        )
        return (
          <li key={e.id}>
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(e)}
                className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {content}
              </button>
            ) : (
              <div className="flex min-h-14 items-center gap-3 px-3 py-2">
                {content}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// Aggiunta rapida: si resta nel pannello per inserire più giocatori di fila
function AddPlayer({
  leagueId,
  userId,
  summary,
  ownedIds,
  onAdded,
}: {
  leagueId: string
  userId: string
  summary: RosterSummary
  ownedIds: Set<string>
  onAdded: () => void
}) {
  const loader = useCallback(() => fetchAllPlayers(leagueId), [leagueId])
  const players = useAsyncData(loader)

  const [query, setQuery] = useState('')
  const [role, setRole] = useState<PlayerRole | ''>('')
  const [selected, setSelected] = useState<Player | null>(null)
  const [costText, setCostText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  const results = useMemo(() => {
    const q = normalizeName(query)
    return (players.data ?? [])
      .filter(
        (p) =>
          p.active &&
          !ownedIds.has(p.id) &&
          (!role || p.role === role) &&
          (!q || normalizeName(p.name).includes(q)),
      )
      .sort(comparePlayers)
      .slice(0, 30)
  }, [players.data, ownedIds, query, role])

  const cost = parseCost(costText)
  const warning = selected
    ? validateAddition(summary, selected.role, cost)
    : null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!selected || warning) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('roster_entries').insert({
      league_id: leagueId,
      user_id: userId,
      player_id: selected.id,
      cost,
    })
    if (error) {
      setError(errorMessage(error))
    } else {
      setLastAdded(`${selected.name} aggiunto per ${cost} crediti`)
      setSelected(null)
      setCostText('')
      setQuery('')
      onAdded()
    }
    setBusy(false)
  }

  if (selected) {
    return (
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="flex items-center gap-3 rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
          <RoleBadge role={selected.role} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {selected.name}
            </span>
            <span className="block text-sm text-slate-500 dark:text-slate-400">
              {selected.real_team}
            </span>
          </span>
          <button
            type="button"
            className="min-h-11 px-2 text-sm font-semibold text-green-700 dark:text-green-400"
            onClick={() => {
              setSelected(null)
              setError(null)
            }}
          >
            Cambia
          </button>
        </div>

        <Field
          label="Costo pagato all'asta (crediti)"
          inputMode="numeric"
          pattern="[0-9]*"
          value={costText}
          onChange={(e) => setCostText(e.target.value)}
          hint={`Residuo: ${summary.remaining} crediti`}
          autoFocus
          required
        />

        {costText !== '' && warning && <Alert>{warning}</Alert>}
        {error && <Alert>{error}</Alert>}

        <Button
          type="submit"
          className="w-full"
          loading={busy}
          disabled={!!warning}
        >
          Aggiungi
        </Button>
      </form>
    )
  }

  return (
    <div className="space-y-3">
      {lastAdded && <Alert kind="success">{lastAdded}</Alert>}

      <Field
        label="Cerca tra gli svincolati"
        type="search"
        placeholder="Nome del giocatore"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      <div className="flex gap-2" role="group" aria-label="Ruolo">
        {(['', ...ROLES] as const).map((r) => {
          const full = r !== '' && summary.counts[r] >= summary.limits[r]
          return (
            <button
              key={r || 'all'}
              type="button"
              aria-pressed={role === r}
              onClick={() => setRole(r)}
              className={`min-h-11 flex-1 rounded-xl text-sm font-semibold ${
                role === r
                  ? 'bg-green-600 text-white'
                  : 'border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
              } ${full ? 'line-through opacity-60' : ''}`}
            >
              {r || 'Tutti'}
            </button>
          )
        })}
      </div>

      {players.error && <Alert>{players.error}</Alert>}
      {players.loading && (
        <p className="text-slate-500 dark:text-slate-400">Caricamento…</p>
      )}

      {players.data && results.length === 0 && (
        <Alert kind="info">Nessuno svincolato corrisponde alla ricerca.</Alert>
      )}

      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {results.map((p) => {
          const full = summary.counts[p.role] >= summary.limits[p.role]
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(p)
                  setLastAdded(null)
                  setError(null)
                }}
                className="flex min-h-12 w-full items-center gap-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <RoleBadge role={p.role} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.name}
                </span>
                <span className="shrink-0 truncate text-sm text-slate-500 dark:text-slate-400">
                  {full ? 'ruolo pieno' : p.real_team}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function EditEntry({
  entry,
  summary,
  onDone,
}: {
  entry: RosterEntry
  summary: RosterSummary
  onDone: () => void
}) {
  const [costText, setCostText] = useState(String(entry.cost))
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cost = parseCost(costText)
  const warning = validateCostChange(summary, entry.cost, cost)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (warning) return
    setBusy(true)
    setError(null)
    const { error } = await supabase
      .from('roster_entries')
      .update({ cost })
      .eq('id', entry.id)
    if (error) {
      setError(errorMessage(error))
      setBusy(false)
    } else {
      onDone()
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    const { error } = await supabase
      .from('roster_entries')
      .delete()
      .eq('id', entry.id)
    if (error) {
      setError(errorMessage(error))
      setBusy(false)
    } else {
      onDone()
    }
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <RoleBadge role={entry.player.role} /> {entry.player.real_team}
      </p>

      <form className="space-y-3" onSubmit={save}>
        <Field
          label="Costo (crediti)"
          inputMode="numeric"
          pattern="[0-9]*"
          value={costText}
          onChange={(e) => setCostText(e.target.value)}
          required
        />
        {warning && <Alert>{warning}</Alert>}
        <Button
          type="submit"
          className="w-full"
          loading={busy}
          disabled={!!warning || cost === entry.cost}
        >
          Salva costo
        </Button>
      </form>

      {confirmRemove ? (
        <div className="space-y-2">
          <Alert kind="info">
            Togliere {entry.player.name} dalla rosa? Tornerà svincolato e i{' '}
            {entry.cost} crediti torneranno disponibili.
          </Alert>
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              loading={busy}
              onClick={remove}
            >
              Sì, togli
            </Button>
            <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
              Annulla
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="danger"
          className="w-full"
          onClick={() => setConfirmRemove(true)}
        >
          Togli dalla rosa
        </Button>
      )}

      {error && <Alert>{error}</Alert>}
    </div>
  )
}
