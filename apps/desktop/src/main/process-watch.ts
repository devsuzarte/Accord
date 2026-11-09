import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, Notification } from 'electron'
import { CrashGuard } from './crash-guard'
import { tm } from './i18n'

/**
 * Processos auxiliares do Chromium que param (GPU, rede, áudio...). Ver docs/16 §2.8 e P3.
 *
 * Todo travamento vai para o log com tipo, motivo e código. Se a GPU travar 2 vezes em 1 min,
 * o app avisa e oferece reiniciar sem aceleração de hardware (escolha salva em gpu.json,
 * desfeita pela bandeja › Ajuda › "Usar aceleração de hardware").
 *
 * Por que 2 e não 3: no 3º travamento seguido, se não houver mais para onde recuar (já está
 * no modo por software), o próprio Chromium encerra o app ("GPU process isn't usable").
 * Testado sob Xvfb; no Windows com placa de vídeo ele costuma recuar para o software antes.
 */

const GPU_FILE = 'gpu.json'

function gpuFile(): string {
  return join(app.getPath('userData'), GPU_FILE)
}

export function hardwareAccelerationDisabled(): boolean {
  try {
    return (JSON.parse(readFileSync(gpuFile(), 'utf8')) as { disabled?: unknown }).disabled === true
  } catch {
    return false
  }
}

export function setHardwareAcceleration(enabled: boolean): void {
  try {
    writeFileSync(gpuFile(), JSON.stringify({ disabled: !enabled }))
  } catch (error) {
    console.error('[gpu] não consegui salvar a escolha', error)
  }
}

/** Antes do `ready`: aplica a escolha salva. */
export function applyHardwareAccelerationChoice(): void {
  if (!hardwareAccelerationDisabled()) return
  app.disableHardwareAcceleration()
  console.info('[gpu] aceleração de hardware desligada (escolha salva)')
}

/** Reinicia o app com a nova escolha (vale só a partir do próximo início). */
export function restartWithHardwareAcceleration(enabled: boolean): void {
  setHardwareAcceleration(enabled)
  app.relaunch()
  app.quit()
}

export function watchChildProcesses(): void {
  const gpuCrashes = new CrashGuard([{ count: 2, withinMs: 60_000 }])
  let offered = false

  app.on('child-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || details.exitCode === 0) return
    const who = details.name ? `${details.type} (${details.name})` : details.type
    console.error(`[app] o processo ${who} parou: ${details.reason}, código ${details.exitCode}`)
    if (details.type !== 'GPU' || hardwareAccelerationDisabled()) return
    if (gpuCrashes.record() || offered) return
    // A GPU travou várias vezes seguidas: oferece desligar a aceleração (uma vez por execução).
    offered = true
    console.error('[gpu] a GPU travou 2 vezes em 1 min; oferecendo desligar a aceleração')
    if (!Notification.isSupported()) return
    const notice = new Notification({
      title: tm('gpu.crashTitle'),
      body: tm('gpu.crashBody'),
    })
    notice.on('click', () => restartWithHardwareAcceleration(false))
    notice.show()
  })
}
