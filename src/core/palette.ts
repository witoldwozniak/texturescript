// Family palettes: each material is two anchor colours expanded into 3 to 6 shades.
//
//   material leaf  dark #266325  light #55ab2d  shades 4  keys abcd
//   transparent .
import { Result } from "effect"
import { hexToRgb, interpolateOklch, oklabToOklch, parseHex, rgbToHex, rgbToOklab, roundHalfEven } from "./color.ts"
import type { GridPalette } from "./grid.ts"
import * as R from "./raster.ts"
import { specError, type SpecError } from "./spec-error.ts"

export interface Material {
  readonly name: string
  readonly dark: string
  readonly light: string
  readonly shades: number
  /** One single-character key per shade, darkest first. */
  readonly keys: ReadonlyArray<string>
  /** The derived shades as #rrggbb, darkest first. */
  readonly hexes: ReadonlyArray<string>
  readonly line: number
}

export interface FamilyPalette {
  readonly materials: ReadonlyArray<Material>
  readonly transparent: string
}

const HEX = /^#[0-9a-fA-F]{6}$/
const lightness = (hex: string) => 100 * rgbToOklab(hexToRgb(hex))[0]

export function parsePalette(text: string): Result.Result<FamilyPalette, SpecError> {
  const materials: Material[] = []
  let transparent = "."
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1
    const s = lines[i]!.trim()
    if (!s || s.startsWith("#")) continue
    // Hex colours are tokens; a standalone '#' starts an inline comment.
    let parts = s.split(/\s+/)
    if (parts.includes("#")) parts = parts.slice(0, parts.indexOf("#"))
    if (parts[0] === "transparent") {
      if (parts.length !== 2 || [...parts[1]!].length !== 1) return Result.fail(specError("'transparent <char>'", n))
      transparent = parts[1]!
      continue
    }
    if (parts[0] !== "material" || parts.length !== 10)
      return Result.fail(specError("expected 'material NAME dark #hex light #hex shades N keys CHARS'", n))
    const name = parts[1]!
    const kv = new Map<string, string>()
    for (let j = 2; j + 1 < parts.length; j += 2) kv.set(parts[j]!, parts[j + 1]!)
    for (const k of ["dark", "light", "shades", "keys"])
      if (!kv.has(k)) return Result.fail(specError(`material ${name} missing '${k}'`, n))
    for (const k of ["dark", "light"])
      if (!HEX.test(kv.get(k)!)) return Result.fail(specError(`material ${name} ${k} ${JSON.stringify(kv.get(k))} is not #rrggbb`, n))
    if (!/^[+-]?\d+$/.test(kv.get("shades")!.trim())) return Result.fail(specError(`material ${name} shades must be an integer`, n))
    const shades = parseInt(kv.get("shades")!, 10)
    if (shades < 3 || shades > 6) return Result.fail(specError(`material ${name} has ${shades} shades; vanilla uses 3 to 6`, n))
    const keys = [...kv.get("keys")!]
    if (keys.length !== shades || new Set(keys).size !== shades)
      return Result.fail(specError(`material ${name} needs ${shades} distinct single-character keys, got ${JSON.stringify(kv.get("keys"))}`, n))
    const [dark, light] = [kv.get("dark")!, kv.get("light")!]
    const [Ld, Ll] = [lightness(dark), lightness(light)]
    if (Ll <= Ld)
      return Result.fail(specError(`material ${name}: light anchor (L ${fmt0(Ll)}) is not lighter than dark (L ${fmt0(Ld)})`, n))
    if (Ll - Ld < 15)
      return Result.fail(specError(`material ${name}: anchors only ${fmt0(Ll - Ld)} L apart; vanilla ramps span 14 to 40, steps of about 7`, n))
    const hexes = interpolateOklch(hexToRgb(dark), hexToRgb(light), shades).map(rgbToHex)
    materials.push({ name, dark, light, shades, keys, hexes, line: n })
  }
  if (materials.length === 0) return Result.fail(specError("no materials"))
  if (transparent === "#") return Result.fail(specError("'#' is reserved for comments"))
  const seen = new Map<string, string>([[transparent, "transparent"]])
  const names = new Set<string>()
  for (const m of materials) {
    if (names.has(m.name)) return Result.fail(specError(`duplicate material ${JSON.stringify(m.name)}`, m.line))
    names.add(m.name)
    for (const k of m.keys) {
      if (k === "#") return Result.fail(specError("'#' is reserved for comments", m.line))
      if (seen.has(k)) return Result.fail(specError(`key ${JSON.stringify(k)} in material ${m.name} already used by ${seen.get(k)}`, m.line))
      seen.set(k, m.name)
    }
  }
  return Result.succeed({ materials, transparent })
}

