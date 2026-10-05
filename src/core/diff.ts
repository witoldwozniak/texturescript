// Blind pixel comparison: says where a texture differs from a target, never what it should be.
import * as R from "./raster.ts"

/** Alpha 128 and above becomes opaque, below becomes fully transparent, as the game's cutout does. */
export function binarize(image: R.Raster): R.Raster {
  const out = R.make(image.width, image.height)
  for (let i = 0; i < image.data.length; i += 4)
    if (image.data[i + 3]! >= 128) out.data.set([image.data[i]!, image.data[i + 1]!, image.data[i + 2]!, 255], i)
  return out
}

export interface Comparison {
  readonly mismatch: number
  readonly of: number
  /** Target opaque, rendered transparent. */
  readonly missing: number
  /** Target transparent, rendered opaque. */
  readonly extra: number
  /** Both opaque, different colour. */
  readonly wrongColour: number
  /** One row per image row: '.' right, 'X' wrong. */
  readonly mask: string
}

export function compare(rendered: R.Raster, target: R.Raster): Comparison | { readonly error: string } {
  if (rendered.width !== target.width || rendered.height !== target.height)
    return { error: `size (${rendered.width}, ${rendered.height}) != target (${target.width}, ${target.height})` }
  let missing = 0
  let extra = 0
  let wrongColour = 0
  const rows: string[] = []
  for (let y = 0; y < target.height; y++) {
    let row = ""
    for (let x = 0; x < target.width; x++) {
      const r = R.get(rendered, x, y)
      const t = R.get(target, x, y)
      if (r.join() === t.join()) {
        row += "."
        continue
      }
      row += "X"
      if (t[3] === 0) extra++
      else if (r[3] === 0) missing++
      else wrongColour++
    }
    rows.push(row)
  }
  return { mismatch: missing + extra + wrongColour, of: target.width * target.height, missing, extra, wrongColour, mask: rows.join("\n") }
}

/** rendered | target | wrong pixels in red, each upscaled on grey. */
export function diffSheet(rendered: R.Raster, target: R.Raster, mask: string, scale = 16): R.Raster {
  const { width: w, height: h } = target
  const out = R.make(w * scale * 3 + 2 * 4, h * scale, [40, 40, 40, 255])
  const tile = (image: R.Raster) => {
    const t = R.make(w, h, [127, 127, 127, 255])
    R.composite(t, image, 0, 0)
    return R.scale(t, scale)
  }
  R.paste(out, tile(rendered), 0, 0)
  R.paste(out, tile(target), w * scale + 4, 0)
  const m = R.make(w, h, [30, 30, 30, 255])
  mask.split("\n").forEach((row, y) => [...row].forEach((ch, x) => ch === "X" && R.set(m, x, y, [230, 60, 60, 255])))
  R.paste(out, R.scale(m, scale), 2 * (w * scale + 4), 0)
  return out
}
