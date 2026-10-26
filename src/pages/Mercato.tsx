import {
  useCallback,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import PageTitle from '../components/PageTitle'
import TeamLogo from '../components/TeamLogo'
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
import { comparePlayers } from '../lib/roles'
import { roleLimits, summarizeRoster, type RosterEntry } from '../lib/roster'
import { supabase } from '../lib/supabase'
import {
  formatDelta,
  groupTrades,
  playersGivenBy,
  tradeRoleProblem,
  TRADE_STATUS_LABELS,
  valueChange,
  type Trade,
  type TradePlayer,
  type TradeStatus,
} from '../lib/trades'
import type { League } from '../lib/types'
import TradeMarketCard from './admin/TradeMarketCard'

interface Team {
  user_id: string
  team_name: string
  logo_path: string | null
  trade_balance: number
}

const PLAYER_COLUMNS = 'id, league_id, name, role, real_team, active'

async function loadMarket(leagueId: string) {
  const [leagueRow, members, entries, trades] = await Promise.all([
    supabase
      .from('leagues')
      .select('trade_market_open')
      .eq('id', leagueId)
      .single(),
    supabase
      .from('league_members')
      .select('user_id, team_name, logo_path, trade_balance')
      .eq('league_id', leagueId),
    supabase
      .from('roster_entries')
      .select(`id, user_id, player_id, cost, player:players(${PLAYER_COLUMNS})`)
      .eq('league_id', leagueId),
    supabase
      .from('trades')
      .select(
        `id, proposer_id, receiver_id, status, message, created_at, decided_at, cancelled_at, trade_players(player_id, from_user_id, cost, player:players(${PLAYER_COLUMNS}))`,
      )
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  for (const r of [leagueRow, members, entries, trades])
    if (r.error) throw r.error
  return {
    // Letto ogni volta: l'admin può aprire o chiudere il mercato in qualsiasi momento
    open: (leagueRow.data as { trade_market_open: boolean }).trade_market_open,
    teams: (members.data as Team[]).sort((a, b) =>
      a.team_name.localeCompare(b.team_name, 'it'),
    ),
    entries: entries.data as unknown as RosterEntry[],
    trades: trades.data as unknown as Trade[],
  }
}

type MarketData = Awaited<ReturnType<typeof loadMarket>>

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Mercato() {
  const { league, membership, isAdmin } = useCurrentLeague()
  const loader = useCallback(() => loadMarket(league.id), [league.id])
  const { data, error, loading, reload } = useAsyncData(loader)
  const [proposing, setProposing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const closePropose = useCallback(() => setProposing(false), [])

  const me = membership.user_id
  const open = isAdmin
    ? league.trade_market_open
    : (data?.open ?? league.trade_market_open)
  const groups = useMemo(() => groupTrades(data?.trades ?? [], me), [data, me])

  return (
    <section className="space-y-4">
      <PageTitle>Mercato scambi</PageTitle>

      {isAdmin ? (
        <TradeMarketCard onChanged={reload} />
      ) : (
        <Alert kind={open ? 'success' : 'info'}>
          {open
            ? 'Mercato aperto: puoi proporre scambi alle altre squadre.'
            : 'Mercato chiuso: lo apre l’admin quando si può scambiare.'}
        </Alert>
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
        <p className="text-slate-500 dark:text-slate-400">Caricamento…</p>
      )}

      {notice && <Alert kind="success">{notice}</Alert>}

      {data && (
        <>
          {open && data.teams.length > 1 && (
            <Button
              className="w-full"
              onClick={() => {
                setNotice(null)
                setProposing(true)
              }}
            >
              + Nuova proposta di scambio
            </Button>
          )}

          <TradeList
            title="Proposte ricevute"
            trades={groups.received}
            data={data}
            empty="Nessuna proposta da valutare."
            renderActions={(t) => (
              <ReceivedActions
                trade={t}
                open={open}
                onDone={(text) => {
                  setNotice(text)
                  reload()
                }}
              />
            )}
          />
          <TradeList
            title="Proposte inviate"
            trades={groups.sent}
            data={data}
            empty="Nessuna proposta in attesa di risposta."
            renderActions={(t) => (
              <WithdrawAction
                trade={t}
                onDone={() => {
                  setNotice('Proposta ritirata')
                  reload()
                }}
              />
            )}
          />
          <TradeList
            title="Storico scambi"
            trades={groups.history}
            data={data}
            empty="Ancora nessuno scambio."
            renderActions={(t) =>
              isAdmin && t.status === 'accepted' ? (
                <CancelAction
                  trade={t}
                  onDone={() => {
                    setNotice('Scambio annullato')
                    reload()
                  }}
                />
              ) : null
            }
          />

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ogni giocatore mantiene il costo pagato all&apos;asta, che conta per
            un eventuale svincolo. Lo scambio non cambia i crediti disponibili:
            la differenza di valore va nel saldo scambi della squadra, quindi il
            valore della rosa può superare il budget. Le proposte le vedono solo
            le due squadre, gli scambi eseguiti tutta la lega.
          </p>
        </>
      )}

      {proposing && data && (
        <Sheet title="Nuova proposta" onClose={closePropose}>
          <ProposeTrade
            league={league}
            me={me}
            data={data}
            onSent={(teamName) => {
              setProposing(false)
              setNotice(`Proposta inviata a ${teamName}`)
              reload()
            }}
          />
        </Sheet>
      )}
    </section>
  )
}

function TradeList({
  title,
  trades,
  data,
  empty,
  renderActions,
}: {
  title: string
  trades: Trade[]
  data: MarketData
  empty: string
  renderActions: (trade: Trade) => ReactNode
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">
        {title}
        {trades.length > 0 && ` (${trades.length})`}
      </h2>
      {trades.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{empty}</p>
      ) : (
        trades.map((t) => (
          <TradeCard key={t.id} trade={t} teams={data.teams}>
            {renderActions(t)}
          </TradeCard>
        ))
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: TradeStatus }) {
  const style =
    status === 'pending'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      : status === 'accepted'
        ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
        : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}
    >
      {TRADE_STATUS_LABELS[status]}
    </span>
  )
}

function TradeCard({
  trade,
  teams,
  children,
}: {
  trade: Trade
  teams: Team[]
  children?: ReactNode
}) {
  const team = (id: string) => teams.find((t) => t.user_id === id)
  const sides = [trade.proposer_id, trade.receiver_id].map((id) => ({
    id,
    name: team(id)?.team_name ?? 'Squadra uscita',
    logo: team(id)?.logo_path,
    gives: playersGivenBy(trade, id),
  }))
  const date =
    trade.status === 'cancelled' && trade.cancelled_at
      ? trade.cancelled_at
      : (trade.decided_at ?? trade.created_at)

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm text-slate-500 dark:text-slate-400">
          {trade.status === 'pending' ? 'Proposta del ' : ''}
          {formatDate(date)}
        </p>
        <StatusBadge status={trade.status} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {sides.map((s, i) => {
          const delta = valueChange(s.gives, sides[1 - i].gives)
          return (
            <div key={s.id} className="min-w-0">
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <TeamLogo path={s.logo} name={s.name} size="xs" />
                <span className="truncate">{s.name}</span>
              </p>
              <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                cede
              </p>
              <ul className="space-y-1">
                {s.gives.map((p) => (
                  <TradePlayerRow key={p.player_id} item={p} />
                ))}
              </ul>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Valore rosa {formatDelta(delta)}
              </p>
            </div>
          )
        })}
      </div>

      {trade.message && (
        <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm italic dark:bg-slate-800">
          “{trade.message}”
        </p>
      )}

      {children && <div className="mt-3">{children}</div>}
    </Card>
  )
}

function TradePlayerRow({ item }: { item: TradePlayer }) {
  return (
    <li className="flex items-center gap-1.5 text-sm">
      <RoleBadge role={item.player.role} small />
      <span className="min-w-0 flex-1 truncate">{item.player.name}</span>
      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
        {item.cost} cr
      </span>
    </li>
  )
}

// Bottone con conferma che chiama una RPC
function ConfirmAction({
  label,
  confirmText,
  confirmLabel,
  variant = 'primary',
  run,
  onDone,
}: {
  label: string
  confirmText: string
  confirmLabel: string
  variant?: 'primary' | 'danger'
  run: () => PromiseLike<{ error: unknown }>
  onDone: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setBusy(true)
    setError(null)
    const { error } = await run()
    if (error) {
      setError(errorMessage(error))
      setBusy(false)
      setConfirming(false)
    } else {
      onDone()
    }
  }

  return (
    <div className="space-y-2">
      {confirming ? (
        <>
          <Alert kind="info">{confirmText}</Alert>
          <div className="flex gap-2">
            <Button variant={variant} loading={busy} onClick={go}>
              {confirmLabel}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Annulla
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant={variant}
          className="w-full"
          onClick={() => setConfirming(true)}
        >
          {label}
        </Button>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

function ReceivedActions({
  trade,
  open,
  onDone,
}: {
  trade: Trade
  open: boolean
  onDone: (text: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reject() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('respond_trade', {
      p_trade_id: trade.id,
      p_accept: false,
    })
    if (error) {
      setError(errorMessage(error))
      setBusy(false)
    } else {
      onDone('Proposta rifiutata')
    }
  }

  return (
    <div className="space-y-2">
      {open ? (
        <ConfirmAction
          label="Accetta"
          confirmText="Accettando, lo scambio viene eseguito subito: i giocatori cambiano squadra e chi è ceduto esce dalle formazioni non ancora chiuse."
          confirmLabel="Sì, accetta"
          run={() =>
            supabase.rpc('respond_trade', {
              p_trade_id: trade.id,
              p_accept: true,
            })
          }
          onDone={() => onDone('Scambio eseguito')}
        />
      ) : (
        <Alert kind="info">Mercato chiuso: non si può accettare.</Alert>
      )}
      <Button
        variant="secondary"
        className="w-full"
        loading={busy}
        onClick={reject}
      >
        Rifiuta
      </Button>
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

function WithdrawAction({
  trade,
  onDone,
}: {
  trade: Trade
  onDone: () => void
}) {
  return (
    <ConfirmAction
      label="Ritira proposta"
      confirmText="Ritirare la proposta? L’altra squadra non potrà più accettarla."
      confirmLabel="Sì, ritira"
      variant="danger"
      run={() => supabase.rpc('withdraw_trade', { p_trade_id: trade.id })}
      onDone={onDone}
    />
  )
}

function CancelAction({ trade, onDone }: { trade: Trade; onDone: () => void }) {
  return (
    <ConfirmAction
      label="Annulla scambio (admin)"
      confirmText="Annullare lo scambio? I giocatori tornano alle squadre di prima e i saldi scambi tornano come prima. Le formazioni già salvate non vengono ripristinate."
      confirmLabel="Sì, annulla"
      variant="danger"
      run={() => supabase.rpc('cancel_trade', { p_trade_id: trade.id })}
      onDone={onDone}
    />
  )
}

function ProposeTrade({
  league,
  me,
  data,
  onSent,
}: {
  league: League
  me: string
  data: MarketData
  onSent: (teamName: string) => void
}) {
  const others = data.teams.filter((t) => t.user_id !== me)
  const myTeam = data.teams.find((t) => t.user_id === me)
  const [otherId, setOtherId] = useState(others[0]?.user_id ?? '')
  const [give, setGive] = useState<Set<string>>(new Set())
  const [get, setGet] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'give' | 'get'>('give')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const other = others.find((t) => t.user_id === otherId)
  const rosterOf = (userId: string) =>
    data.entries
      .filter((e) => e.user_id === userId)
      .sort((a, b) => comparePlayers(a.player, b.player))
  const mine = rosterOf(me)
  const theirs = rosterOf(otherId)
  const giveEntries = mine.filter((e) => give.has(e.player_id))
  const getEntries = theirs.filter((e) => get.has(e.player_id))

  const mySummary = summarizeRoster(mine, league, myTeam?.trade_balance ?? 0)
  const theirSummary = summarizeRoster(
    theirs,
    league,
    other?.trade_balance ?? 0,
  )
  const problem =
    giveEntries.length === 0 || getEntries.length === 0
      ? 'Scegli almeno un giocatore da dare e uno da ricevere'
      : tradeRoleProblem(
          {
            name: myTeam?.team_name ?? 'La tua squadra',
            counts: mySummary.counts,
          },
          { name: other?.team_name ?? '', counts: theirSummary.counts },
          roleLimits(league),
          giveEntries.map((e) => e.player),
          getEntries.map((e) => e.player),
        )
  const delta = valueChange(giveEntries, getEntries)

  function toggle(
    set: Set<string>,
    id: string,
    update: (s: Set<string>) => void,
  ) {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    update(next)
    setError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (problem || !other) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('propose_trade', {
      p_league_id: league.id,
      p_receiver_id: other.user_id,
      p_give: [...give],
      p_get: [...get],
      p_message: message.trim() || null,
    })
    if (error) {
      setError(errorMessage(error))
      setBusy(false)
    } else {
      onSent(other.team_name)
    }
  }

  if (others.length === 0) {
    return <Alert kind="info">Non ci sono altre squadre nella lega.</Alert>
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <Select
        label="Squadra a cui proponi lo scambio"
        value={otherId}
        onChange={(e) => {
          setOtherId(e.target.value)
          setGet(new Set())
          setError(null)
        }}
      >
        {others.map((t) => (
          <option key={t.user_id} value={t.user_id}>
            {t.team_name}
          </option>
        ))}
      </Select>

      <div className="flex gap-2" role="group" aria-label="Lista giocatori">
        {(
          [
            ['give', `Tu dai (${give.size})`],
            ['get', `Ricevi (${get.size})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-11 flex-1 rounded-xl text-sm font-semibold ${
              tab === key
                ? 'bg-green-600 text-white'
                : 'border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'give' ? (
        <PlayerPicker
          entries={mine}
          selected={give}
          onToggle={(id) => toggle(give, id, setGive)}
          empty="La tua rosa è vuota."
        />
      ) : (
        <PlayerPicker
          entries={theirs}
          selected={get}
          onToggle={(id) => toggle(get, id, setGet)}
          empty={`La rosa di ${other?.team_name ?? ''} è vuota.`}
        />
      )}

      <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
        <p>
          <strong>Dai:</strong>{' '}
          {giveEntries.map((e) => e.player.name).join(', ') || '–'}
        </p>
        <p>
          <strong>Ricevi:</strong>{' '}
          {getEntries.map((e) => e.player.name).join(', ') || '–'}
        </p>
        {giveEntries.length > 0 && getEntries.length > 0 && (
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Valore della tua rosa: {mySummary.spent} → {mySummary.spent + delta}{' '}
            ({formatDelta(delta)}). Crediti disponibili invariati:{' '}
            {mySummary.remaining}.
          </p>
        )}
      </div>

      <Field
        label="Messaggio (facoltativo)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={200}
      />

      {(give.size > 0 || get.size > 0) && problem && <Alert>{problem}</Alert>}
      {error && <Alert>{error}</Alert>}

      <Button
        type="submit"
        className="w-full"
        loading={busy}
        disabled={!!problem}
      >
        Invia proposta a {other?.team_name}
      </Button>
    </form>
  )
}

function PlayerPicker({
  entries,
  selected,
  onToggle,
  empty,
}: {
  entries: RosterEntry[]
  selected: Set<string>
  onToggle: (playerId: string) => void
  empty: string
}) {
  if (entries.length === 0) return <Alert kind="info">{empty}</Alert>
  return (
    <ul className="divide-y divide-slate-200 dark:divide-slate-800">
      {entries.map((e) => {
        const on = selected.has(e.player_id)
        return (
          <li key={e.player_id}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(e.player_id)}
              className={`flex min-h-12 w-full items-center gap-3 px-1 py-2 text-left ${
                on
                  ? 'bg-green-50 dark:bg-green-950/50'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <RoleBadge role={e.player.role} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {e.player.name}
                </span>
                <span className="block truncate text-sm text-slate-500 dark:text-slate-400">
                  {e.player.real_team}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold">
                {e.cost} cr
              </span>
              <span
                aria-hidden="true"
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                  on
                    ? 'border-green-600 bg-green-600 text-white'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
              >
                {on ? '✓' : ''}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
