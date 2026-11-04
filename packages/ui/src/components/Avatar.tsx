import './Avatar.css'

/**
 * Cores do avatar sem foto, escolhidas pelo NOME (a mesma pessoa tem sempre a mesma cor).
 * Sem verde nem vermelho: verde significa "falando" e vermelho, "mudo/ao vivo".
 */
const fallbackColors = ['#5865f2', '#eb459e', '#e67e22', '#00a8fc', '#9b59b6', '#607d8b']

function colorFor(seed: string): string {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return fallbackColors[Math.abs(hash) % fallbackColors.length]!
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export interface AvatarProps {
  id: string
  name: string
  src?: string | null
  size?: number
  speaking?: boolean
}

export function Avatar({ id, name, src, size = 32, speaking = false }: AvatarProps) {
  return (
    <span
      className="ss-avatar"
      data-speaking={speaking || undefined}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {src ? (
        <img src={src} alt="" draggable={false} />
      ) : (
        <span
          className="ss-avatar__fallback"
          style={{ background: colorFor(name || id) }}
          aria-hidden
        >
          {initials(name)}
        </span>
      )}
    </span>
  )
}
