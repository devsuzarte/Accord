import type { ParticipantState } from '@sharescreen/shared'

/**
 * Participantes de EXEMPLO — para revisar o visual do pill sem precisar de uma chamada.
 * Só em desenvolvimento e só com VITE_OVERLAY_DEMO=1 (em apps/desktop/.env.development.local).
 */
export const demoEnabled = import.meta.env.DEV && import.meta.env.VITE_OVERLAY_DEMO === '1'

function person(
  patch: Partial<ParticipantState> & Pick<ParticipantState, 'userId' | 'displayName'>,
): ParticipantState {
  return {
    isLocal: false,
    role: 'member',
    serverMicBlocked: false,
    serverAudioBlocked: false,
    serverCameraBlocked: false,
    localMicMuted: false,
    localAudioMuted: false,
    volume: 1,
    avatarUrl: null,
    speaking: false,
    micMuted: false,
    deafened: false,
    streaming: false,
    camera: false,
    ...patch,
  }
}

export const demoParticipants: ParticipantState[] = [
  person({ userId: 'demo-ana', displayName: 'Ana Ribeiro', streaming: true, role: 'admin' }),
  person({ userId: 'demo-bruno', displayName: 'Bruno', micMuted: true, serverMicBlocked: true }),
  person({ userId: 'demo-caio', displayName: 'Caio Mendes', deafened: true, localMicMuted: true }),
  person({ userId: 'me', displayName: 'Você', isLocal: true, role: 'owner' }),
]