/** Python's f"{x:.0f}". */
const fmt0 = (x: number) => {
  const r = roundHalfEven(x)
  return r === 0 && (x < 0 || Object.is(x, -0)) ? "-0" : String(r)
}

// Anchor envelopes measured on 78 vanilla ramps (OKLCH × 100): dark L, light L, max chroma.
// Classed on the dark anchor's hue: foliage 115 to 175, cool 175 to 330, else warm produce.
const ENVELOPE = {
  foliage: [[31, 57], [45, 79], 24],
  cool: [[40, 47], [59, 76], 14],
  produce: [[21, 77], [41, 93], 19],
} as const

/** Comment lines placing a material's anchors against the vanilla envelope, with warnings. */
export function anchorNotes(m: Material): string[] {
  const lch = (hex: string) => {
    const [L, C, h] = oklabToOklch(rgbToOklab(hexToRgb(hex)))
    return [L * 100, C * 100, h] as const
  }
  const [Ld, Cd, hd] = lch(m.dark)
  const [Ll, Cl, hl] = lch(m.light)
  const cls = hd >= 115 && hd <= 175 ? "foliage" : hd > 175 && hd < 330 ? "cool" : "produce"
  const [[dlo, dhi], [llo, lhi], cmax] = ENVELOPE[cls]
  const out = [
    `# ${m.name}: dark L${fmt0(Ld)} C${fmt0(Cd)} h${fmt0(hd)}, light L${fmt0(Ll)} C${fmt0(Cl)} h${fmt0(hl)}; vanilla ${cls}: dark L${dlo}-${dhi}, light L${llo}-${lhi}, chroma <= ${cmax}`,
  ]
  if (Math.max(Cd, Cl) > cmax)
    out.push(`# WARN ${m.name}: chroma ${fmt0(Math.max(Cd, Cl))} exceeds every vanilla ${cls} ramp (${cmax}); it will pop against vanilla. Pull the anchor toward grey.`)
  if (!(dlo - 5 <= Ld && Ld <= dhi + 5) || !(llo - 5 <= Ll && Ll <= lhi + 5))
    out.push(`# WARN ${m.name}: anchor lightness outside the vanilla ${cls} range`)
  return out
}

/** The `palette` section to paste into a grid file. */
export function paletteSection(p: FamilyPalette): string {
  const lines = ["palette", `${p.transparent} transparent`]
  for (const m of p.materials) {
    lines.push(`# ${m.name}: ${m.shades} shades ${m.dark} -> ${m.light}`, ...anchorNotes(m))
    m.keys.forEach((k, i) => lines.push(`${k} ${m.hexes[i]}`))
  }
  return lines.join("\n") + "\n"
}

/**
 * A family key must denote its exact derived shade. A grid may omit unused keys or use
 * another transparency marker, but may not turn a material key transparent or add an
 * opaque colour the family lacks.
 */
export function validateKeys(grid: GridPalette, family: FamilyPalette): Result.Result<void, SpecError> {
  const expected = new Map<string, R.Pixel>()
  for (const m of family.materials) m.keys.forEach((k, i) => expected.set(k, Result.getOrThrow(parseHex(m.hexes[i]!))))
  for (const [key, p] of grid) {
    const want = expected.get(key)
    if (want) {
      if (p.join() !== want.join()) {
        const got = p[3] === 0 ? "transparent" : rgbToHex([p[0] / 255, p[1] / 255, p[2] / 255])
        return Result.fail(specError(`palette key ${JSON.stringify(key)} is ${got}, expected family shade ${rgbToHex([want[0] / 255, want[1] / 255, want[2] / 255])}; regenerate the grid palette header`))
      }
    } else if (p[3] !== 0) {
      return Result.fail(specError(`opaque palette key ${JSON.stringify(key)} is not declared in the family palette`))
    }
  }
  return Result.void
}

/** One row of shade squares per material, on dark grey. Names are in the text output. */
export function swatch(p: FamilyPalette, size = 32): R.Raster {
  const cols = Math.max(...p.materials.map((m) => m.shades))
  const out = R.make(cols * size, p.materials.length * (size + 6), [40, 40, 40, 255])
  p.materials.forEach((m, row) =>
    m.hexes.forEach((hex, col) => R.paste(out, R.make(size, size, Result.getOrThrow(parseHex(hex))), col * size, row * (size + 6))),
  )
  return out
}
