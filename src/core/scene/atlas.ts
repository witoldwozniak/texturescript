// Packs textures into one square, power-of-two atlas for the viewer.
import * as R from "../raster.ts"
import type { Atlas } from "./payload.ts"

export function packAtlas(textures: ReadonlyMap<string, R.Raster>): { image: R.Raster; uv: Atlas["uv"] } {
  const ids = [...textures.keys()].sort()
  const cell = Math.max(16, ...ids.map((id) => textures.get(id)!.width))
  let cols = 1
  while (cols * cols < ids.length) cols *= 2
  const image = R.make(Math.max(16, cols * cell), Math.max(16, cols * cell))
  const uv: Record<string, readonly [number, number, number, number]> = {}
  ids.forEach((id, n) => {
    const tex = textures.get(id)!
    const [x, y] = [(n % cols) * cell, Math.floor(n / cols) * cell]
    R.paste(image, tex, x, y)
    uv[id] = [x, y, tex.width, tex.height]
  })
  return { image, uv }
}

export function toBase64(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
