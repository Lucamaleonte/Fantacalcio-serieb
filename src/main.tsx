import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import { isSupabaseConfigured } from './lib/env'

const root = createRoot(document.getElementById('root')!)

if (isSupabaseConfigured) {
  // Import dinamico: il client Supabase si crea solo se la configurazione c'è
  Promise.all([
    import('./App.tsx'),
    import('./components/AuthProvider.tsx'),
  ]).then(([{ default: App }, { default: AuthProvider }]) => {
    root.render(
      <StrictMode>
        <HashRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </HashRouter>
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
