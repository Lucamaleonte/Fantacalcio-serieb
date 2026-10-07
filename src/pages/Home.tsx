import { Link } from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import { Card } from '../components/ui'
import { useCurrentLeague } from '../hooks/league'

export default function Home() {
  const { league, membership, isAdmin } = useCurrentLeague()

  return (
    <section className="space-y-4">
      <PageTitle>Ciao, {membership.team_name}!</PageTitle>

      <Card title="Prossima giornata">
        <p className="text-slate-500 dark:text-slate-400">
          Nessuna giornata in programma per ora.
        </p>
      </Card>

      {isAdmin && (
        <Card title="Invita gli amici">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Codice invito di {league.name}:{' '}
            <span className="font-semibold tracking-widest text-slate-900 dark:text-slate-100">
              {league.invite_code}
            </span>
          </p>
          <Link
            to="/profilo"
            className="mt-2 inline-block text-sm font-semibold text-green-700 underline dark:text-green-400"
          >
            Copia o rigenera il codice
          </Link>
        </Card>
      )}
    </section>
  )
}
