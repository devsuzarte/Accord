import { useRef } from 'react'
import type { PointerEvent } from 'react'

/**
 * Arrasto do pill pela lombada. Não usa `-webkit-app-region: drag`: em janelas transparentes
 * no Windows a região de arrasto às vezes fica desatualizada e "engole" os cliques do pill.
 * O renderer só avisa início, passos e fim; o main move a janela seguindo o cursor.
 */
export function useSpineDrag() {
  const dragging = useRef(false)
  const frame = useRef(0)

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
      event.currentTarget.setPointerCapture(event.pointerId)
      dragging.current = true
      window.platform.overlay.drag('start')
    },
    onPointerMove() {
      if (!dragging.current || frame.current) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        if (dragging.current) window.platform.overlay.drag('move')
      })
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (!dragging.current) return
      dragging.current = false
      if (frame.current) cancelAnimationFrame(frame.current)
      frame.current = 0
      event.currentTarget.releasePointerCapture(event.pointerId)
      window.platform.overlay.drag('end')
    },
    onLostPointerCapture() {
      if (!dragging.current) return
      dragging.current = false
      window.platform.overlay.drag('end')
    },
  }
}
