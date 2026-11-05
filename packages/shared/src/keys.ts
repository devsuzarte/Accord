import type { KeyBinding } from './ipc'

/**
 * Teclas e botões do mouse → códigos virtuais do Windows (VK_*), que é o que o main lê com
 * GetAsyncKeyState para os atalhos que funcionam com o jogo em foco.
 * https://learn.microsoft.com/windows/win32/inputdev/virtual-key-codes
 */
export const VK = {
  shift: 0x10,
  control: 0x11,
  alt: 0x12,
  mouseMiddle: 0x04,
  mouse4: 0x05,
  mouse5: 0x06,
} as const

const named: Record<string, [number, string, string]> = {
  // código do KeyboardEvent → [VK, rótulo, tecla no formato do Electron]
  Space: [0x20, 'Space', 'Space'],
  Tab: [0x09, 'Tab', 'Tab'],
  CapsLock: [0x14, 'Caps Lock', 'Capslock'],
  Backquote: [0xc0, '`', '`'],
  Minus: [0xbd, '-', '-'],
  Equal: [0xbb, '=', '='],
  BracketLeft: [0xdb, '[', '['],
  BracketRight: [0xdd, ']', ']'],
  Backslash: [0xdc, '\\', '\\'],
  Semicolon: [0xba, ';', ';'],
  Quote: [0xde, "'", "'"],
  Comma: [0xbc, ',', ','],
  Period: [0xbe, '.', '.'],
  Slash: [0xbf, '/', '/'],
  IntlBackslash: [0xe2, '\\', '\\'],
  IntlRo: [0xc1, '/', '/'],
  Insert: [0x2d, 'Insert', 'Insert'],
  Delete: [0x2e, 'Delete', 'Delete'],
  Home: [0x24, 'Home', 'Home'],
  End: [0x23, 'End', 'End'],
  PageUp: [0x21, 'Page Up', 'PageUp'],
  PageDown: [0x22, 'Page Down', 'PageDown'],
  ArrowUp: [0x26, '↑', 'Up'],
  ArrowDown: [0x28, '↓', 'Down'],
  ArrowLeft: [0x25, '←', 'Left'],
  ArrowRight: [0x27, '→', 'Right'],
  Pause: [0x13, 'Pause', 'Pause'],
  ScrollLock: [0x91, 'Scroll Lock', 'Scrolllock'],
  NumpadAdd: [0x6b, 'Num +', 'numadd'],
  NumpadSubtract: [0x6d, 'Num -', 'numsub'],
  NumpadMultiply: [0x6a, 'Num *', 'nummult'],
  NumpadDivide: [0x6f, 'Num /', 'numdiv'],
  NumpadDecimal: [0x6e, 'Num .', 'numdec'],
}

/** Tecla de um KeyboardEvent (sem os modificadores). `null` = tecla que não serve de atalho. */
export function keyFromCode(code: string): { vk: number; label: string; accel: string } | null {
  let m = /^Key([A-Z])$/.exec(code)
  if (m) return { vk: m[1]!.charCodeAt(0), label: m[1]!, accel: m[1]! }
  m = /^Digit(\d)$/.exec(code)
  if (m) return { vk: 0x30 + Number(m[1]), label: m[1]!, accel: m[1]! }
  m = /^Numpad(\d)$/.exec(code)
  if (m) return { vk: 0x60 + Number(m[1]), label: `Num ${m[1]}`, accel: `num${m[1]}` }
  m = /^F(\d{1,2})$/.exec(code)
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 24) {
    return { vk: 0x6f + Number(m[1]), label: `F${m[1]}`, accel: `F${m[1]}` }
  }
  const n = named[code]
  return n ? { vk: n[0], label: n[1], accel: n[2] } : null
}

/** Monta o atalho a partir das teclas apertadas (Ctrl/Shift/Alt + uma tecla). */
export function bindingFromKeyboard(event: {
  code: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}): KeyBinding | null {
  const key = keyFromCode(event.code)
  if (!key) return null
  const keys: number[] = []
  const labels: string[] = []
  const accel: string[] = []
  const mods: [boolean, number, string, string][] = [
    [event.ctrlKey, VK.control, 'Ctrl', 'CommandOrControl'],
    [event.shiftKey, VK.shift, 'Shift', 'Shift'],
    [event.altKey, VK.alt, 'Alt', 'Alt'],
  ]
  for (const [on, vk, label, name] of mods) {
    if (!on) continue
    keys.push(vk)
    labels.push(label)
    accel.push(name)
  }
  keys.push(key.vk)
  labels.push(key.label)
  accel.push(key.accel)
  return { keys, label: labels.join(' + '), accelerator: accel.join('+') }
}

/** Só uma tecla modificadora (Ctrl, Shift, Alt) — comum no push-to-talk. */
export function bindingFromModifier(code: string): KeyBinding | null {
  const map: Record<string, [number, string]> = {
    ControlLeft: [0xa2, 'LCtrl'],
    ControlRight: [0xa3, 'RCtrl'],
    ShiftLeft: [0xa0, 'LShift'],
    ShiftRight: [0xa1, 'RShift'],
    AltLeft: [0xa4, 'LAlt'],
    AltRight: [0xa5, 'RAlt'],
  }
  const hit = map[code]
  return hit ? { keys: [hit[0]], label: hit[1], accelerator: null } : null
}

/** Botão do mouse (só o do meio e os laterais: os principais ficariam inúteis). */
export function bindingFromMouse(button: number): KeyBinding | null {
  if (button === 1) return { keys: [VK.mouseMiddle], label: 'Mouse 3', accelerator: null }
  if (button === 3) return { keys: [VK.mouse4], label: 'Mouse 4', accelerator: null }
  if (button === 4) return { keys: [VK.mouse5], label: 'Mouse 5', accelerator: null }
  return null
}

const DEFAULT_KEYS = { m: 0x4d, d: 0x44, u: 0x55 }

export const DEFAULT_BINDINGS = {
  mute: {
    keys: [VK.control, VK.shift, DEFAULT_KEYS.m],
    label: 'Ctrl + Shift + M',
    accelerator: 'CommandOrControl+Shift+M',
  },
  deafen: {
    keys: [VK.control, VK.shift, DEFAULT_KEYS.d],
    label: 'Ctrl + Shift + D',
    accelerator: 'CommandOrControl+Shift+D',
  },
  ptt: null,
  unlockMini: {
    keys: [VK.control, VK.shift, DEFAULT_KEYS.u],
    label: 'Ctrl + Shift + U',
    accelerator: 'CommandOrControl+Shift+U',
  },
} satisfies Record<string, KeyBinding | null>

export function isKeyBinding(value: unknown): value is KeyBinding {
  const v = value as KeyBinding
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray(v.keys) &&
    v.keys.length >= 1 &&
    v.keys.length <= 4 &&
    v.keys.every((k) => Number.isInteger(k) && k > 0 && k < 256) &&
    typeof v.label === 'string' &&
    v.label.length <= 40 &&
    (v.accelerator === null || (typeof v.accelerator === 'string' && v.accelerator.length <= 60))
  )
}
