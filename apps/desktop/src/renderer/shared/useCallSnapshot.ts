import type { CallSnapshot } from '@sharescreen/shared'
import { useEffect, useState } from 'react'

const initial: CallSnapshot = {
  status: 'idle',
  audio: {
    micMuted: false,
    deafened: false,
    inputDeviceId: '',
    outputDeviceId: '',
    noiseSuppression: 'rnnoise',
    sounds: true,
  },
  sharing: null,
  channelName: null,
  server: null,
  successor: null,
  pushToTalk: null,
  participants: [],
  error: null,
}

/** Acompanha o retrato da chamada publicado pelo pill (via main). */
export function useCallSnapshot(): CallSnapshot {
  const [snapshot, setSnapshot] = useState<CallSnapshot>(initial)
  useEffect(() => {
    window.platform.call.getState().then(setSnapshot).catch(console.error)
    return window.platform.call.onState(setSnapshot)
  }, [])
  return snapshot
}
