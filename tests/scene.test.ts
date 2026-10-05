import { describe, expect, test } from "bun:test"
import { BunServices } from "@effect/platform-bun"
import { Effect, Layer, Result } from "effect"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { encodePng } from "../src/core/png.ts"
import * as R from "../src/core/raster.ts"
import { packAtlas } from "../src/core/scene/atlas.ts"
import { decodeScene, parseState } from "../src/core/scene/scene-file.ts"
import * as Png from "../src/services/png.ts"
import { loadScene } from "../src/services/scene.ts"
import * as Vanilla from "../src/services/vanilla.ts"
import { tempDir, texture } from "./helpers.ts"

const root = join(import.meta.dir, "..")
const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v))

/** Authored stand-ins for game files, laid out like a jar. */
const FIXTURE = Vanilla.fixture({
  "assets/minecraft/blockstates/test_soil.json": json({
    variants: { "moisture=0": { model: "minecraft:block/test_soil" }, "moisture=7": { model: "minecraft:block/test_soil_wet" } },
  }),
  "assets/minecraft/models/block/test_soil.json": json({ parent: "minecraft:block/cube_all", textures: { all: "minecraft:block/test_soil" } }),
  "assets/minecraft/models/block/test_soil_wet.json": json({ parent: "minecraft:block/cube_all", textures: { all: "minecraft:block/test_soil_wet" } }),
  "assets/minecraft/models/block/cube_all.json": json({ textures: { particle: "#all" }, elements: [] }),
  "assets/minecraft/textures/block/test_soil.png": encodePng(texture(3)),
  "assets/minecraft/textures/block/test_soil_wet.png": encodePng(texture(4, 16, 48)),
})

const run = <A, E>(effect: Effect.Effect<A, E, any>, vanilla: Layer.Layer<Vanilla.Vanilla> = FIXTURE): Promise<A> =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(Layer.mergeAll(Png.layer, vanilla).pipe(Layer.provideMerge(BunServices.layer)))) as Effect.Effect<A, E, never>,
  )

function cornDir() {
  const dir = tempDir()
  for (const f of ["corn.stages", "corn.palette", "mature/lower.grid", "mature/upper.grid"]) {
    mkdirSync(join(dir, f, ".."), { recursive: true })
    writeFileSync(join(dir, f), readFileSync(join(root, "skill/examples/crop", f)))
  }
  return dir
}

describe("scene files", () => {
  test("parseState", () => {
    expect(parseState("wheat[age=7, half=lower]")).toEqual(["minecraft:wheat", { age: "7", half: "lower" }])
    expect(parseState("texturescript:x")).toEqual(["texturescript:x", {}])
  })

  test("a plot needs exactly one of stages and block", () => {
    const r = decodeScene({ plot: [{ label: "x", stages: "a", block: "b" }] })
    expect(Result.isFailure(r) && r.failure.message).toBe(`"x" needs exactly one of 'stages' or 'block'`)
    const bad = decodeScene({ plot: [{ at: [1, "x"] }] })
    expect(Result.isFailure(bad) && bad.failure.message).toContain(`["plot"][0]["at"][1]`)
  })

  test("atlas packing gives every texture its own cell", () => {
    const { image, uv } = packAtlas(new Map([["a", R.make(16, 16)], ["b", R.make(16, 16)], ["c", R.make(16, 16)]]))
    expect(image.width).toBe(32)
    expect(Object.values(uv).map(([x, y]) => `${x},${y}`).sort()).toEqual(["0,0", "0,16", "16,0"])
  })
})

describe("loadScene", () => {
  test("compiles a .stages plot in memory and places vanilla blocks from the jar", async () => {
    const dir = cornDir()
    writeFileSync(
      join(dir, "scene.toml"),
      `floor = "test_soil"\nground = "test_soil[moisture=7]"\n[[plot]]\nstages = "corn.stages"\nages = [0, 7]\n[[plot]]\nblock = "minecraft:missing_plant"\nat = [0, 2]\n`,
    )
    const { payload, watch } = await run(loadScene(join(dir, "scene.toml")))
    const blocks = payload.variants.default!
    expect(blocks.filter((b) => b.name.startsWith("texturescript:p0")).map((b) => b.name)).toEqual([
      "texturescript:p0_default_0_lower",
      "texturescript:p0_default_7_lower",
      "texturescript:p0_default_7_upper",
    ])
    expect(blocks.filter((b) => b.pos[1] === 0 && b.props.moisture === "7")).toHaveLength(3) // under each planted cell
    expect(payload.missing).toEqual(["minecraft:missing_plant"])
    expect(Object.keys(payload.atlas.uv)).toContain("minecraft:block/test_soil_wet")
    expect(payload.jar).toBe("fixture.jar")
    expect(watch.map((w) => w.path)).toContain(join(dir, "mature"))
  })

  test("works without a jar for authored blocks, and names what is missing", async () => {
    const dir = cornDir()
    writeFileSync(join(dir, "scene.toml"), `floor = "grass_block"\n[[plot]]\nstages = { a = "corn.stages", b = "nowhere" }\n`)
    const { payload } = await run(loadScene(join(dir, "scene.toml")), Vanilla.none)
    expect(Object.keys(payload.variants)).toEqual(["a", "b"])
    expect(payload.variants.a!.length).toBeGreaterThan(8)
    expect(payload.missing).toEqual(["minecraft:grass_block", "nowhere"])
  })

  test("reads stage folders written by `texturescript stages`", async () => {
    const dir = tempDir()
    for (const n of [0, 1]) {
      mkdirSync(join(dir, `out/stage${n}`), { recursive: true })
      writeFileSync(join(dir, `out/stage${n}/lower.png`), encodePng(texture(n)))
    }
    writeFileSync(join(dir, "scene.toml"), `[[plot]]\nstages = "out"\nmodel = "cross"\n`)
    const { payload } = await run(loadScene(join(dir, "scene.toml")), Vanilla.none)
    expect(payload.variants.default!.map((b) => b.pos)).toEqual([[0, 1, 0], [1, 1, 0]])
    expect((payload.models["texturescript:block/p0_default_1_lower"] as { parent: string }).parent).toBe("texturescript:block/cross")
  })
})
