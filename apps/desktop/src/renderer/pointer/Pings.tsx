import type { PointerPing } from '@sharescreen/shared'
import { colorFor } from '@sharescreen/ui'
import { useEffect, useState } from 'react'
import './pings.css'

const LIFETIME_MS = 2600
const MAX_VISIBLE = 12

/**
 * Marcadores "olha ali": um anel que pulsa no ponto apontado, com o nome de quem apontou.
 * Usado em dois lugares: sobre a tela de quem transmite (janela transparente do overlay, que
 * não aparece na transmissão) e sobre o vídeo de quem assiste.
 */
export function Pings({
  source,
}: {
  source: (listener: (ping: PointerPing) => void) => () => void
}) {
  const [pings, setPings] = useState<PointerPing[]>([])

  useEffect(
    () =>
      source((ping) => {
        setPings((list) => [...list.filter((p) => p.id !== ping.id), ping].slice(-MAX_VISIBLE))
        setTimeout(() => setPings((list) => list.filter((p) => p.id !== ping.id)), LIFETIME_MS)
      }),
    [source],
  )

  return (
    <div className="pings" aria-live="polite">
      {pings.map((ping) => (
        <span
          key={ping.id}
          className="ping"
          style={
            {
              left: `${ping.x * 100}%`,
              top: `${ping.y * 100}%`,
              '--ping-color': colorFor(ping.from),
            } as React.CSSProperties
          }
        >
          <span className="ping__ring" aria-hidden />
          <span className="ping__ring ping__ring--late" aria-hidden />
          <span className="ping__dot" aria-hidden />
          <span className="ping__name">{ping.from}</span>
        </span>
      ))}
    </div>
  )
}
