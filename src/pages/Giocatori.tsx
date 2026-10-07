import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import PlayerForm from '../components/PlayerForm'
import {
  Alert,
  Button,
  Field,
  RoleBadge,
  Select,
  Sheet,
} from '../components/ui'
import { useCurrentLeague } from '../hooks/league'
import { useAsyncData } from '../hooks/useAsyncData'
import { normalizeName } from '../lib/normalize'
import { comparePlayers, fetchAllPlayers } from '../lib/players'
import { supabase } from '../lib/supabase'
import type { Player, PlayerRole } from '../lib/types'

const PAGE = 100
type Status = 'all' | 'free' | 'taken'

async function loadPlayers(leagueId: string) {
  const [players, roster, members] = await Promise.all([
    fetchAllPlayers(leagueId),
    supabase
      .from('roster_entries')
      .select('player_id, user_id')
      .eq('league_id', leagueId),
    supabase
      .from('league_members')
      .select('user_id, team_name')
      .eq('league_id', leagueId),
  ])
  if (roster.error) throw roster.error
  if (members.error) throw members.error

  const teamByUser = new Map(
    members.data.map((m) => [m.user_id, m.team_name as string]),
  )
  // giocatore -> squadra della lega che lo possiede
  const owners = new Map(
    roster.data.map((r) => [
      r.player_id as string,
      teamByUser.get(r.user_id) ?? '?',
    ]),
  )
  return { players: players.sort(comparePlayers), owners }
}

export default function Giocatori() {
  const { league, isAdmin } = useCurrentLeague()
  const loader = useCallback(() => loadPlayers(league.id), [league.id])
  const { data, error, loading, reload } = useAsyncData(loader)

  const [query, setQuery] = useState('')
  const [role, setRole] = useState<PlayerRole | ''>('')
  const [team, setTeam] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState<Player | 'new' | null>(null)

  const teams = useMemo(
    () =>
      [...new Set(data?.players.map((p) => p.real_team))].sort((a, b) =>
        a.localeCompare(b, 'it'),
      ),
    [data],
  )

  const filtered = useMemo(() => {
    if (!data) return []
    const q = normalizeName(query)
    return data.players.filter(
      (p) =>
        (showInactive || p.active || data.owners.has(p.id)) &&
        (!role || p.role === role) &&
        (!team || p.real_team === team) &&
        (status === 'all' || (status === 'free') !== data.owners.has(p.id)) &&
        (!q || normalizeName(p.name).includes(q)),
    )
  }, [data, query, role, team, status, showInactive])

  // Ogni cambio di filtro riparte dai primi risultati
  const resetLimit = () => setLimit(PAGE)

  const closeSheet = useCallback(() => setEditing(null), [])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-x-2">
        <PageTitle>Giocatori</PageTitle>
        {isAdmin && (
          <div className="mb-4 flex gap-2">
            <Link
              to="/giocatori/importa"
              className="flex min-h-11 items-center rounded-xl border border-slate-300 px-3 text-sm font-semibold dark:border-slate-700"
            >
              Importa CSV
            </Link>
            <Button onClick={() => setEditing('new')} className="text-sm">
              + Aggiungi
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Field
          label="Cerca"
          type="search"
          placeholder="Nome del giocatore"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            resetLimit()
          }}
        />

        <div className="flex gap-2" role="group" aria-label="Ruolo">
          {(['', 'P', 'D', 'C', 'A'] as const).map((r) => (
            <button
              key={r || 'all'}
              type="button"
              aria-pressed={role === r}
              onClick={() => {
                setRole(r)
                resetLimit()
              }}
              className={`min-h-11 flex-1 rounded-xl text-sm font-semibold ${
                role === r
                  ? 'bg-green-600 text-white'
                  : 'border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
              }`}
            >
              {r || 'Tutti'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select
            aria-label="Squadra di Serie B"
            value={team}
            onChange={(e) => {
              setTeam(e.target.value)
              resetLimit()
            }}
          >
            <option value="">Tutte le squadre</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Disponibilità"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status)
              resetLimit()
            }}
          >
            <option value="all">Tutti</option>
            <option value="free">Svincolati</option>
            <option value="taken">Già presi</option>
          </Select>
        </div>

        {isAdmin && (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-green-600"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Mostra anche i giocatori non attivi
          </label>
        )}
      </div>

      {error && (
        <div className="space-y-2">
          <Alert>{error}</Alert>
          <Button variant="secondary" onClick={reload}>
            Riprova
          </Button>
        </div>
      )}

      {loading && (
        <p className="text-slate-500 dark:text-slate-400">
          Caricamento giocatori…
        </p>
      )}

      {data && data.players.length === 0 && (
        <Alert kind="info">
          {isAdmin ? (
            <>
              Non ci sono ancora giocatori.{' '}
              <Link to="/giocatori/importa" className="font-semibold underline">
                Importa il listone dal CSV
              </Link>{' '}
              oppure aggiungili uno alla volta.
            </>
          ) : (
            "L'admin non ha ancora caricato i giocatori."
          )}
        </Alert>
      )}

      {data && data.players.length > 0 && (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filtered.length === 1
              ? '1 giocatore'
              : `${filtered.length} giocatori`}
          </p>

          {filtered.length === 0 ? (
            <Alert kind="info">Nessun giocatore corrisponde ai filtri.</Alert>
          ) : (
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {filtered.slice(0, limit).map((p) => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  owner={data.owners.get(p.id)}
                  onEdit={isAdmin ? () => setEditing(p) : undefined}
                />
              ))}
            </ul>
          )}

          {filtered.length > limit && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setLimit((l) => l + PAGE)}
            >
              Mostra altri ({filtered.length - limit} rimanenti)
            </Button>
          )}
        </>
      )}

      {editing && (
        <Sheet
          title={editing === 'new' ? 'Nuovo giocatore' : 'Modifica giocatore'}
          onClose={closeSheet}
        >
          <PlayerForm
            leagueId={league.id}
            player={editing === 'new' ? null : editing}
            teams={teams}
            onCancel={closeSheet}
            onSaved={() => {
              setEditing(null)
              reload()
            }}
          />
        </Sheet>
      )}
    </section>
  )
}

function PlayerRow({
  player,
  owner,
  onEdit,
}: {
  player: Player
  owner: string | undefined
  onEdit?: () => void
}) {
  const content = (
    <>
      <RoleBadge role={player.role} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {player.name}
          {!player.active && (
            <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              non attivo
            </span>
          )}
        </span>
        <span className="block truncate text-sm text-slate-500 dark:text-slate-400">
          {player.real_team}
        </span>
      </span>
      <span
        className={`max-w-[40%] shrink-0 truncate text-right text-sm ${
          owner ? 'font-medium' : 'text-green-700 dark:text-green-400'
        }`}
      >
        {owner ?? 'Svincolato'}
      </span>
    </>
  )

  return (
    <li>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
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
}
