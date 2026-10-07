import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import LeagueSettingsCard from './admin/LeagueSettingsCard'
import MembersCard from './admin/MembersCard'
import PageTitle from '../components/PageTitle'
import { Alert, Button, Card, Field, Select, Sheet } from '../components/ui'
import { useCurrentLeague } from '../hooks/league'
import { useAsyncData } from '../hooks/useAsyncData'
import { errorMessage } from '../lib/errors'
import {
  formatDeadline,
  fromDateTimeLocal,
  nextMatchdayNumber,
  STATUS_LABELS,
  toDateTimeLocal,
} from '../lib/matchdays'
import { supabase } from '../lib/supabase'
import type { Fixture, Matchday, MatchdayStatus } from '../lib/types'

interface AdminData {
  matchdays: Matchday[]
  fixtures: Fixture[]
  teams: Map<string, string>
  members: number
  calendarReady: boolean
}

async function loadAdminData(leagueId: string): Promise<AdminData> {
  const [matchdays, fixtures, members] = await Promise.all([
    supabase
      .from('matchdays')
      .select('id, league_id, number, deadline, status')
      .eq('league_id', leagueId)
      .order('number', { ascending: false }),
    supabase
      .from('fixtures')
      .select(
        'id, matchday_id, home_user_id, away_user_id, home_points, away_points, home_goals, away_goals',
      )
      .eq('league_id', leagueId),
    supabase
      .from('league_members')
      .select('user_id, team_name, calendar_position')
      .eq('league_id', leagueId),
  ])
  if (matchdays.error) throw matchdays.error
  if (fixtures.error) throw fixtures.error
  if (members.error) throw members.error
  const rows = members.data as {
    user_id: string
    team_name: string
    calendar_position: number | null
  }[]
  return {
    matchdays: matchdays.data as Matchday[],
    fixtures: fixtures.data as Fixture[],
    teams: new Map(rows.map((m) => [m.user_id, m.team_name])),
    members: rows.length,
    calendarReady: rows.every((m) => m.calendar_position !== null),
  }
}

export default function Admin() {
  const { league } = useCurrentLeague()
  const loader = useCallback(() => loadAdminData(league.id), [league.id])
  const { data, error, loading, reload } = useAsyncData(loader)

  return (
    <section className="space-y-4">
      <PageTitle>Admin</PageTitle>

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
          <MatchdaysCard leagueId={league.id} data={data} onChanged={reload} />
          <CalendarCard leagueId={league.id} data={data} onChanged={reload} />
        </>
      )}
      <MembersCard onChanged={reload} />
      <LeagueSettingsCard />
    </section>
  )
}

