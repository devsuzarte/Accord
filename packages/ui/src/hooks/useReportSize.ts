import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

export interface ReportedSize {
  width: number
  height: number
}

/**
 * Mede o elemento com ResizeObserver e informa o tamanho a cada mudança.
 * É o que faz a janela do overlay ter o tamanho exato do conteúdo (estudo §1.1),
 * sem os setTimeout que o OpenCluely usa.
 */
export function useReportSize<T extends HTMLElement>(
  report: (size: ReportedSize) => void,
): RefObject<T | null> {
  const ref = useRef<T | null>(null)
  const reportRef = useRef(report)

  // Mantém o callback mais recente sem recriar o observer.
  useLayoutEffect(() => {
    reportRef.current = report
  })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let last = ''
    const send = () => {
      const rect = el.getBoundingClientRect()
      const size = { width: Math.ceil(rect.width), height: Math.ceil(rect.height) }
      const key = `${size.width}x${size.height}`
      if (key !== last) {
        last = key
        reportRef.current(size)
      }
    }
    send()
    const observer = new ResizeObserver(send)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return ref
}
