import type { OverlayState } from '@sharescreen/shared'
import { useEffect, useState } from 'react'

const initial: OverlayState = {
  visible: true,
  ghost: false,
  panelOpen: false,
  edges: { horizontal: 'left', vertical: 'top' },
}

/** Estado do overlay vindo do main (fantasma, painel aberto, borda encaixada). */
export function useOverlayState(): OverlayState {
  const [state, setState] = useState<OverlayState>(initial)
  useEffect(() => {
    window.platform.overlay.getState().then(setState).catch(console.error)
    return window.platform.overlay.onStateChange(setState)
  }, [])
  return state
}
