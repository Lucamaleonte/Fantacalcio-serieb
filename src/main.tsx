import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import './index.css'
import { isSupabaseConfigured } from './lib/env'

// App installabile: con un nuovo deploy il service worker si aggiorna e la
// pagina si ricarica da sola. Si controlla anche quando l'app torna in primo piano.
const CHECK_EVERY_MS = 30 * 60 * 1000
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => {
      if (navigator.onLine) void registration.update()
    }
    setInterval(check, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

const root = createRoot(document.getElementById('root')!)

if (isSupabaseConfigured) {
  // Import dinamico: il client Supabase si crea solo se la configurazione c'è
  Promise.all([
    import('./App.tsx'),
    import('./components/AuthProvider.tsx'),
  ]).then(([{ default: App }, { default: AuthProvider }]) => {
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <HashRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </HashRouter>
        </ErrorBoundary>
      </StrictMode>,
    )
  })
} else {
  root.render(
    <p className="p-4">
      Configurazione mancante: imposta VITE_SUPABASE_URL e
      VITE_SUPABASE_ANON_KEY (vedi .env.example).
    </p>,
  )
}
