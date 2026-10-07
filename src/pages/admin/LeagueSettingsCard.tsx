import { useState, type FormEvent } from 'react'
import { Alert, Button, Card, Field } from '../../components/ui'
import { useCurrentLeague } from '../../hooks/league'
import { errorMessage } from '../../lib/errors'
import {
  FORMATION_OPTIONS,
  settingsForm,
  validateSettings,
  type SettingsForm,
} from '../../lib/leagueSettings'
import { supabase } from '../../lib/supabase'

export default function LeagueSettingsCard() {
  const { league, refresh } = useCurrentLeague()
  const [form, setForm] = useState<SettingsForm>(() => settingsForm(league))
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [saved, setSaved] = useState(false)

  const set =
    (key: keyof SettingsForm) => (e: { target: { value: string } }) => {
      setForm((f) => ({ ...f, [key]: e.target.value }))
      setSaved(false)
    }

  function toggleFormation(formation: string) {
    setForm((f) => ({
      ...f,
      allowed_formations: f.allowed_formations.includes(formation)
        ? f.allowed_formations.filter((x) => x !== formation)
        : [...f.allowed_formations, formation],
    }))
    setSaved(false)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const result = validateSettings(form)
    if (!result.values) {
      setErrors(result.errors)
      return
    }
    setBusy(true)
    setErrors([])
    const { error } = await supabase
      .from('leagues')
      .update(result.values)
      .eq('id', league.id)
    if (error) {
      setErrors([errorMessage(error)])
    } else {
      setSaved(true)
      await refresh()
    }
    setBusy(false)
  }

  const number = { inputMode: 'numeric' as const, required: true }

  return (
    <Card title="Impostazioni lega">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Field
          label="Nome della lega"
          value={form.name}
          onChange={set('name')}
          maxLength={60}
          required
        />

        <Field
          label="Budget (crediti)"
          value={form.budget}
          onChange={set('budget')}
          {...number}
        />

        <fieldset>
          <legend className="mb-1 text-sm font-medium">
            Giocatori per ruolo nella rosa
          </legend>
          <div className="grid grid-cols-4 gap-2">
            <Field
              label="P"
              value={form.n_gk}
              onChange={set('n_gk')}
              {...number}
            />
            <Field
              label="D"
              value={form.n_def}
              onChange={set('n_def')}
              {...number}
            />
            <Field
              label="C"
              value={form.n_mid}
              onChange={set('n_mid')}
              {...number}
            />
            <Field
              label="A"
              value={form.n_att}
              onChange={set('n_att')}
              {...number}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-medium">
            Moduli consentiti
          </legend>
          <div className="grid grid-cols-4 gap-2">
            {FORMATION_OPTIONS.map((f) => {
              const checked = form.allowed_formations.includes(f)
              return (
                <label
                  key={f}
                  className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold ${
                    checked
                      ? 'border-green-600 bg-green-600 text-white'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleFormation(f)}
                  />
                  {f}
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Sostituzioni massime"
            value={form.max_substitutions}
            onChange={set('max_substitutions')}
            {...number}
          />
          <Field
            label="Valore senza voto"
            value={form.no_vote_value}
            onChange={set('no_vote_value')}
            inputMode="decimal"
            hint="Titolare SV senza sostituto"
            required
          />
          <Field
            label="Soglia primo gol"
            value={form.goal_threshold}
            onChange={set('goal_threshold')}
            inputMode="decimal"
            required
          />
          <Field
            label="Punti per ogni gol in più"
            value={form.goal_step}
            onChange={set('goal_step')}
            inputMode="decimal"
            required
          />
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Le modifiche valgono da subito, anche per i ricalcoli. Abbassare
          budget o limiti per ruolo non toglie giocatori già in rosa: blocca
          solo i nuovi acquisti.
        </p>

        {errors.length > 0 && (
          <Alert>
            {errors.map((e) => (
              <span key={e} className="block">
                {e}
              </span>
            ))}
          </Alert>
        )}
        {saved && <Alert kind="success">Impostazioni salvate</Alert>}

        <Button type="submit" className="w-full" loading={busy}>
          Salva impostazioni
        </Button>
      </form>
    </Card>
  )
}
