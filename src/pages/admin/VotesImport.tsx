import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Alert, Button, Card, RoleBadge } from '../../components/ui'
import { readTextFile } from '../../lib/csv'
import { errorMessage } from '../../lib/errors'
import { comparePlayers } from '../../lib/roles'
import type { Player } from '../../lib/types'
import { matchVotes } from '../../lib/voteMatching'
import { parseVotes, type VoteRow } from '../../lib/votesParser'
import { saveVotes, type VoteInput } from './matchdayData'

function formatVote(value: number | null): string {
  return value === null ? 'SV' : String(value).replace('.', ',')
}

export default function VotesImport({
  matchdayId,
  players,
  onSaved,
}: {
  matchdayId: string
  players: Player[]
  onSaved: () => void
}) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  // Scelte manuali per righe ambigue o non riconosciute: riga -> id giocatore ('' = ignora)
  const [choices, setChoices] = useState<Map<number, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<number | null>(null)

  const parsed = useMemo(() => parseVotes(text), [text])
  const match = useMemo(
    () => matchVotes(parsed.rows, players),
    [parsed, players],
  )

  // Giocatori raggruppati per squadra reale, per i menu di scelta
  const byTeam = useMemo(() => {
    const groups = new Map<string, Player[]>()
    for (const p of [...players].sort(comparePlayers)) {
      if (!groups.has(p.real_team)) groups.set(p.real_team, [])
      groups.get(p.real_team)!.push(p)
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b, 'it'))
  }, [players])

  const toSave: VoteInput[] = useMemo(() => {
    const rows = new Map<string, VoteInput>()
    const add = (row: VoteRow, playerId: string) =>
      rows.set(playerId, {
        player_id: playerId,
        vote: row.vote,
        fantavote: row.fantavote,
      })
    for (const m of match.matched) add(m.row, m.player.id)
    for (const { row } of [
      ...match.ambiguous,
      ...match.unmatched.map((row) => ({ row })),
    ]) {
      const choice = choices.get(row.line)
      if (choice) add(row, choice)
    }
    return [...rows.values()]
  }, [match, choices])

  function reset(nextText: string, name: string | null) {
    setText(nextText)
    setFileName(name)
    setChoices(new Map())
    setSaved(null)
    setError(null)
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      reset(await readTextFile(file), file.name)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  function choose(line: number, playerId: string) {
    setChoices((prev) => new Map(prev).set(line, playerId))
  }

  async function handleSave() {
    setBusy(true)
    setError(null)
    try {
      setSaved(await saveVotes(matchdayId, toSave))
      setText('')
      setFileName(null)
      setChoices(new Map())
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
    }
    setBusy(false)
  }

  const toReview = match.ambiguous.length + match.unmatched.length

  return (
    <div className="space-y-4">
      {saved !== null && (
        <Alert kind="success">
          Salvati {saved} voti. Ora puoi controllarli in &quot;A mano&quot; e
          calcolare la giornata.
        </Alert>
      )}

      <Card title="Incolla i voti">
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Colonne <code>Nome;Squadra;Voto;Fantavoto</code> (anche separate da
          tab o virgola). Vanno bene intestazioni, righe vuote, virgola decimale
          e SV.
        </p>
        <textarea
          className="block h-40 w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
          placeholder={
            'Nome;Squadra;Voto;Fantavoto\nPerin;Palermo;6,5;7,5\nLeali;Hellas Verona;SV;SV'
          }
          value={text}
          onChange={(e) => reset(e.target.value, null)}
        />
        <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-center text-sm font-semibold text-green-700 dark:border-slate-700 dark:text-green-400">
          {fileName ?? 'Oppure carica un file CSV'}
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr-only"
            onChange={handleFile}
          />
        </label>
      </Card>

      {text.trim() !== '' && (
        <Card title="Anteprima">
          <ul className="mb-4 grid grid-cols-3 gap-2 text-center">
            <Count label="Abbinati" value={match.matched.length} tone="good" />
            <Count
              label="Da controllare"
              value={toReview}
              tone={toReview ? 'warn' : 'neutral'}
            />
            <Count
              label="Con errori"
              value={parsed.errors.length}
              tone={parsed.errors.length ? 'bad' : 'neutral'}
            />
          </ul>

          {match.ambiguous.length > 0 && (
            <ReviewList title="Ambigui: scegli il giocatore giusto">
              {match.ambiguous.map(({ row, candidates }) => (
                <ReviewRow key={row.line} row={row}>
                  <select
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-950"
                    value={choices.get(row.line) ?? ''}
                    onChange={(e) => choose(row.line, e.target.value)}
                    aria-label={`Giocatore per ${row.name}`}
                  >
                    <option value="">— Ignora —</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {`${c.name} (${c.role}, ${c.real_team})`}
                      </option>
                    ))}
                  </select>
                </ReviewRow>
              ))}
            </ReviewList>
          )}

          {match.unmatched.length > 0 && (
            <ReviewList title="Non riconosciuti: abbina a mano o ignora">
              {match.unmatched.map((row) => (
                <ReviewRow key={row.line} row={row}>
                  <select
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-950"
                    value={choices.get(row.line) ?? ''}
                    onChange={(e) => choose(row.line, e.target.value)}
                    aria-label={`Giocatore per ${row.name}`}
                  >
                    <option value="">— Ignora —</option>
                    {byTeam.map(([team, list]) => (
                      <optgroup key={team} label={team}>
                        {list.map((p) => (
                          <option key={p.id} value={p.id}>
                            {`${p.name} (${p.role})`}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </ReviewRow>
              ))}
            </ReviewList>
          )}

          {parsed.errors.length > 0 && (
            <details className="mb-3">
              <summary className="cursor-pointer font-semibold text-red-700 dark:text-red-400">
                Righe con errori ({parsed.errors.length}): non importate
              </summary>
              <ul className="mt-2 space-y-1 text-sm">
                {parsed.errors.map((e) => (
                  <li
                    key={e.line}
                    className="rounded-lg bg-red-50 px-2 py-1 dark:bg-red-950"
                  >
                    <span className="font-semibold">Riga {e.line}:</span>{' '}
                    {e.reason}
                    <span className="block truncate font-mono text-xs text-slate-500">
                      {e.text}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {match.matched.length > 0 && (
            <details className="mb-3">
              <summary className="cursor-pointer font-semibold">
                Abbinati automaticamente ({match.matched.length})
              </summary>
              <ul className="mt-2 divide-y divide-slate-200 text-sm dark:divide-slate-800">
                {match.matched.map(({ row, player }) => (
                  <li key={row.line} className="flex items-center gap-2 py-1.5">
                    <RoleBadge role={player.role} />
                    <span className="min-w-0 flex-1 truncate">
                      {player.name}
                      {row.name !== player.name && (
                        <span className="text-slate-500"> ← {row.name}</span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatVote(row.vote)} /{' '}
                      <strong>{formatVote(row.fantavote)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {parsed.ignored > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {parsed.ignored} righe senza colonne (es. titoli) ignorate.
            </p>
          )}
        </Card>
      )}

      {error && <Alert>{error}</Alert>}

      {text.trim() !== '' && (
        <Button
          className="w-full"
          loading={busy}
          disabled={toSave.length === 0}
          onClick={handleSave}
        >
          {toSave.length === 0
            ? 'Nessun voto da salvare'
            : `Salva ${toSave.length} voti`}
        </Button>
      )}
    </div>
  )
}

function Count({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'good' | 'warn' | 'bad' | 'neutral'
}) {
  const color = {
    good: 'text-green-700 dark:text-green-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-red-700 dark:text-red-400',
    neutral: 'text-slate-700 dark:text-slate-300',
  }[tone]
  return (
    <li className="rounded-xl bg-slate-100 p-2 dark:bg-slate-800">
      <span className={`block text-2xl font-bold ${color}`}>{value}</span>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {label}
      </span>
    </li>
  )
}

function ReviewList({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="mb-4">
      <h3 className="mb-2 font-semibold text-amber-700 dark:text-amber-400">
        {title}
      </h3>
      <ul className="space-y-3">{children}</ul>
    </div>
  )
}

function ReviewRow({ row, children }: { row: VoteRow; children: ReactNode }) {
  return (
    <li className="rounded-xl border border-amber-200 p-2 text-sm dark:border-amber-900">
      <p className="mb-1">
        <span className="font-semibold">{row.name}</span>
        {row.team && <span className="text-slate-500"> · {row.team}</span>}
        <span className="float-right tabular-nums">
          {formatVote(row.vote)} / <strong>{formatVote(row.fantavote)}</strong>
        </span>
      </p>
      {children}
    </li>
  )
}
