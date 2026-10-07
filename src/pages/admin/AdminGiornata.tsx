import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageTitle from '../../components/PageTitle'
import { Alert, Button } from '../../components/ui'
import { useCurrentLeague } from '../../hooks/league'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useNow } from '../../hooks/useNow'
import { formatDeadline, STATUS_LABELS } from '../../lib/matchdays'
import { loadMatchdayData } from './matchdayData'
import MatchdayCalc from './MatchdayCalc'
import VotesImport from './VotesImport'
import VotesManual from './VotesManual'

type Tab = 'import' | 'manual' | 'calc'

const TABS: { id: Tab; label: string }[] = [
  { id: 'import', label: 'Importa' },
  { id: 'manual', label: 'A mano' },
  { id: 'calc', label: 'Calcolo' },
]

// Voti e calcolo di una giornata (solo admin)
export default function AdminGiornata() {
  const { id = '' } = useParams()
  const { league } = useCurrentLeague()
  const now = useNow(30_000)
  const loader = useCallback(
    () => loadMatchdayData(league.id, id),
    [league.id, id],
  )
  const { data, error, loading, reload } = useAsyncData(loader)
  const [tab, setTab] = useState<Tab>('import')
  // Cambia a ogni import: ricarica i campi della scheda "A mano"
  const [importVersion, setImportVersion] = useState(0)

  return (
    <section className="space-y-4">
      <div>
        <Link
          to="/admin"
          className="text-sm font-semibold text-green-700 dark:text-green-400"
        >
          ‹ Admin
        </Link>
        <PageTitle>
          {data ? `Giornata ${data.matchday.number}` : 'Giornata'}
        </PageTitle>
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
        <p className="text-slate-500 dark:text-slate-400">Caricamento…</p>
      )}

      {data && (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {STATUS_LABELS[data.matchday.status]} · scadenza{' '}
            {formatDeadline(data.matchday.deadline)} · {data.votes.size} voti
            inseriti · {data.lineups.length}/{data.teams.length} formazioni
            visibili
          </p>

          <div
            className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800"
            role="tablist"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`min-h-11 rounded-lg text-sm font-semibold ${
                  tab === t.id
                    ? 'bg-white shadow dark:bg-slate-950'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'import' && (
            <VotesImport
              matchdayId={data.matchday.id}
              players={data.players}
              onSaved={() => {
                setImportVersion((v) => v + 1)
                reload()
              }}
            />
          )}
          {tab === 'manual' && (
            <VotesManual
              key={`${importVersion}-${data.lineups.length}`}
              data={data}
              onSaved={reload}
            />
          )}
          {tab === 'calc' && (
            <MatchdayCalc
              league={league}
              data={data}
              now={now}
              onSaved={reload}
            />
          )}
        </>
      )}
    </section>
  )
}
