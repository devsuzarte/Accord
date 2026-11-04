import type { Profile } from '@sharescreen/shared'
import { useEffect, useState } from 'react'

/** Seu perfil (nome e foto), salvo pelo main e igual em todas as janelas. */
export function useProfile(): Profile | null {
  const [profile, setProfile] = useState<Profile | null>(null)
  useEffect(() => {
    window.platform.profile.get().then(setProfile).catch(console.error)
    return window.platform.profile.onChange(setProfile)
  }, [])
  return profile
}
