// Growth stages derived from mature grids and first-appearance maps.
//
//   palette corn.palette
//   grid lower mature/lower.grid
//   stages 8
//   shift 0 +2              # shade shift within each material at stage 0
//   recolour 1 e c          # through stage 1, draw e as c before shifting
//   map lower               # 16 rows: '.' or the stage digit a pixel first appears at
//   ...
//
// Loading is split so this module never touches files: parseStages lists the files a
// spec needs, the caller reads them, and planStages builds every stage's grid.
import { Result } from "effect"
import type { Grid } from "./grid.ts"
import { validateKeys, type FamilyPalette } from "./palette.ts"
import { specError, inFile, type SpecError } from "./spec-error.ts"

export const HALVES = ["lower", "upper"] as const
export type Half = (typeof HALVES)[number]

export interface MapRows {
  readonly rows: ReadonlyArray<string>
  /** Line of each row in the .stages file, for error locations. */
  readonly lines: ReadonlyArray<number>
}

export interface StagesSpec {
  /** Paths as written, relative to the .stages file. */
  readonly palette: string | undefined
  readonly grids: Partial<Record<Half, string>>
  readonly maps: Partial<Record<Half, MapRows>>
  readonly stages: number
  readonly shift: ReadonlyMap<number, number>
  readonly recolour: ReadonlyArray<readonly [throughStage: number, from: string, to: string]>
}

const DIRECTIVES = new Set(["palette", "grid", "stages", "shift", "recolour", "map"])

/** Python's shlex.split(line, comments=True), enough for directives: quotes and # comments. */
export function shellWords(line: string): Result.Result<string[], string> {
  const words: string[] = []
  let word: string | undefined
  let quote: string | undefined
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quote) {
      if (ch === quote) quote = undefined
      else if (ch === "\\" && quote === '"' && /["\\$`]/.test(line[i + 1] ?? "")) word += line[++i]!
      else word += ch
    } else if (/\s/.test(ch)) {
      if (word !== undefined) words.push(word)
      word = undefined
    } else if (ch === "#" && word === undefined) {
      break
    } else if (ch === "'" || ch === '"') {
      quote = ch
      word ??= ""
    } else if (ch === "\\") {
      if (i + 1 >= line.length) return Result.fail("No escaped character")
      word = (word ?? "") + line[++i]
    } else word = (word ?? "") + ch
  }
  if (quote) return Result.fail("No closing quotation")
  if (word !== undefined) words.push(word)
  return Result.succeed(words)
}

const int = (s: string) => (/^\s*[+-]?\d+\s*$/.test(s) ? parseInt(s, 10) : undefined)

