import { Console, Effect, FileSystem, Path } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { renderGrid, serializeGrid, type Grid } from "../core/grid.ts"
import { failures, lint, type Finding } from "../core/lint.ts"
import * as R from "../core/raster.ts"
import { inFile, specError } from "../core/spec-error.ts"
import { HALVES, parseStages, planStages, type Half } from "../core/stages.ts"
import { saveOutputs } from "../services/outputs.ts"
import { PngFiles } from "../services/png.ts"
import { readGrid, readPalette } from "../services/specs.ts"
import * as flags from "./flags.ts"
import { lintPalette } from "./lint.ts"
import { printJson, refuseSpecErrors } from "./report.ts"

const SUFFIXES = [".grid", ".png", ".txt", "_x16.png"] as const

/** Lays the stages out left to right, upper halves above lower ones, ×6 on grey. */
function strip(rendered: ReadonlyArray<Partial<Record<Half, R.Raster>>>): R.Raster {
  const out = R.make(rendered.length * 104 + 8, 220, [127, 127, 127, 255])
  rendered.forEach((stage, n) => {
    for (const half of HALVES) {
      const image = stage[half]
      if (image) R.composite(out, R.scale(image, 6), 8 + n * 104, half === "upper" ? 4 : 100)
    }
  })
  return out
}

export const stagesCommand = Command.make(
  "stages",
  {
    spec: Argument.String("spec").pipe(Argument.withDescription("growth stages spec (.stages)")),
    outDir: Argument.String("out-dir").pipe(Argument.withDescription("folder for stageN/ outputs and strip.png")),
    keep: Flag.Boolean("keep").pipe(Flag.withDefault(false), Flag.withDescription("use existing stageN/HALF.grid files as hand-drawn overrides")),
    json: flags.json,
  },
  ({ spec: specPath, outDir, keep, json }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const text = yield* fs.readFileString(specPath).pipe(Effect.mapError((e) => specError(`cannot read: ${e.message}`)))
      const spec = yield* Effect.fromResult(parseStages(text))
      const base = path.dirname(specPath)
      const palettePath = spec.palette && path.join(base, spec.palette)
      const palette = palettePath ? yield* readPalette(palettePath) : undefined

      const grids: Partial<Record<Half, { grid: Grid; path: string }>> = {}
      for (const half of HALVES) {
        const rel = spec.grids[half]
        if (rel) grids[half] = { grid: yield* readGrid(path.join(base, rel)), path: path.join(base, rel) }
      }
      const sources = new Set(Object.values(grids).map((g) => path.resolve(g.path)))
      const gridPath = (n: number, half: Half) => path.join(outDir, `stage${n}`, `${half}.grid`)
      const overrides = new Map<string, { grid: Grid; path: string }>()
      for (let n = 0; n < spec.stages; n++)
        for (const half of HALVES) {
          if (!grids[half]) continue
          const p = gridPath(n, half)
          if (keep && (yield* fs.exists(p))) overrides.set(p, { grid: yield* readGrid(p), path: p })
          else if (sources.has(path.resolve(p)))
            return yield* inFile(specError("would overwrite a mature input; use a separate output directory or --keep"), p)
        }

      const plan = yield* Effect.fromResult(planStages({ spec, palette, grids, override: (n, half) => overrides.get(gridPath(n, half)) }))

      // Refuse to leave outputs from an earlier, larger run lying around.
      const expected = new Set<string>(plan.keptEmpty.map(([n, half]) => path.resolve(gridPath(n, half))))
      plan.stages.forEach((stage, n) => {
        for (const half of HALVES) if (stage[half]) for (const s of SUFFIXES) expected.add(path.resolve(outDir, `stage${n}`, `${half}${s}`))
      })
      const ours = new Set(HALVES.flatMap((h) => SUFFIXES.map((s) => `${h}${s}`)))
      const stale: string[] = []
      for (const dir of (yield* fs.readDirectory(outDir).pipe(Effect.orElseSucceed(() => [] as string[]))).filter((d) => d.startsWith("stage")))
        for (const name of yield* fs.readDirectory(path.join(outDir, dir)).pipe(Effect.orElseSucceed(() => [] as string[])))
          if (ours.has(name) && !expected.has(path.resolve(outDir, dir, name))) stale.push(path.join(outDir, dir, name))
      if (stale.length) return yield* specError(`stale stage output ${stale.sort()[0]}; use a fresh output directory (existing files were preserved)`)

      if (!json) for (const w of plan.warnings) yield* Console.log(`WARN ${w}`)
      const familyLint = palettePath ? yield* lintPalette(palettePath) : undefined
      const results: Array<{ stage: number; half: Half; files: readonly string[]; findings: Finding[] }> = []
      const rendered: Array<Partial<Record<Half, R.Raster>>> = []
      let failed = 0
      for (const [n, stage] of plan.stages.entries()) {
        const images: Partial<Record<Half, R.Raster>> = {}
        for (const half of HALVES) {
          const grid = stage[half]
          if (!grid) continue
          const image = renderGrid(grid)
          images[half] = image
          const out = path.join(outDir, `stage${n}`, `${half}.png`)
          const { files } = yield* saveOutputs(image, out, grid.palette)
          if (!overrides.has(gridPath(n, half))) yield* fs.writeFileString(gridPath(n, half), serializeGrid(grid))
          results.push({ stage: n, half, files: [gridPath(n, half), ...files], findings: [] })
        }
        for (const half of HALVES) {
          const image = images[half]
          if (!image) continue
          const findings = lint(image, {
            ...(half === "upper" && images.lower && { lower: images.lower }),
            ...(familyLint && { palette: familyLint }),
          })
          results.find((r) => r.stage === n && r.half === half)!.findings = findings
          failed += failures(findings)
          if (!json) {
            yield* Console.log(`stage${n} ${half}: ${failures(findings) ? "FAIL" : "pass"}`)
            for (const f of findings) if (f.level !== "OK") yield* Console.log(`  ${f.level} ${f.rule}: ${f.message}`)
          }
        }
        rendered.push(images)
      }
      const stripPath = path.join(outDir, "strip.png")
      yield* (yield* PngFiles).write(stripPath, strip(rendered))
      if (failed) process.exitCode = 1
      if (json) return yield* printJson({ passed: failed === 0, warnings: plan.warnings, stages: results, strip: stripPath })
      yield* Console.log(`strip: ${stripPath}`)
    }).pipe(refuseSpecErrors(specPath, json)),
).pipe(Command.withDescription("generate a crop's growth stages and lint each one"))

