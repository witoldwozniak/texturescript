// Contact sheets: textures upscaled side by side so a person or a model can actually see them.
import * as R from "./raster.ts"

export interface SheetOptions {
  readonly scale?: number
  readonly cols?: number
  readonly background?: R.Pixel
  /** Leave a 16 px row under each tile for its caption. */
  readonly labels?: boolean
  /** Captions are cut to this many characters. */
  readonly captionLength?: number
}

export interface Caption {
  readonly text: string
  /** Top left of the caption, in sheet pixels. */
  readonly x: number
  readonly y: number
}

/** Lays tiles out on a grid. Captions are returned for the caller to draw (there is no font here). */
export function contactSheet(tiles: ReadonlyArray<{ readonly name: string; readonly image: R.Raster }>, options: SheetOptions = {}) {
  const { scale = 12, cols = 8, background = [127, 127, 127, 255], labels = true, captionLength = 22 } = options
  const tw = Math.max(...tiles.map((t) => t.image.width)) * scale
  const th = Math.max(...tiles.map((t) => t.image.height)) * scale
  const pad = 6
  const [cellW, cellH] = [tw + pad * 2, th + (labels ? 16 : 0) + pad * 2]
  const image = R.make(cols * cellW, Math.ceil(tiles.length / cols) * cellH, [40, 40, 40, 255])
  const captions: Caption[] = []
  tiles.forEach((t, i) => {
    const [cx, cy] = [(i % cols) * cellW + pad, Math.floor(i / cols) * cellH + pad]
    const border = R.make(tw + 2, th + 2, [200, 200, 200, 255])
    R.paste(image, border, cx - 1, cy - 1)
    const tile = R.make(tw, th, background)
    R.composite(tile, R.scale(t.image, scale), 0, 0)
    R.paste(image, tile, cx, cy)
    if (labels) captions.push({ text: t.name.slice(0, captionLength), x: cx, y: cy + th + 2 })
  })
  return { image, captions }
}
