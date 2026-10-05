// PNG decoding to 8-bit RGBA, whatever the file's colour type and bit depth.
import { convertIndexedToRgb, decode, encode, type DecodedPng } from "fast-png"

export interface Rgba {
  readonly width: number
  readonly height: number
  /** width × height × 4 bytes, rows top to bottom. */
  readonly data: Uint8Array
}

/** Samples of one row, unpacked from 1, 2 or 4 bits per sample when needed. */
function samples(png: DecodedPng): Uint8Array | Uint16Array {
  const { width, height, channels, depth, data } = png
  if (depth >= 8) return data as Uint8Array | Uint16Array
  const perRow = Math.ceil((width * channels * depth) / 8)
  const out = new Uint8Array(width * height * channels)
  const mask = (1 << depth) - 1
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < width * channels; i++) {
      const bit = i * depth
      const byte = data[y * perRow + (bit >> 3)]!
      out[y * width * channels + i] = (byte >> (8 - depth - (bit & 7))) & mask
    }
  }
  return out
}

export function decodePng(bytes: Uint8Array): Rgba {
  const png = decode(bytes)
  const { width, height, channels, depth } = png
  const out = new Uint8Array(width * height * 4)
  if (png.palette) {
    const rgb = convertIndexedToRgb(png)
    const n = png.palette[0]?.length ?? 3
    for (let p = 0; p < width * height; p++) {
      out[p * 4] = rgb[p * n]!
      out[p * 4 + 1] = rgb[p * n + 1]!
      out[p * 4 + 2] = rgb[p * n + 2]!
      out[p * 4 + 3] = n === 4 ? rgb[p * n + 3]! : 255
    }
    return { width, height, data: out }
  }
  const s = samples(png)
  const max = (1 << depth) - 1
  const to8 = (v: number) => (depth === 8 ? v : depth === 16 ? v >> 8 : Math.round((v * 255) / max))
  const key = png.transparency && png.transparency.length > 0 ? png.transparency : undefined
  for (let p = 0; p < width * height; p++) {
    const px = s.subarray(p * channels, p * channels + channels)
    const grey = channels <= 2
    const [r, g, b] = grey ? [px[0]!, px[0]!, px[0]!] : [px[0]!, px[1]!, px[2]!]
    let a = channels === 2 ? px[1]! : channels === 4 ? px[3]! : max
    if (key && (grey ? r === key[0] : r === key[0] && g === key[1] && b === key[2])) a = 0
    out.set([to8(r), to8(g), to8(b), to8(a)], p * 4)
  }
  return { width, height, data: out }
}

export function encodePng(image: Rgba): Uint8Array {
  return encode({ width: image.width, height: image.height, data: image.data, depth: 8, channels: 4 })
}
