// gifenc 1.0.3 (MIT) não traz tipos; só o que usamos.
declare module 'gifenc' {
  export type Palette = number[][]
  export interface GifEncoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: { palette?: Palette; delay?: number; repeat?: number },
    ): void
    finish(): void
    bytes(): Uint8Array
  }
  export function GIFEncoder(): GifEncoder
  export function quantize(rgba: Uint8ClampedArray, maxColors: number): Palette
  export function applyPalette(rgba: Uint8ClampedArray, palette: Palette): Uint8Array
}
