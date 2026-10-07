import { useState, type FormEvent } from 'react'
import { Alert, Button, Card, Field } from '../components/ui'
import { useLeague } from '../hooks/league'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'

// Dopo il login, per chi non è ancora in una lega
export default function Onboarding() {
  const { refresh } = useLeague()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="mx-auto max-w-sm space-y-4 px-4 pt-[calc(env(safe-area-inset-top)+2rem)] pb-8">
      <div>
        <h1 className="text-2xl font-bold">Benvenuto!</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Entra nella lega con il codice invito che ti ha mandato l&apos;admin.
        </p>
      </div>

      <JoinLeagueForm onDone={refresh} />

      {showCreate ? (
        <CreateLeagueForm onDone={refresh} />
      ) : (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Sei tu l&apos;organizzatore?{' '}
          <button
            type="button"
            className="font-semibold text-green-700 underline dark:text-green-400"
            onClick={() => setShowCreate(true)}
          >
            Crea la lega
          </button>
        </p>
      )}

      <p className="pt-4 text-center text-sm">
        <button
          type="button"
          className="text-slate-500 underline dark:text-slate-400"
          onClick={() => supabase.auth.signOut()}
        >
          Esci
        </button>
      </p>
    </div>
  )
}

function JoinLeagueForm({ onDone }: { onDone: () => Promise<void> }) {
  const [code, setCode] = useState('')
  const [teamName, setTeamName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('join_league', {
      p_code: code.trim(),
      p_team_name: teamName.trim(),
    })
    if (error) {
      setError(errorMessage(error))
      setBusy(false)
    } else {
      await onDone()
    }
  }

  return (
    <Card title="Entra con codice invito">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Field
          label="Codice invito"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <Field
          label="Nome della tua squadra"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          maxLength={40}
          required
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} className="w-full">
          Entra nella lega
        </Button>
      </form>
    </Card>
  )
}

function CreateLeagueForm({ onDone }: { onDone: () => Promise<void> }) {
  const [leagueName, setLeagueName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('create_league', {
      p_name: leagueName.trim(),
      p_team_name: teamName.trim(),
    })
    if (error) {
      setError(errorMessage(error))
      setBusy(false)
    } else {
      await onDone()
    }
  }

  return (
    <Card title="Crea la lega">
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Si può creare una sola lega: chi la crea ne diventa l&apos;admin e
        riceve il codice da mandare agli amici.
      </p>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Field
          label="Nome della lega"
          value={leagueName}
          onChange={(e) => setLeagueName(e.target.value)}
          maxLength={60}
          required
        />
        <Field
          label="Nome della tua squadra"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          maxLength={40}
          required
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} className="w-full">
          Crea la lega
        </Button>
      </form>
    </Card>
  )
}
