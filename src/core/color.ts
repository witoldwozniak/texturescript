// Colour spaces for deriving material shades: sRGB, linear RGB, OKLab and OKLCH.
// Written to match the prototype bit for bit, including Python's rounding rules.
import { Result, Schema } from "effect"
import type { Pixel } from "./raster.ts"

/** sRGB channels in 0..1. */
export type Rgb = readonly [r: number, g: number, b: number]
export type Oklab = readonly [L: number, a: number, b: number]
/** Lightness 0..1, chroma, hue in degrees 0..360. */
export type Oklch = readonly [L: number, C: number, h: number]

export class BadColour extends Schema.TaggedError<BadColour>()("BadColour", { text: Schema.String }) {
  override get message() {
    return `colour ${JSON.stringify(this.text)} is not #rrggbb or 'transparent'`
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** `#rrggbb` → opaque pixel; `transparent`, `none` or `-` → fully transparent. */
export function parseHex(text: string): Result.Result<Pixel, BadColour> {
  if (["transparent", "none", "-"].includes(text.toLowerCase())) return Result.succeed([0, 0, 0, 0])
  if (!HEX.test(text)) return Result.fail(new BadColour({ text }))
  const n = (i: number) => parseInt(text.slice(i, i + 2), 16)
  return Result.succeed([n(1), n(3), n(5), 255])
}

/** Python's round(): halves go to the even neighbour. */
export function roundHalfEven(x: number): number {
  const r = Math.round(x)
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

/** Python's % for floats: the result takes the sign of the divisor. */
export const mod = (a: number, n: number) => ((a % n) + n) % n

const clamp01 = (c: number) => Math.min(1, Math.max(0, c))

export const hexToRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as Rgb

export const rgbToHex = (rgb: Rgb): string =>
  "#" + rgb.map((c) => roundHalfEven(clamp01(c) * 255).toString(16).padStart(2, "0")).join("")

export const pixelToRgb = (p: Pixel): Rgb => [p[0] / 255, p[1] / 255, p[2] / 255]

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function linearToSrgb(c: number) {
  c = clamp01(c)
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
}

const cbrt = (v: number) => Math.sign(v) * Math.abs(v) ** (1 / 3)

export function rgbToOklab(rgb: Rgb): Oklab {
  const [r, g, b] = rgb.map(srgbToLinear) as unknown as Rgb
  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function oklabToRgb([L, a, b]: Oklab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

const RAD_TO_DEG = 180 / Math.PI
const DEG_TO_RAD = Math.PI / 180

export const oklabToOklch = ([L, a, b]: Oklab): Oklch => [L, Math.hypot(a, b), mod(Math.atan2(b, a) * RAD_TO_DEG, 360)]

export const oklchToOklab = ([L, C, h]: Oklch): Oklab => [L, C * Math.cos(h * DEG_TO_RAD), C * Math.sin(h * DEG_TO_RAD)]

/** Signed shortest turn from hue `a` to hue `b`, in degrees. */
export const hueDelta = (a: number, b: number) => mod(b - a + 180, 360) - 180

/** `n` colours from `dark` to `light`, interpolating L, C and hue linearly in OKLCH. */
export function interpolateOklch(dark: Rgb, light: Rgb, n: number): Rgb[] {
  const [L0, C0, h0] = oklabToOklch(rgbToOklab(dark))
  const [L1, C1, h1] = oklabToOklch(rgbToOklab(light))
  const dh = hueDelta(h0, h1)
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    return oklabToRgb(oklchToOklab([L0 + (L1 - L0) * t, C0 + (C1 - C0) * t, h0 + dh * t]))
  })
}