export function parseStages(text: string): Result.Result<StagesSpec, SpecError> {
  let palette: string | undefined
  let stages = 8
  const grids: Partial<Record<Half, string>> = {}
  const maps: Partial<Record<Half, { rows: string[]; lines: number[] }>> = {}
  const shift = new Map<number, number>()
  const recolour: Array<readonly [number, string, string]> = []
  const singletons = new Set<string>()
  let section: Half | undefined
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1
    const raw = lines[i]!
    const split = shellWords(raw)
    if (Result.isFailure(split)) return Result.fail(specError(split.failure, n))
    const parts = split.success
    if (parts.length === 0) continue
    if (section && parts.length === 1 && !DIRECTIVES.has(parts[0]!)) {
      const row = parts[0]!
      if (row.length !== 16 || /[^.0-9]/.test(row)) return Result.fail(specError("map rows must contain 16 dots or ASCII stage digits", n))
      maps[section]!.rows.push(row)
      maps[section]!.lines.push(n)
      continue
    }
    section = undefined
    const [cmd, a, b, c] = parts
    const fail = (reason: string) => Result.fail(specError(reason, n))
    if ((cmd === "palette" || cmd === "stages") && parts.length === 2) {
      if (singletons.has(cmd)) return fail(`duplicate ${cmd} directive`)
      singletons.add(cmd)
      if (cmd === "palette") palette = a
      else {
        const v = int(a!)
        if (v === undefined) return fail(`invalid literal for int(): ${JSON.stringify(a)}`)
        stages = v
      }
    } else if ((cmd === "grid" && parts.length === 3) || (cmd === "map" && parts.length === 2)) {
      if (a !== "lower" && a !== "upper") return fail("half must be lower or upper")
      if (cmd === "grid") {
        if (grids[a] !== undefined) return fail(`duplicate grid ${a}`)
        grids[a] = b!
      } else {
        if (maps[a]) return fail(`duplicate map ${a}`)
        maps[a] = { rows: [], lines: [] }
        section = a
      }
    } else if (cmd === "shift" && parts.length === 3) {
      const [stage, k] = [int(a!), int(b!)]
      if (stage === undefined || k === undefined) return fail("shift takes a stage number and a signed shade count")
      if (shift.has(stage)) return fail(`duplicate shift for stage ${stage}`)
      shift.set(stage, k)
    } else if (cmd === "recolour" && parts.length === 4 && [...b!].length === 1 && [...c!].length === 1) {
      const stage = int(a!)
      if (stage === undefined) return fail("recolour takes a stage number and two palette keys")
      recolour.push([stage, b!, c!])
    } else return fail(`unexpected directive: ${raw.trim()}`)
  }
  if (!(stages >= 1 && stages <= 10)) return Result.fail(specError("stages must be between 1 and 10 (maps use single digits)"))
  if (grids.lower === undefined) return Result.fail(specError("a lower grid is required"))
  const halvesOf = (o: object) => Object.keys(o).sort().join()
  if (halvesOf(grids) !== halvesOf(maps)) return Result.fail(specError("each grid needs exactly one matching map"))
  if (shift.size && !palette) return Result.fail(specError("shade shifts require a family palette"))
  for (const stage of [...shift.keys(), ...recolour.map(([s]) => s)])
    if (!(stage >= 0 && stage < stages)) return Result.fail(specError(`stage ${stage} outside 0..${stages - 1}`))
  for (const half of HALVES) {
    const map = maps[half]
    if (!map) continue
    if (map.rows.length !== 16) return Result.fail(specError(`map ${half}: ${map.rows.length} rows, expected 16`))
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const ch = map.rows[y]![x]!
        if (ch !== "." && Number(ch) >= stages)
          return Result.fail(specError(`map ${half}: stage ${ch} outside 0..${stages - 1}`, map.lines[y], firstColumn(lines, map.lines[y]!, map.rows[y]!) + x))
      }
  }
  return Result.succeed({ palette, grids, maps, stages, shift, recolour })
}

const firstColumn = (lines: string[], line: number, row: string) => lines[line - 1]!.indexOf(row) + 1

/** The files a spec reads, relative to it. */
export const inputsOf = (spec: StagesSpec): string[] => [...(spec.palette ? [spec.palette] : []), ...HALVES.flatMap((h) => spec.grids[h] ?? [])]

/** Moves a key `k` shades along its material's ramp, clamped at the ends. */
export function shifted(ch: string, k: number, family: FamilyPalette | undefined): string {
  for (const m of family?.materials ?? []) {
    const i = m.keys.indexOf(ch)
    if (i >= 0) return m.keys[Math.max(0, Math.min(m.keys.length - 1, i + k))]!
  }
  return ch
}

export type Stage = Partial<Record<Half, Grid>>

export interface PlanInputs {
  readonly spec: StagesSpec
  readonly palette: FamilyPalette | undefined
  /** Mature grids with the path they came from, for messages. */
  readonly grids: Partial<Record<Half, { readonly grid: Grid; readonly path: string }>>
  /** Hand-drawn grids to use instead of generating, from --keep. */
  readonly override?: (stage: number, half: Half) => { readonly grid: Grid; readonly path: string } | undefined
}

export interface Plan {
  readonly stages: ReadonlyArray<Stage>
  readonly warnings: ReadonlyArray<string>
  /** Halves that are empty at a stage but have an override file (kept, not rendered). */
  readonly keptEmpty: ReadonlyArray<readonly [number, Half]>
}

const is16 = (g: Grid) => g.rows.length === 16 && [...g.rows[0]!].length === 16

