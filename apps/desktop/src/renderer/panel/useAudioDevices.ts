import { t } from '../shared/i18n'
import { useEffect, useState } from 'react'

export interface AudioDevice {
  deviceId: string
  label: string
}

export interface AudioDevices {
  inputs: AudioDevice[]
  outputs: AudioDevice[]
}

/**
 * Lista microfones e saídas de som. Os nomes só aparecem depois de uma permissão de
 * microfone, então pedimos uma vez (e soltamos na hora). Atualiza quando um fone é
 * conectado ou removido.
 *
 * As entradas "default" e "communications" do Windows ficam de fora: a opção
 * "Padrão do sistema" (deviceId vazio) já representa a padrão.
 */
export function useAudioDevices(): AudioDevices {
  const [devices, setDevices] = useState<AudioDevices>({ inputs: [], outputs: [] })

  useEffect(() => {
    let alive = true
    const list = async () => {
      const all = await navigator.mediaDevices.enumerateDevices()
      if (!alive) return
      const pick = (kind: MediaDeviceKind) =>
        all
          .filter(
            (d) => d.kind === kind && d.deviceId !== 'default' && d.deviceId !== 'communications',
          )
          .map((d, i) => ({
            deviceId: d.deviceId,
            label:
              d.label ||
              (kind === 'audioinput'
                ? t('audio.micN', { n: i + 1 })
                : t('audio.outputN', { n: i + 1 })),
          }))
      setDevices({ inputs: pick('audioinput'), outputs: pick('audiooutput') })
    }

    const unlockLabels = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((t) => t.stop())
      } catch {
        /* sem microfone ou sem permissão: lista sem nomes */
      }
      await list()
    }

    void unlockLabels()
    navigator.mediaDevices.addEventListener('devicechange', list)
    return () => {
      alive = false
      navigator.mediaDevices.removeEventListener('devicechange', list)
    }
  }, [])

  return devices
}

/**
 * Nível do microfone escolhido (0–1), para a pessoa ver que ele está captando.
 * Só mede com o painel visível; solta o microfone quando o painel some.
 */
export function useMicLevel(deviceId: string, enabled: boolean): number {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    let frame = 0
    let stopped = false

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        })
      } catch {
        return
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      context.createMediaStreamSource(stream).connect(analyser)
      const data = new Float32Array(analyser.fftSize)
      const tick = () => {
        analyser.getFloatTimeDomainData(data)
        let sum = 0
        for (const x of data) sum += x * x
        // RMS em escala aproximada de "barra de volume".
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4))
        frame = requestAnimationFrame(tick)
      }
      tick()
    }

    void start()
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
      void context?.close()
    }
  }, [deviceId, enabled])

  return enabled ? level : 0
}

/** Toca um "plim" curto na saída escolhida, para testar o fone/caixa de som. */
export async function playTestSound(deviceId: string): Promise<void> {
  const context = new AudioContext() as AudioContext & { setSinkId?: (id: string) => Promise<void> }
  if (deviceId && context.setSinkId) await context.setSinkId(deviceId).catch(() => undefined)
  const now = context.currentTime
  for (const [i, freq] of [660, 880].entries()) {
    const osc = context.createOscillator()
    const gain = context.createGain()
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, now + i * 0.16)
    gain.gain.linearRampToValueAtTime(0.25, now + i * 0.16 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.16 + 0.3)
    osc.connect(gain).connect(context.destination)
    osc.start(now + i * 0.16)
    osc.stop(now + i * 0.16 + 0.32)
  }
  setTimeout(() => void context.close(), 800)
}
