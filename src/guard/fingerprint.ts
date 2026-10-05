// Fingerprints that identify a game file even after re-encoding or upscaling.
import { createHash } from "node:crypto"
import { decodePng } from "../core/png.ts"
import { crop, type Raster } from "../core/raster.ts"

const sha1 = (...parts: Array<string | Uint8Array>) => {
  const h = createHash("sha1")
  for (const p of parts) h.update(p)
  return h.digest("hex")
}

export const pixelHash = (image: Raster) => sha1(`${image.width}x${image.height}:`, image.data)

/** The image shrunk by `k` if it is a nearest-neighbour upscale by `k`, else undefined. */
export function downscale(image: Raster, k: number): Raster | undefined {
  const { width, height, data } = image
  if (width % k || height % k) return undefined
  const w = width / k
  const h = height / k
  const out = new Uint8Array(w * h * 4)
  const px = new Uint32Array(data.buffer, data.byteOffset, width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[y * width + x] !== px[(y - (y % k)) * width + (x - (x % k))]) return undefined
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.set(data.subarray(((y * k) * width + x * k) * 4, ((y * k) * width + x * k) * 4 + 4), (y * w + x) * 4)
  return { width: w, height: h, data: out }
}

/** Hashes of a PNG and of every integer nearest-neighbour downscale of it. */
export function imageCandidates(bytes: Uint8Array): string[] {
  let image: Raster
  try {
    image = decodePng(bytes)
  } catch {
    return []
  }
  const out = [pixelHash(image)]
  for (let k = 2; k <= 64 && image.width / k >= 4; k++) {
    const small = downscale(image, k)
    if (small) out.push(pixelHash(small))
  }
  return out
}

/** Hashes a game PNG is indexed under: the whole image and, if animated, its first frame. */
export function vanillaImageHashes(bytes: Uint8Array): string[] {
  const image = decodePng(bytes)
  const out = [pixelHash(image)]
  if (image.height > image.width && image.height % image.width === 0) out.push(pixelHash(crop(image, 0, 0, image.width, image.width)))
  return out
}

const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]))
      : v

/** Hash of a JSON document that ignores formatting and key order; undefined if not JSON. */
export function jsonHash(bytes: Uint8Array): string | undefined {
  try {
    return sha1("json:", JSON.stringify(stable(JSON.parse(new TextDecoder().decode(bytes)))))
  } catch {
    return undefined
  }
}
