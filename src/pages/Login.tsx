import { useState, type FormEvent } from 'react'
import { Alert, Button, Card, Field } from '../components/ui'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'

type Mode = 'login' | 'register'

export default function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) setError(errorMessage(error))
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: name.trim() } },
      })
      if (error) setError(errorMessage(error))
      // Se la conferma email è attiva su Supabase non arriva subito la sessione
      else if (!data.session)
        setInfo('Account creato: controlla la tua email per confermarlo.')
    }
    setBusy(false)
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setInfo(null)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
      <h1 className="mb-1 text-center text-3xl font-bold">
        Fantacalcio Serie B
      </h1>
      <p className="mb-6 text-center text-slate-500 dark:text-slate-400">
        {mode === 'login' ? 'Accedi alla tua lega' : 'Crea il tuo account'}
      </p>

      <Card>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <Field
              label="Il tuo nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={50}
              required
            />
          )}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === 'login' ? 'current-password' : 'new-password'
            }
            minLength={6}
            hint={mode === 'register' ? 'Almeno 6 caratteri' : undefined}
            required
          />

          {error && <Alert>{error}</Alert>}
          {info && <Alert kind="success">{info}</Alert>}

          <Button type="submit" loading={busy} className="w-full">
            {mode === 'login' ? 'Accedi' : 'Registrati'}
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-sm">
        {mode === 'login' ? (
          <>
            Non hai un account?{' '}
            <button
              type="button"
              className="font-semibold text-green-700 underline dark:text-green-400"
              onClick={() => switchMode('register')}
            >
              Registrati
            </button>
          </>
        ) : (
          <>
            Hai già un account?{' '}
            <button
              type="button"
              className="font-semibold text-green-700 underline dark:text-green-400"
              onClick={() => switchMode('login')}
            >
              Accedi
            </button>
          </>
        )}
      </p>
    </div>
  )
}
