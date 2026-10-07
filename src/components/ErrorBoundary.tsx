import { Component, type ErrorInfo, type ReactNode } from 'react'

// Ultima rete di sicurezza: se una pagina va in errore mostra un messaggio
// leggibile invece di una schermata bianca
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-bold">Qualcosa è andato storto</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Ricarica la pagina. Se il problema continua, avvisa l&apos;admin.
        </p>
        <button
          type="button"
          className="min-h-11 rounded-xl bg-green-600 px-4 font-semibold text-white"
          onClick={() => window.location.reload()}
        >
          Ricarica
        </button>
      </div>
    )
  }
}
