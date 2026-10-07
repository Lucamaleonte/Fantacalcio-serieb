import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../lib/errors'

interface AsyncState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
}

// Carica dati asincroni. `loader` deve essere stabile (useCallback):
// cambia solo quando cambiano i parametri della richiesta.
export function useAsyncData<T>(loader: () => Promise<T>) {
  const [state, setState] = useState<AsyncState<T>>({
    data: undefined,
    error: null,
    loading: true,
  })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    loader().then(
      (data) => active && setState({ data, error: null, loading: false }),
      (error: unknown) =>
        active &&
        setState((s) => ({ ...s, error: errorMessage(error), loading: false })),
    )
    return () => {
      active = false
    }
  }, [loader, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return { ...state, reload }
}
