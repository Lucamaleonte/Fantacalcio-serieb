import { useMemo, useState } from 'react'
import { Alert, Button, RoleBadge } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { buildLineup, type LineupPlayer } from '../../lib/scoring'
import { parseVoteValue } from '../../lib/votesParser'
import { saveVotes, type MatchdayData, type VoteInput } from './matchdayData'

function toText(value: number | null | undefined): string {
  return value === null || value === undefined
    ? ''
    : String(value).replace('.', ',')
}

// Inserimento e correzione dei fantavoti dei giocatori schierati (ripiego all'import)
export default function VotesManual({
  data,
  onSaved,
}: {
  data: MatchdayData
  onSaved: () => void
}) {
  const playersById = useMemo(
    () => new Map<string, LineupPlayer>(data.players.map((p) => [p.id, p])),
    [data.players],
  )

  // Squadre con formazione: titolari e panchina nell'ordine schierato
  const groups = useMemo(
    () =>
      data.teams
        .map((t) => {
          const row = data.lineups.find((l) => l.user_id === t.user_id)
          const lineup = row
            ? buildLineup(row.formation, row.lineup_players, playersById)
            : null
          return { ...t, lineup }
        })
        .filter((g) => g.lineup),
    [data, playersById],
  )

  const initial = useMemo(() => {
    const values = new Map<string, string>()
    for (const g of groups) {
      for (const p of [...g.lineup!.starters, ...g.lineup!.bench]) {
        values.set(p.id, toText(data.votes.get(p.id)?.fantavote))
      }
    }
    return values
  }, [groups, data.votes])

  const [values, setValues] = useState<Map<string, string>>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<number | null>(null)

  const changed = [...values].filter(
    ([id, text]) => text.trim() !== (initial.get(id) ?? ''),
  )
  const invalid = new Set(
    [...values]
      .filter(([, text]) => parseVoteValue(text) === undefined)
      .map(([id]) => id),
  )

  async function handleSave() {
    setBusy(true)
    setError(null)
    const rows: VoteInput[] = changed.map(([id, text]) => {
      const fantavote = parseVoteValue(text) ?? null
      return {
        player_id: id,
        // Il voto base resta quello importato; senza fantavoto diventa SV
        vote: fantavote === null ? null : (data.votes.get(id)?.vote ?? null),
        fantavote,
      }
    })
    try {
      setSaved(await saveVotes(data.matchday.id, rows))
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
    }
    setBusy(false)
  }

  if (groups.length === 0) {
    return (
      <Alert kind="info">
        Nessuna formazione visibile: le formazioni delle squadre si vedono dopo
        la scadenza.
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Fantavoto di ogni giocatore schierato. Campo vuoto = senza voto (SV).
        Usa la virgola o il punto per i decimali.
      </p>

      {groups.map((g) => (
        <details
          key={g.user_id}
          className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          open={groups.length <= 2}
        >
          <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 font-semibold">
            <span>{g.team_name}</span>
            <span className="text-sm font-normal text-slate-500">
              {g.lineup!.formation}
            </span>
          </summary>
          <div className="px-4 pb-3">
            {(['starters', 'bench'] as const).map((part) => (
              <div key={part}>
                <h4 className="mt-2 mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {part === 'starters' ? 'Titolari' : 'Panchina'}
                </h4>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {g.lineup![part].map((p) => (
                    <li
                      key={p.id}
                      className="flex min-h-12 items-center gap-2 py-1"
                    >
                      <RoleBadge role={p.role} />
                      <label
                        htmlFor={`fv-${p.id}`}
                        className="min-w-0 flex-1 truncate"
                      >
                        {p.name}
                      </label>
                      <input
                        id={`fv-${p.id}`}
                        inputMode="decimal"
                        placeholder="SV"
                        className={`w-20 rounded-lg border px-2 py-2 text-right tabular-nums dark:bg-slate-950 ${
                          invalid.has(p.id)
                            ? 'border-red-500'
                            : 'border-slate-300 dark:border-slate-700'
                        }`}
                        value={values.get(p.id) ?? ''}
                        onChange={(e) => {
                          setSaved(null)
                          setValues((prev) =>
                            new Map(prev).set(p.id, e.target.value),
                          )
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ))}

      {invalid.size > 0 && (
        <Alert>Alcuni valori non sono numeri validi (es. 6,5).</Alert>
      )}
      {error && <Alert>{error}</Alert>}
      {saved !== null && <Alert kind="success">Salvati {saved} voti.</Alert>}

      <Button
        className="w-full"
        loading={busy}
        disabled={changed.length === 0 || invalid.size > 0}
        onClick={handleSave}
      >
        {changed.length === 0
          ? 'Nessuna modifica'
          : `Salva ${changed.length} voti`}
      </Button>
    </div>
  )
}
