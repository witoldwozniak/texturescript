// Checks a 16×16 sprite against conventions measured on vanilla textures.
// Findings are data: a sprite can break several rules at once.
import { analyze } from "./analyze.ts"
import type { FamilyPalette } from "./palette.ts"
import { pyFloat, pyPercent } from "./py.ts"
import * as R from "./raster.ts"

export type Level = "FAIL" | "WARN" | "OK"

export interface Finding {
  readonly level: Level
  readonly rule: string
  readonly message: string
}

export type Kind = "block" | "item"

export interface LintOptions {
  readonly kind?: Kind
  /** Set when the sprite is the upper half of a two-block plant. */
  readonly lower?: R.Raster
  /** The family palette every colour must come from, or why it could not be read. */
  readonly palette?: { readonly name: string } & ({ readonly family: FamilyPalette } | { readonly error: string })
}

export function lint(image: R.Raster, options: LintOptions = {}): Finding[] {
  const kind = options.kind ?? "block"
  const r = analyze(image)
  const out: Finding[] = []
  const add = (level: Level, rule: string, message: string) => out.push({ level, rule, message })

  if (r.width !== 16 || r.height !== 16) add("FAIL", "size", `${r.width}x${r.height}, expected 16x16`)
  if (r.semiTransparent) add("FAIL", "alpha", `${r.semiTransparent} semi-transparent pixels; vanilla alpha is 0 or 255`)
  else add("OK", "alpha", "binary")

  if (r.colors > 13) add("FAIL", "budget", `${r.colors} colours; vanilla max is 13`)
  else if (r.colors > 10) add("WARN", "budget", `${r.colors} colours; vanilla median 6, above 10 is rare`)
  else add("OK", "budget", `${r.colors} colours`)

  const { palette } = options
  if (palette) {
    const materials = "family" in palette ? palette.family.materials : []
    if ("error" in palette) add("FAIL", "palette", `cannot read ${palette.name}: ${palette.error}`)
    const shadeOf = new Map(materials.flatMap((m) => m.hexes.map((h) => [h.toLowerCase(), m.name] as const)))
    const used = new Set(r.ramps.flatMap((rp) => rp.colors.map((c) => c.toLowerCase())))
    const foreign = [...used].filter((c) => !shadeOf.has(c)).sort()
    if (foreign.length) add("FAIL", "palette", `${foreign.length} colours not in ${palette.name}: ${foreign.join(" ")}`)
    else {
      const per = materials.map((m) => [m.name, [...used].filter((c) => shadeOf.get(c) === m.name).length] as const)
      add("OK", "palette", "all colours are palette shades; " + per.filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", "))
    }
  } else {
    for (const rp of r.ramps) {
      const n = rp.colors.length
      if (!rp.neutral && n > 6)
        add("WARN", "ramp", `a ${n}-shade ramp ${rp.colors[0]}..${rp.colors[n - 1]}; vanilla materials use 3 to 6 (pass --palette to check per material)`)
    }
  }

  const where = r.isolatedAt.length
    ? " at " + r.isolatedAt.slice(0, 12).map(([x, y]) => `(${x},${y})`).join(" ") + (r.isolatedAt.length > 12 ? " ..." : "")
    : ""
  if (r.isolated > 0.5)
    add("FAIL", "noise", `isolated-pixel fraction ${pyFloat(r.isolated)} (fail above 0.5; programmer art 0.45 to 0.77, vanilla up to 0.48)${where}`)
  else add("OK", "noise", `isolated-pixel fraction ${pyFloat(r.isolated)} (fail above 0.5)${where}`)
  if (r.coverage >= 0.1 && r.islands > 12)
    add("WARN", "islands", `${r.islands} disconnected pieces (thin fraction ${pyFloat(r.thin)}); no vanilla crop has more than 12. Let blades touch and overlap into a body`)
  if (r.solidBlock) {
    const [w, h, x, y] = r.solidBlock
    add("WARN", "solid", `one shade fills a ${w}x${h} rectangle at (${x},${y}); vanilla crops never fill more than a 4-wide band with one shade (pitcher plant body excepted). Break it with a second shade or a gap`)
  }
  if (r.checker > 0.15) add("WARN", "dither", `checkerboard fraction ${pyFloat(r.checker)}; vanilla never exceeds 0.15 at 16px`)

  if (kind === "block") {
    if (r.coverage > 0.6) add("WARN", "coverage", `${pyPercent(r.coverage)} opaque; mature vanilla crops are 26% to 54%`)
    else if (r.coverage < 0.02) add("WARN", "coverage", `${pyPercent(r.coverage)} opaque; even stage 0 has a few pixels`)
    else add("OK", "coverage", `${pyPercent(r.coverage)} opaque`)
    if (r.edgeDarker !== undefined && r.edgeDarker > 0.75)
      add("WARN", "outline", `edge pixels darker than interior in ${pyPercent(r.edgeDarker)} of cases; that is an item outline, crops have none (vanilla 0.46)`)
    else add("OK", "outline", "no outline, as for vanilla crops")
  } else {
    if (r.edgeDarker !== undefined && r.edgeDarker < 0.6)
      add("WARN", "outline", `edge pixels darker in only ${pyPercent(r.edgeDarker)}; vanilla items carry a 1px outline in the darkest shade (0.78)`)
    else add("OK", "outline", "outlined like a vanilla item")
    if (r.lightDir && (r.lightDir.includes("bottom") || r.lightDir.includes("right")))
      add("WARN", "light", `lightest pixels sit ${r.lightDir} of the sprite's centre; vanilla items are lit from top-left (weak proxy: 5 of 19 vanilla items trip it; do not tune pixels to silence it)`)
    else add("OK", "light", `lightest pixels sit ${r.lightDir ?? "nowhere"} of centre`)
  }

  const { lower } = options
  if (lower) {
    if (image.width !== 16 || image.height !== 16 || lower.width !== 16 || lower.height !== 16) {
      add("FAIL", "seam", "both halves must be 16x16")
      return out
    }
    const columns = (img: R.Raster, y: number) => Array.from({ length: 16 }, (_, x) => x).filter((x) => R.get(img, x, y)[3] > 0)
    const top = columns(image, 15)
    const low = columns(lower, 0)
    const stray = top.filter((x) => !low.includes(x))
    if (!top.length) add("FAIL", "seam", "upper half's bottom row is empty; the plant floats")
    else if (stray.length)
      add("FAIL", "seam", `upper half's bottom row has opaque columns [${stray.join(", ")}] that the lower half's top row lacks (lower has [${low.join(", ")}])`)
    else add("OK", "seam", `upper bottom-row columns [${top.join(", ")}] all continue into the lower half`)
  }
  return out
}

export const failures = (findings: ReadonlyArray<Finding>) => findings.filter((f) => f.level === "FAIL").length
