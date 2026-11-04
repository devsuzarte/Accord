/// <reference types="vite/client" />
// Traz a declaração global `window.platform` (PlatformBridge).
import type {} from '@sharescreen/shared'

declare global {
  interface ImportMetaEnv {
    /** '1' liga os participantes de exemplo do pill (só em desenvolvimento). */
    readonly VITE_OVERLAY_DEMO?: string
  }
}
