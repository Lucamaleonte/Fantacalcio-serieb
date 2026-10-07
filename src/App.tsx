import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Admin from './pages/Admin'
import AdminGiornata from './pages/admin/AdminGiornata'
import LeagueProvider from './components/LeagueProvider'
import { Alert, Button, LoadingScreen } from './components/ui'
import { useAuth } from './hooks/auth'
import { useLeague } from './hooks/league'
import { supabase } from './lib/supabase'
import Classifica from './pages/Classifica'
import Formazione from './pages/Formazione'
import Giocatori from './pages/Giocatori'
import Home from './pages/Home'
import ImportaGiocatori from './pages/ImportaGiocatori'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Profilo from './pages/Profilo'
import Rosa from './pages/Rosa'

export default function App() {
  const { session, loading } = useAuth()

  if (loading) return <LoadingScreen />

  // Non loggato: solo la pagina di accesso
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <LeagueProvider key={session.user.id} userId={session.user.id}>
      <LeagueRoutes />
    </LeagueProvider>
  )
}

function LeagueRoutes() {
  const { loading, error, league, isAdmin, refresh } = useLeague()

  if (loading) return <LoadingScreen />

  if (error) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
        <Alert>{error}</Alert>
        <Button onClick={() => void refresh()}>Riprova</Button>
        <Button variant="secondary" onClick={() => supabase.auth.signOut()}>
          Esci
        </Button>
      </div>
    )
  }

  // Loggato ma non ancora in una lega
  if (!league) {
    return (
      <Routes>
        <Route path="/benvenuto" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/benvenuto" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="giocatori" element={<Giocatori />} />
        <Route
          path="giocatori/importa"
          element={
            isAdmin ? (
              <ImportaGiocatori />
            ) : (
              <Navigate to="/giocatori" replace />
            )
          }
        />
        <Route path="rosa" element={<Rosa />} />
        <Route path="formazione" element={<Formazione />} />
        <Route path="classifica" element={<Classifica />} />
        <Route path="profilo" element={<Profilo />} />
        <Route
          path="admin"
          element={isAdmin ? <Admin /> : <Navigate to="/" replace />}
        />
        <Route
          path="admin/giornata/:id"
          element={isAdmin ? <AdminGiornata /> : <Navigate to="/" replace />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
