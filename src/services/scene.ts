// Loads everything a scene file refers to and builds the viewer payload.
import { Effect, FileSystem, Path } from "effect"
import { renderGrid, type Grid } from "../core/grid.ts"
import type * as R from "../core/raster.ts"
import { buildScene, stageSources, type StageSet } from "../core/scene/build.ts"
import type { ScenePayload } from "../core/scene/payload.ts"
import { decodeScene } from "../core/scene/scene-file.ts"
import { inFile, specError } from "../core/spec-error.ts"
import { HALVES, inputsOf, parseStages, planStages, type Half } from "../core/stages.ts"
import { PngFiles } from "./png.ts"
import { readGrid, readPalette } from "./specs.ts"
import { Vanilla } from "./vanilla.ts"

export interface LoadedScene {
  readonly payload: ScenePayload
  /** Folders to watch: a change in any of them means the scene should be rebuilt. */
  readonly watch: ReadonlyArray<{ readonly path: string; readonly recursive: boolean }>
}

/** Compiles a .stages file in memory, exactly as `texturescript stages` would render it. */
const compileStages = Effect.fn("compileStages")(function* (file: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const text = yield* fs.readFileString(file).pipe(Effect.mapError((e) => inFile(specError(`cannot read: ${e.message}`), file)))
  const spec = yield* Effect.fromResult(parseStages(text)).pipe(Effect.mapError((e) => inFile(e, file)))
  const base = path.dirname(file)
  const palette = spec.palette ? yield* readPalette(path.join(base, spec.palette)) : undefined
  const loaded: Partial<Record<Half, { grid: Grid; path: string }>> = {}
  for (const half of HALVES) {
    const rel = spec.grids[half]
    if (rel) loaded[half] = { grid: yield* readGrid(path.join(base, rel)), path: path.join(base, rel) }
  }
  const plan = yield* Effect.fromResult(planStages({ spec, palette, grids: loaded })).pipe(Effect.mapError((e) => inFile(e, file)))
  const set = new Map<number, { lower?: R.Raster; upper?: R.Raster }>()
  plan.stages.forEach((stage, n) =>
    set.set(n, Object.fromEntries(HALVES.flatMap((h) => (stage[h] ? [[h, renderGrid(stage[h])]] : [])))),
  )
  return { set: set as StageSet, inputs: [file, ...inputsOf(spec).map((p) => path.join(base, p))] }
})

/** Reads a folder of stageN/{lower,upper}.png, as `texturescript stages` writes them. */
const readStageFolder = Effect.fn("readStageFolder")(function* (dir: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const png = yield* PngFiles
  const set = new Map<number, { lower?: R.Raster; upper?: R.Raster }>()
  for (const name of yield* fs.readDirectory(dir)) {
    const m = /^stage(\d+)$/.exec(name)
    if (!m) continue
    const halves: { lower?: R.Raster; upper?: R.Raster } = {}
    for (const half of HALVES) {
      const file = path.join(dir, name, `${half}.png`)
      if (yield* fs.exists(file)) halves[half] = yield* png.read(file).pipe(Effect.mapError((e) => specError(e.message)))
    }
    set.set(Number(m[1]), halves)
  }
  return set as StageSet
})

export const loadScene = Effect.fn("loadScene")(function* (sceneFile: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const vanilla = yield* Vanilla
  const text = yield* fs.readFileString(sceneFile).pipe(Effect.mapError((e) => inFile(specError(`cannot read: ${e.message}`), sceneFile)))
  const toml = yield* Effect.try({ try: () => Bun.TOML.parse(text), catch: (e) => inFile(specError(`not valid TOML: ${e instanceof Error ? e.message : e}`), sceneFile) })
  const scene = yield* Effect.fromResult(decodeScene(toml)).pipe(Effect.mapError((e) => inFile(e, sceneFile)))
  const base = path.dirname(sceneFile)
  const watch = new Map<string, boolean>([[base, false]])
  const sets = new Map<string, StageSet>()
  for (const source of stageSources(scene)) {
    const full = path.resolve(base, source)
    if (!(yield* fs.exists(full))) {
      watch.set(path.dirname(full), watch.get(path.dirname(full)) ?? false)
      continue
    }
    if (full.endsWith(".stages")) {
      const { set, inputs } = yield* compileStages(full)
      sets.set(source, set)
      for (const input of inputs) watch.set(path.dirname(input), watch.get(path.dirname(input)) ?? false)
    } else {
      sets.set(source, yield* readStageFolder(full))
      watch.set(full, true)
    }
  }
  const payload = buildScene(scene, { vanilla: vanilla.read, stages: (s) => sets.get(s), jar: vanilla.jar })
  return { payload, watch: [...watch].map(([p, recursive]) => ({ path: p, recursive })) } satisfies LoadedScene
})

