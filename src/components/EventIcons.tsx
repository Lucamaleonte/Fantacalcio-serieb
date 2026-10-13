import { eventIcons, type VoteEvents } from '../lib/voteEvents'

// Bonus e malus come emoji (⚽ gol, 👟 assist, 🟨 giallo, ❌ gol subito...)
export default function EventIcons({
  events,
  className = '',
}: {
  events: VoteEvents | null | undefined
  className?: string
}) {
  const icons = eventIcons(events)
  if (icons.length === 0) return null
  return (
    <span
      className={`shrink-0 text-xs leading-none tracking-tighter whitespace-nowrap ${className}`}
    >
      {icons.map((i) => (
        <span key={i.key} title={i.label} aria-label={i.label} role="img">
          {i.text}
        </span>
      ))}
    </span>
  )
}