function CalendarCard({
  leagueId,
  data,
  onChanged,
}: {
  leagueId: string
  data: AdminData
  onChanged: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{
    kind: 'error' | 'success'
    text: string
  } | null>(null)
  const scored = data.matchdays.some((m) => m.status === 'scored')

  async function generate() {
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.rpc('generate_calendar', {
      p_league_id: leagueId,
    })
    if (error) {
      setMessage({ kind: 'error', text: errorMessage(error) })
    } else {
      setMessage({ kind: 'success', text: 'Calendario generato' })
      onChanged()
    }
    setConfirming(false)
    setBusy(false)
  }

  return (
    <Card title="Calendario scontri diretti">
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        {data.calendarReady
          ? `Calendario generato per ${data.members} squadre. Le partite di ogni nuova giornata si creano da sole.`
          : `Squadre nella lega: ${data.members}. Genera il calendario quando sono entrati tutti.`}
      </p>

      {confirming ? (
        <div className="space-y-2">
          <Alert kind="info">
            {data.calendarReady
              ? `L'ordine delle squadre verrà estratto di nuovo: cambiano le partite delle giornate non ancora calcolate${scored ? ' (quelle già calcolate restano come sono)' : ''}. Continuare?`
              : 'L’ordine delle squadre viene estratto a caso. Continuare?'}
          </Alert>
          <div className="flex gap-2">
            <Button loading={busy} onClick={generate}>
              Sì, genera
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Annulla
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant={data.calendarReady ? 'secondary' : 'primary'}
          disabled={data.members < 2}
          onClick={() => setConfirming(true)}
        >
          {data.calendarReady ? 'Rigenera calendario' : 'Genera calendario'}
        </Button>
      )}

      {message && (
        <div className="mt-3">
          <Alert kind={message.kind}>{message.text}</Alert>
        </div>
      )}
    </Card>
  )
}

function MatchdaysCard({
  leagueId,
  data,
  onChanged,
}: {
  leagueId: string
  data: AdminData
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<Matchday | null>(null)
  const closeEdit = useCallback(() => setEditing(null), [])

  return (
    <Card title="Giornate">
      <NewMatchdayForm
        key={data.matchdays.length}
        leagueId={leagueId}
        defaultNumber={nextMatchdayNumber(data.matchdays)}
        onCreated={onChanged}
      />

      {data.matchdays.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {data.matchdays.map((m) => {
            const fixtures = data.fixtures.filter((f) => f.matchday_id === m.id)
            return (
              <li key={m.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(m)}
                  className="min-w-0 flex-1 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">Giornata {m.number}</span>
                    <StatusBadge status={m.status} />
                  </span>
                  <span className="block text-sm text-slate-500 dark:text-slate-400">
                    Scadenza: {formatDeadline(m.deadline)}
                  </span>
                  {fixtures.length > 0 && (
                    <span className="mt-1 block text-sm">
                      {fixtures.map((f) => (
                        <span key={f.id} className="block truncate">
                          {data.teams.get(f.home_user_id)} –{' '}
                          {data.teams.get(f.away_user_id)}
                          {f.home_goals !== null &&
                            ` (${f.home_goals}-${f.away_goals})`}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
                <Link
                  to={`/admin/giornata/${m.id}`}
                  className="flex min-h-11 shrink-0 items-center rounded-xl border border-slate-300 px-3 text-sm font-semibold dark:border-slate-700"
                >
                  Voti ›
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <Sheet title={`Giornata ${editing.number}`} onClose={closeEdit}>
          <EditMatchday
            matchday={editing}
            onDone={() => {
              setEditing(null)
              onChanged()
            }}
          />
        </Sheet>
      )}
    </Card>
  )
}

function StatusBadge({ status }: { status: MatchdayStatus }) {
  const style = {
    open: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    locked: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    scored: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  }[status]
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function NewMatchdayForm({
  leagueId,
  defaultNumber,
  onCreated,
}: {
  leagueId: string
  defaultNumber: number
  onCreated: () => void
}) {
  const [number, setNumber] = useState(String(defaultNumber))
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const iso = fromDateTimeLocal(deadline)
    if (!iso) {
      setError('Scegli giorno e ora della scadenza')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase
      .from('matchdays')
      .insert({ league_id: leagueId, number: Number(number), deadline: iso })
    if (error) {
      setError(errorMessage(error))
      setBusy(false)
    } else {
      onCreated()
    }
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <h3 className="font-semibold">Nuova giornata</h3>
      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <Field
          label="Numero"
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          required
        />
        <Field
          label="Scadenza formazioni"
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          required
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Di solito l&apos;orario della prima partita di Serie B del turno.
      </p>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" loading={busy}>
        Crea giornata {number}
      </Button>
    </form>
  )
}

function EditMatchday({
  matchday,
  onDone,
}: {
  matchday: Matchday
  onDone: () => void
}) {
  const [deadline, setDeadline] = useState(toDateTimeLocal(matchday.deadline))
  const [status, setStatus] = useState<MatchdayStatus>(matchday.status)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(event: FormEvent) {
    event.preventDefault()
    const iso = fromDateTimeLocal(deadline)
    if (!iso) {
      setError('Scegli giorno e ora della scadenza')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase
      .from('matchdays')
      .update({ deadline: iso, status })
      .eq('id', matchday.id)
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
      .from('matchdays')
      .delete()
      .eq('id', matchday.id)
    if (error) {
      setError(errorMessage(error))
      setBusy(false)
    } else {
      onDone()
    }
  }

  return (
    <div className="space-y-4">
      <form className="space-y-3" onSubmit={save}>
        <Field
          label="Scadenza formazioni"
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          required
        />
        <Select
          label="Stato"
          value={status}
          onChange={(e) => setStatus(e.target.value as MatchdayStatus)}
        >
          <option value="open">
            Aperta – si possono inserire le formazioni
          </option>
          <option value="locked">Chiusa – formazioni bloccate</option>
          <option value="scored" disabled={matchday.status !== 'scored'}>
            Calcolata – si imposta con il calcolo punteggi
          </option>
        </Select>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={busy}>
          Salva
        </Button>
      </form>

      {matchday.status !== 'scored' &&
        (confirmDelete ? (
          <div className="space-y-2">
            <Alert kind="info">
              Eliminare la giornata {matchday.number}? Si cancellano anche le
              formazioni e i voti inseriti.
            </Alert>
            <div className="flex gap-2">
              <Button
                variant="danger"
                className="flex-1"
                loading={busy}
                onClick={remove}
              >
                Sì, elimina
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmDelete(false)}
              >
                Annulla
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="danger"
            className="w-full"
            onClick={() => setConfirmDelete(true)}
          >
            Elimina giornata
          </Button>
        ))}
    </div>
  )
}
