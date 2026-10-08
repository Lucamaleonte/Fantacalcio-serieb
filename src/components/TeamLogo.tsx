import { useState } from 'react'
import { LOGO_BUCKET, placeholderColor, teamInitials } from '../lib/logo'
import { supabase } from '../lib/supabase'

const sizes = {
  xs: 'size-6 text-[0.6rem]',
  sm: 'size-8 text-xs',
  md: 'size-12 text-base',
  lg: 'size-20 text-2xl',
} as const

function logoUrl(path: string): string {
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl
}

// Logo della squadra; senza logo (o se non si carica) un cerchio con le iniziali
export default function TeamLogo({
  path,
  name,
  size = 'sm',
}: {
  path: string | null | undefined
  name: string
  size?: keyof typeof sizes
}) {
  const [failed, setFailed] = useState<string | null>(null)

  if (path && failed !== path) {
    return (
      <img
        src={logoUrl(path)}
        alt=""
        loading="lazy"
        onError={() => setFailed(path)}
        className={`${sizes[size]} shrink-0 rounded-full bg-white object-cover ring-1 ring-slate-200 dark:ring-slate-700`}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`${sizes[size]} ${placeholderColor(name)} inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white`}
    >
      {teamInitials(name)}
    </span>
  )
}
