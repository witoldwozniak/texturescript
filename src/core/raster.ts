// RGBA pixel buffers: the one image type TextureScript works with.

export interface Raster {
  readonly width: number
  readonly height: number
  /** width × height × 4 bytes (r, g, b, a), rows top to bottom. */
  readonly data: Uint8Array
}

export type Pixel = readonly [r: number, g: number, b: number, a: number]

export const TRANSPARENT: Pixel = [0, 0, 0, 0]

export function make(width: number, height: number, fill: Pixel = TRANSPARENT): Raster {
  const data = new Uint8Array(width * height * 4)
  if (fill[3] !== 0 || fill[0] || fill[1] || fill[2]) for (let i = 0; i < width * height; i++) data.set(fill, i * 4)
  return { width, height, data }
}

export function get(r: Raster, x: number, y: number): Pixel {
  const i = (y * r.width + x) * 4
  return [r.data[i]!, r.data[i + 1]!, r.data[i + 2]!, r.data[i + 3]!]
}

export function set(r: Raster, x: number, y: number, p: Pixel): void {
  r.data.set(p, (y * r.width + x) * 4)
}

export function crop(r: Raster, x0: number, y0: number, width: number, height: number): Raster {
  const out = make(width, height)
  for (let y = 0; y < height; y++) {
    const from = ((y0 + y) * r.width + x0) * 4
    out.data.set(r.data.subarray(from, from + width * 4), y * width * 4)
  }
  return out
}

/** Copies `src` onto `dst` at (x, y), replacing pixels. Parts outside `dst` are dropped. */
export function paste(dst: Raster, src: Raster, x: number, y: number): void {
  for (let sy = 0; sy < src.height; sy++) {
    const dy = y + sy
    if (dy < 0 || dy >= dst.height) continue
    for (let sx = 0; sx < src.width; sx++) {
      const dx = x + sx
      if (dx >= 0 && dx < dst.width) set(dst, dx, dy, get(src, sx, sy))
    }
  }
}

/** Draws `src` over `dst` at (x, y) with straight alpha ("source over"). */
export function composite(dst: Raster, src: Raster, x: number, y: number): void {
  for (let sy = 0; sy < src.height; sy++) {
    const dy = y + sy
    if (dy < 0 || dy >= dst.height) continue
    for (let sx = 0; sx < src.width; sx++) {
      const dx = x + sx
      if (dx < 0 || dx >= dst.width) continue
      const [r, g, b, a] = get(src, sx, sy)
      if (a === 255) set(dst, dx, dy, [r, g, b, a])
      else if (a > 0) set(dst, dx, dy, over([r, g, b, a], get(dst, dx, dy)))
    }
  }
}

/** One pixel of Pillow's integer alpha_composite, so composited output matches the prototype. */
function over(s: Pixel, d: Pixel): Pixel {
  const PRECISION = 7
  const div255 = (v: number) => ((v >>> 8) + v) >>> 8
  const outa255 = s[3] * 255 + d[3] * (255 - s[3])
  if (outa255 === 0) return TRANSPARENT
  const coef1 = Math.floor((s[3] * 255 * 255 * (1 << PRECISION)) / outa255)
  const coef2 = 255 * (1 << PRECISION) - coef1
  const mix = (sc: number, dc: number) => div255(sc * coef1 + dc * coef2 + (0x80 << PRECISION)) >>> PRECISION
  return [mix(s[0], d[0]), mix(s[1], d[1]), mix(s[2], d[2]), div255(outa255 + 0x80)]
}

/** Nearest-neighbour upscale by an integer factor. */
export function scale(r: Raster, k: number): Raster {
  const out = make(r.width * k, r.height * k)
  for (let y = 0; y < out.height; y++) {
    const from = Math.floor(y / k) * r.width
    for (let x = 0; x < out.width; x++) {
      const i = (from + Math.floor(x / k)) * 4
      out.data.set(r.data.subarray(i, i + 4), (y * out.width + x) * 4)
    }
  }
  return out
}

export function equals(a: Raster, b: Raster): boolean {
  if (a.width !== b.width || a.height !== b.height) return false
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false
  return true
}

/** A fast 64-bit FNV-1a hash of size and pixels, as hex. For comparisons, not security. */
export function hash(r: Raster): string {
  let h = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  const feed = (byte: number) => {
    h = ((h ^ BigInt(byte)) * prime) & mask
  }
  for (const n of [r.width, r.height]) for (let s = 0; s < 32; s += 8) feed((n >> s) & 255)
  for (const byte of r.data) feed(byte)
  return h.toString(16).padStart(16, "0")
}