/** Validates the whole run, then builds every stage. Nothing is written. */
export function planStages({ spec, palette, grids, override }: PlanInputs): Result.Result<Plan, SpecError> {
  const fail = (reason: string, file?: string) => {
    const e = specError(reason)
    return Result.fail(file ? inFile(e, file) : e)
  }
  const halves = new Map<Half, { palette: Map<string, readonly [number, number, number, number]>; rows: string[][]; map: string[]; transparent: string }>()
  for (const half of HALVES) {
    const input = grids[half]
    if (!input) continue
    const { grid, path } = input
    if (!is16(grid)) return fail("stages require a 16x16 grid", path)
    if (palette) {
      const ok = validateKeys(grid.palette, palette)
      if (Result.isFailure(ok)) return Result.fail(inFile(ok.failure, path))
    }
    const pal = new Map(grid.palette)
    let transparent = [...pal].find(([, p]) => p[3] === 0)?.[0]
    if (transparent === undefined) {
      if (pal.has(".")) return fail("declare a transparent palette key", path)
      transparent = "."
      pal.set(".", [0, 0, 0, 0])
    }
    const map = spec.maps[half]!
    const rows = grid.rows.map((r) => [...r])
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        if ((pal.get(rows[y]![x]!)![3] > 0) !== (map.rows[y]![x] !== "."))
          return fail(`map ${half} row ${y} col ${x}: stage labels must match opaque pixels`)
    const used = new Set(rows.flat())
    for (const [, src, dst] of spec.recolour)
      if (used.has(src) && !(pal.get(dst)?.[3])) return fail(`recolour destination ${JSON.stringify(dst)} must be an opaque palette key`, path)
    halves.set(half, { palette: pal, rows, map: [...map.rows], transparent })
  }
  const allKeys = new Set([...halves.values()].flatMap((h) => [...h.palette.keys()]))
  for (const [, src] of spec.recolour) if (!allKeys.has(src)) return fail(`recolour source ${JSON.stringify(src)} is not in any grid palette`)

  const stages: Stage[] = []
  const warnings: string[] = []
  const keptEmpty: Array<readonly [number, Half]> = []
  for (let n = 0; n < spec.stages; n++) {
    const stage: { -readonly [H in Half]?: Grid } = {}
    for (const [half, { palette: pal, rows, map, transparent }] of halves) {
      const kept = override?.(n, half)
      let grid: Grid
      if (kept) {
        if (!is16(kept.grid)) return fail("stages require a 16x16 grid", kept.path)
        if (palette) {
          const ok = validateKeys(kept.grid.palette, palette)
          if (Result.isFailure(ok)) return Result.fail(inFile(ok.failure, kept.path))
        }
        grid = kept.grid
      } else {
        const remap = new Map(spec.recolour.filter(([upto]) => n <= upto).map(([, a, b]) => [a, b]))
        const k = spec.shift.get(n) ?? 0
        const visible = (x: number, y: number) => map[y]![x] !== "." && Number(map[y]![x]) <= n
        for (const m of palette?.materials ?? []) {
          const before = new Set<string>()
          rows.forEach((row, y) => row.forEach((ch, x) => visible(x, y) && before.add(remap.get(ch) ?? ch)))
          for (const ch of [...before]) if (!m.keys.includes(ch)) before.delete(ch)
          const after = new Set([...before].map((ch) => shifted(ch, k, palette)))
          if (after.size < before.size - 1)
            warnings.push(`stage${n} ${half}: shift collapses ${m.name} from ${before.size} shades to ${after.size}; consider a smaller shift`)
        }
        const generated = rows.map((row, y) => row.map((ch, x) => (visible(x, y) ? shifted(remap.get(ch) ?? ch, k, palette) : transparent)).join(""))
        grid = { palette: pal, rows: generated }
      }
      const unknown = [...new Set(grid.rows.flatMap((r) => [...r]))].filter((ch) => !grid.palette.has(ch)).sort()
      if (unknown.length) return fail(`stage${n} ${half}: missing shifted palette keys [${unknown.map((u) => `'${u}'`).join(", ")}]`)
      if (!grid.rows.some((r) => [...r].some((ch) => grid.palette.get(ch)![3]))) {
        if (half === "lower") return fail(`stage${n} lower is empty; label sprout pixels or supply a hand-drawn grid with --keep`)
        if (kept) keptEmpty.push([n, half])
        continue
      }
      stage[half] = grid
    }
    stages.push(stage)
  }
  return Result.succeed({ stages, warnings, keptEmpty })
}
