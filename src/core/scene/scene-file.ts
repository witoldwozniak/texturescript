// The scene file (TOML): what to plant where, and how to look at it.
//
//   camera = { yaw = 35, pitch = 25, distance = 7 }   # degrees, blocks
//   floor = "minecraft:grass_block"                   # under the whole padded area
//   ground = "minecraft:farmland[moisture=7]"         # under each planted cell
//
//   [[plot]]
//   label = "corn"
//   stages = "corn.stages"       # a .stages file, a folder of stageN/ PNGs, or { name = path, ... } variants
//   ages = [0, 3, 5, 7]          # which stages, along +x; default: all
//   model = "crop"               # crop (4 planes) or cross (2 diagonals)
//   at = [0, 0]                  # x, z of the first age
//
//   [[plot]]
//   block = "minecraft:sunflower[half=lower]"   # a vanilla block, from your client jar
//   ground = "minecraft:grass_block"            # this plot's ground instead of the scene's
//   at = [0, 2]
import { Result, Schema } from "effect"
import { specError, type SpecError } from "../spec-error.ts"

const Plot = Schema.Struct({
  label: Schema.optional(Schema.String),
  at: Schema.optional(Schema.Tuple([Schema.Int, Schema.Int])),
  ground: Schema.optional(Schema.String),
  block: Schema.optional(Schema.String),
  stages: Schema.optional(Schema.Union([Schema.String, Schema.Record(Schema.String, Schema.String)])),
  ages: Schema.optional(Schema.Array(Schema.Int)),
  model: Schema.optional(Schema.Literals(["crop", "cross"])),
})

export const SceneFile = Schema.Struct({
  camera: Schema.optional(Schema.Struct({ yaw: Schema.optional(Schema.Number), pitch: Schema.optional(Schema.Number), distance: Schema.optional(Schema.Number) })),
  floor: Schema.optional(Schema.String),
  ground: Schema.optional(Schema.String),
  plot: Schema.optional(Schema.Array(Plot)),
})

export type SceneFile = typeof SceneFile.Type
export type Plot = typeof Plot.Type

/** Validates parsed TOML. Every plot needs exactly one of `block` and `stages`. */
export function decodeScene(toml: unknown): Result.Result<SceneFile, SpecError> {
  const r = Schema.decodeUnknownResult(SceneFile)(toml)
  if (Result.isFailure(r)) return Result.fail(specError(String(r.failure.message).replace(/\n\s*/g, " ")))
  for (const [i, plot] of (r.success.plot ?? []).entries()) {
    const name = JSON.stringify(plot.label ?? `plot ${i}`)
    if ((plot.block === undefined) === (plot.stages === undefined)) return Result.fail(specError(`${name} needs exactly one of 'stages' or 'block'`))
  }
  return Result.succeed(r.success)
}

/** "minecraft:wheat[age=7]" → ["minecraft:wheat", { age: "7" }]; a bare name gets minecraft:. */
export function parseState(state: string): readonly [string, Record<string, string>] {
  const open = state.indexOf("[")
  const name = (open < 0 ? state : state.slice(0, open)).trim()
  const props: Record<string, string> = {}
  if (open >= 0)
    for (const kv of state.slice(open + 1).replace(/\]\s*$/, "").split(",")) {
      const eq = kv.indexOf("=")
      if (kv.trim()) props[(eq < 0 ? kv : kv.slice(0, eq)).trim()] = eq < 0 ? "" : kv.slice(eq + 1).trim()
    }
  return [normId(name), props]
}

export const normId = (id: string) => (id.includes(":") ? id : `minecraft:${id}`)
