import { useEffect, useState } from 'react'

// Ora corrente aggiornata periodicamente (conti alla rovescia, scadenze)
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
