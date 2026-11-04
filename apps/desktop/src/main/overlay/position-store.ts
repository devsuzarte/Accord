import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { OverlayEdges } from '@sharescreen/shared'

/** Posição do pill relativa à área útil (workArea) do monitor onde ele está. */
export interface SavedPosition {
  displayId: number
  x: number
  y: number
  edges: OverlayEdges
}

const fileName = 'overlay-position.json'

function filePath(): string {
  return join(app.getPath('userData'), fileName)
}

export function loadPosition(): SavedPosition | null {
  try {
    const data = JSON.parse(readFileSync(filePath(), 'utf8')) as SavedPosition
    if (typeof data.displayId === 'number' && typeof data.x === 'number') return data
    return null
  } catch {
    return null
  }
}

export function savePosition(position: SavedPosition): void {
  try {
    writeFileSync(filePath(), JSON.stringify(position))
  } catch (error) {
    console.warn('[overlay] não foi possível salvar a posição', error)
  }
}
