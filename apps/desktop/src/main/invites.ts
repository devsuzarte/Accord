import { app } from 'electron'
import { INVITE_SCHEME, IpcChannel, parseInvite } from '@sharescreen/shared'
import type { Invite } from '@sharescreen/shared'
import type { OverlayManager } from './overlay/overlay-manager'

/**
 * Links `accord://join?...`: o instalador registra o protocolo no Windows (electron-builder
 * `protocols`) e o app também se registra ao abrir. O link chega pela linha de comando —
 * na primeira abertura ou, com o app já aberto, pelo evento `second-instance`.
 */
export class InviteService {
  private pending: Invite | null = null

  constructor(private readonly overlay: OverlayManager) {}

  /** Registra o app como dono do `accord://` (só no app instalado: no dev abriria o Electron puro). */
  register(): void {
    if (app.isPackaged && !app.isDefaultProtocolClient(INVITE_SCHEME)) {
      app.setAsDefaultProtocolClient(INVITE_SCHEME)
    }
  }

  /** Procura um convite nos argumentos e, se achar, abre o painel nele. */
  handleArgs(argv: string[]): boolean {
    const link = argv.find((arg) => arg.toLowerCase().startsWith(`${INVITE_SCHEME}://`))
    if (!link) return false
    const invite = parseInvite(link)
    if (!invite) {
      console.warn('[convite] link inválido')
      return false
    }
    console.info(`[convite] recebido para ${invite.serverUrl}`)
    this.pending = invite
    this.overlay.openPanel('channels')
    this.overlay.sendToPanel(IpcChannel.InviteReceived, invite)
    return true
  }

  take(): Invite | null {
    const invite = this.pending
    this.pending = null
    return invite
  }
}
