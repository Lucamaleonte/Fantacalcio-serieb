import PageTitle from '../components/PageTitle'
import { isSupabaseConfigured } from '../lib/env'

export default function Home() {
  return (
    <section>
      <PageTitle>Fantacalcio Serie B</PageTitle>
      <p>Ciao! L&apos;app è online.</p>
      <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
        Collegamento a Supabase:{' '}
        {isSupabaseConfigured ? 'configurato ✅' : 'non configurato ❌'}
      </p>
    </section>
  )
}
