// The reverse of rendering: a PNG as an editable grid, letters ordered darkest first.
import { Result } from "effect"
import { hexToRgb, rgbToOklab } from "./color.ts"
import * as R from "./raster.ts"
import { specError, type SpecError } from "./spec-error.ts"

const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
const hex = (v: number) => v.toString(16).padStart(2, "0")

/** Alpha 128 and above counts as opaque; colours get letters by OKLab lightness, so the grid reads like a shading map. */
export function toGrid(image: R.Raster, name: string): Result.Result<string, SpecError> {
  const seen: string[] = []
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3]! < 128) continue
    const c = `#${hex(image.data[i]!)}${hex(image.data[i + 1]!)}${hex(image.data[i + 2]!)}`
    if (!seen.includes(c)) seen.push(c)
  }
  const ordered = seen.map((c, i) => [c, rgbToOklab(hexToRgb(c))[0], i] as const).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([c]) => c)
  if (ordered.length > LETTERS.length) return Result.fail(specError(`${ordered.length} colours, too many for one letter each`))
  const key = new Map(ordered.map((c, i) => [c, LETTERS[i]!]))
  const lines = [`# ${name}: letters are shades darkest->lightest`, "palette", ". transparent", ...ordered.map((c) => `${key.get(c)} ${c}`), "grid"]
  for (let y = 0; y < image.height; y++) {
    let row = ""
    for (let x = 0; x < image.width; x++) {
      const [r, g, b, a] = R.get(image, x, y)
      row += a >= 128 ? key.get(`#${hex(r)}${hex(g)}${hex(b)}`)! : "."
    }
    lines.push(row)
  }
  return Result.succeed(lines.join("\n") + "\n")
}

export type ExampleKind = "crop" | "item"

/** examples/manifest.txt: one `crop NAME` or `item NAME` per line, naming a game texture. */
export function parseManifest(text: string): Result.Result<Array<readonly [ExampleKind, string]>, SpecError> {
  const out: Array<readonly [ExampleKind, string]> = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i]!.split("#", 1)[0]!.trim()
    if (!s) continue
    const parts = s.split(/\s+/)
    if (parts.length !== 2 || (parts[0] !== "crop" && parts[0] !== "item"))
      return Result.fail(specError(`expected 'crop NAME' or 'item NAME', got ${JSON.stringify(lines[i])}`, i + 1))
    if (!/^[a-z0-9_]+$/.test(parts[1]!)) return Result.fail(specError("texture names must use lowercase letters, digits and underscores", i + 1))
    if (out.some(([k, n]) => k === parts[0] && n === parts[1])) return Result.fail(specError("duplicate manifest entry", i + 1))
    out.push([parts[0], parts[1]!])
  }
  if (out.length === 0) return Result.fail(specError("manifest is empty"))
  return Result.succeed(out)
}

/** A ×16 preview on grey, as the examples ship it. */
export function previewOnGrey(image: R.Raster): R.Raster {
  const bg = R.make(image.width, image.height, [127, 127, 127, 255])
  R.composite(bg, image, 0, 0)
  return R.scale(bg, 16)
}
