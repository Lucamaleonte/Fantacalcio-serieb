import { useCallback, useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import { Alert, Button, Card, RoleBadge } from '../components/ui'
import { useCurrentLeague } from '../hooks/league'
import { useAsyncData } from '../hooks/useAsyncData'
import { readTextFile } from '../lib/csv'
import { errorMessage } from '../lib/errors'
import { playerKey } from '../lib/normalize'
import { fetchAllPlayers } from '../lib/players'
import { parsePlayersCsv } from '../lib/playersCsv'
import { supabase } from '../lib/supabase'

const CHUNK = 500
const PREVIEW = 50

export default function ImportaGiocatori() {
  const { league } = useCurrentLeague()
  const loader = useCallback(() => fetchAllPlayers(league.id), [league.id])
  const existing = useAsyncData(loader)

  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState<number | null>(null)

  const parsed = useMemo(() => parsePlayersCsv(text), [text])

  // Righe nuove e righe già presenti nella lega (stesso nome e squadra)
  const { toImport, alreadyPresent } = useMemo(() => {
    const keys = new Set(
      existing.data?.map((p) => playerKey(p.name, p.real_team)),
    )
    const toImport = parsed.rows.filter(
      (r) => !keys.has(playerKey(r.name, r.real_team)),
    )
    return { toImport, alreadyPresent: parsed.rows.length - toImport.length }
  }, [parsed, existing.data])

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setImported(null)
    setError(null)
    try {
      setText(await readTextFile(file))
      setFileName(file.name)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function handleImport() {
    setBusy(true)
    setError(null)
    try {
      for (let i = 0; i < toImport.length; i += CHUNK) {
        const chunk = toImport.slice(i, i + CHUNK).map((r) => ({
          league_id: league.id,
          name: r.name,
          role: r.role,
          real_team: r.real_team,
        }))
        const { error } = await supabase.from('players').upsert(chunk, {
          onConflict: 'league_id,name,real_team',
          ignoreDuplicates: true,
        })
        if (error) throw error
      }
      setImported(toImport.length)
      setText('')
      setFileName(null)
      existing.reload()
    } catch (e) {
      setError(errorMessage(e))
    }
    setBusy(false)
  }

  return (
    <section className="space-y-4">
      <div>
        <Link
          to="/giocatori"
          className="text-sm font-semibold text-green-700 dark:text-green-400"
        >
          ‹ Giocatori
        </Link>
        <PageTitle>Importa giocatori</PageTitle>
      </div>

      {imported !== null && (
        <Alert kind="success">
          {imported === 1
            ? 'Importato 1 giocatore.'
            : `Importati ${imported} giocatori.`}{' '}
          <Link to="/giocatori" className="font-semibold underline">
            Vai all&apos;elenco
          </Link>
        </Alert>
      )}

      <Card title="1. Scegli il file">
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          File CSV con tre colonne: <code>nome;ruolo;squadra</code> (ruolo = P,
          D, C o A). L&apos;intestazione è facoltativa; vanno bene anche
          separatori virgola o tab.
        </p>
        <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-4 py-4 text-center font-semibold text-green-700 dark:border-slate-700 dark:text-green-400">
          {fileName ?? 'Seleziona il file CSV'}
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr-only"
            onChange={handleFile}
          />
        </label>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-slate-500 dark:text-slate-400">
            Oppure incolla il testo
          </summary>
          <textarea
            className="mt-2 block h-40 w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            placeholder={'Perin;P;Palermo\nLeali;P;Hellas Verona'}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setFileName(null)
              setImported(null)
            }}
          />
        </details>
      </Card>

      {existing.error && <Alert>{existing.error}</Alert>}

      {text.trim() !== '' && (
        <Card title="2. Controlla l'anteprima">
          <ul className="mb-4 grid grid-cols-3 gap-2 text-center">
            <Count label="Da importare" value={toImport.length} tone="good" />
            <Count label="Già presenti" value={alreadyPresent} tone="neutral" />
            <Count
              label="Con errori"
              value={parsed.errors.length}
              tone={parsed.errors.length ? 'bad' : 'neutral'}
            />
          </ul>

          {alreadyPresent > 0 && (
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              I giocatori già presenti (stesso nome e squadra) vengono saltati.
            </p>
          )}

          {parsed.errors.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 font-semibold text-red-700 dark:text-red-400">
                Righe non importate
              </h3>
              <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
                {parsed.errors.map((e) => (
                  <li
                    key={e.line}
                    className="rounded-lg bg-red-50 px-2 py-1 dark:bg-red-950"
                  >
                    <span className="font-semibold">Riga {e.line}:</span>{' '}
                    {e.reason}
                    <span className="block truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                      {e.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {toImport.length > 0 && (
            <>
              <h3 className="mb-2 font-semibold">Nuovi giocatori</h3>
              <ul className="mb-2 divide-y divide-slate-200 text-sm dark:divide-slate-800">
                {toImport.slice(0, PREVIEW).map((r) => (
                  <li key={r.line} className="flex items-center gap-2 py-1.5">
                    <RoleBadge role={r.role} />
                    <span className="flex-1 truncate">{r.name}</span>
                    <span className="truncate text-slate-500 dark:text-slate-400">
                      {r.real_team}
                    </span>
                  </li>
                ))}
              </ul>
              {toImport.length > PREVIEW && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  …e altri {toImport.length - PREVIEW}
                </p>
              )}
            </>
          )}
        </Card>
      )}

      {error && <Alert>{error}</Alert>}

      {text.trim() !== '' && (
        <Button
          className="w-full"
          loading={busy}
          disabled={toImport.length === 0 || existing.loading}
          onClick={handleImport}
        >
          {toImport.length === 0
            ? 'Nessun giocatore nuovo da importare'
            : `3. Importa ${toImport.length} giocatori`}
        </Button>
      )}
    </section>
  )
}

function Count({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'good' | 'bad' | 'neutral'
}) {
  const color = {
    good: 'text-green-700 dark:text-green-400',
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
