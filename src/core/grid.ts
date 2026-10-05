// Character-grid textures: a palette section, then rows of palette keys.
//
//   palette
//   . transparent
//   a #266325
//   grid
//   ......a.........
import { Result } from "effect"
import { parseHex } from "./color.ts"
import * as R from "./raster.ts"
import { specError, type SpecError } from "./spec-error.ts"

/** Palette key → colour, in declaration order. */
export type GridPalette = ReadonlyMap<string, R.Pixel>

export interface Grid {
  readonly palette: GridPalette
  readonly rows: ReadonlyArray<string>
}

export function parseGrid(text: string): Result.Result<Grid, SpecError> {
  const palette = new Map<string, R.Pixel>()
  const rows: string[] = []
  const rowLines: number[] = []
  let section: "palette" | "grid" | undefined
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1
    const s = lines[i]!.trim()
    if (!s || s.startsWith("#")) continue
    if (s === "palette") {
      if (section !== undefined) return Result.fail(specError("palette must occur once, before grid", n))
      section = "palette"
      continue
    }
    if (s === "grid") {
      if (section !== "palette" || palette.size === 0) return Result.fail(specError("grid must follow a non-empty palette", n))
      section = "grid"
      continue
    }
    if (section === "palette") {
      // A trailing comment is allowed: "a #266325  # leaf".
      let parts = splitMax(s, 2)
      if (parts.length === 3 && parts[2]!.startsWith("#")) parts = parts.slice(0, 2)
      const [key, colour] = parts
      if (parts.length !== 2 || [...key!].length !== 1)
        return Result.fail(specError(`palette entries are '<char> <#rrggbb|transparent>', got ${JSON.stringify(s)}`, n))
      if (palette.has(key!)) return Result.fail(specError(`duplicate palette key ${JSON.stringify(key)}`, n))
      if (key === "#") return Result.fail(specError("'#' is reserved for comments", n))
      const pixel = parseHex(colour!)
      if (Result.isFailure(pixel)) return Result.fail(specError(pixel.failure.message, n))
      palette.set(key!, pixel.success)
    } else if (section === "grid") {
      rows.push(s)
      rowLines.push(n)
    } else {
      return Result.fail(specError("content before a 'palette' or 'grid' header", n))
    }
  }
  if (rows.length === 0) return Result.fail(specError("no grid rows"))
  const width = [...rows[0]!].length
  for (let y = 0; y < rows.length; y++) {
    const chars = [...rows[y]!]
    if (chars.length !== width) return Result.fail(specError(`row is ${chars.length} wide, expected ${width} like the first row`, rowLines[y]))
    const x = chars.findIndex((ch) => !palette.has(ch))
    if (x >= 0) {
      const col = lines[rowLines[y]! - 1]!.indexOf(rows[y]!) + x + 1
      return Result.fail(specError(`character ${JSON.stringify(chars[x])} is not in the palette`, rowLines[y], col))
    }
  }
  return Result.succeed({ palette, rows })
}

/** Python's str.split(maxsplit=k) on whitespace. */
export function splitMax(s: string, max: number): string[] {
  const out: string[] = []
  let rest = s.trim()
  while (rest && out.length < max) {
    const m = /\s+/.exec(rest)
    if (!m) break
    out.push(rest.slice(0, m.index))
    rest = rest.slice(m.index + m[0].length)
  }
  if (rest) out.push(rest)
  return out
}

const hex2 = (v: number) => v.toString(16).padStart(2, "0")

/** A complete, parseable grid file, without the source's comments. */
export function serializeGrid(grid: Grid): string {
  const lines = ["palette"]
  for (const [key, [r, g, b, a]] of grid.palette) lines.push(`${key} ${a ? `#${hex2(r)}${hex2(g)}${hex2(b)}` : "transparent"}`)
  return [...lines, "grid", ...grid.rows].join("\n") + "\n"
}

export function renderGrid(grid: Grid): R.Raster {
  const rows = grid.rows.map((row) => [...row])
  const out = R.make(rows[0]!.length, rows.length)
  rows.forEach((row, y) => row.forEach((ch, x) => R.set(out, x, y, grid.palette.get(ch)!)))
  return out
}

/** The image as palette keys; '?' marks a colour the palette lacks. */
export function toAscii(image: R.Raster, palette: GridPalette): string {
  const inverse = new Map<string, string>()
  for (const [key, p] of palette) if (!inverse.has(p.join())) inverse.set(p.join(), key)
  const clear = inverse.get("0,0,0,0") ?? "."
  const rows: string[] = []
  for (let y = 0; y < image.height; y++) {
    let row = ""
    for (let x = 0; x < image.width; x++) {
      const p = R.get(image, x, y)
      row += p[3] === 0 ? clear : (inverse.get(p.join()) ?? "?")
    }
    rows.push(row)
  }
  return rows.join("\n")
}
