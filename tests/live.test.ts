import { describe, expect, test } from "bun:test"
import { BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { ScenePayload, ServerMessage } from "../src/core/scene/payload.ts"
import { serveScene } from "../src/services/live.ts"
import * as Png from "../src/services/png.ts"
import * as Vanilla from "../src/services/vanilla.ts"
import { tempDir } from "./helpers.ts"

const root = join(import.meta.dir, "..")

const run = <A, E>(effect: Effect.Effect<A, E, any>, vanilla: Layer.Layer<Vanilla.Vanilla> = Vanilla.none): Promise<A> =>
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

describe("the live server", () => {
  test("pushes a rebuilt scene within a second of saving a grid", async () => {
    const dir = cornDir()
    writeFileSync(join(dir, "scene.toml"), `[[plot]]\nstages = "corn.stages"\nages = [7]\n`)
    const grid = join(dir, "mature/lower.grid")
    const updated = await run(
      Effect.gen(function* () {
        const { url } = yield* serveScene(join(dir, "scene.toml"), { port: 0 })
        return yield* Effect.promise(
          () =>
            new Promise<{ first: ScenePayload; next: ScenePayload; ms: number }>((resolve, reject) => {
              const ws = new WebSocket(`${url.replace("http", "ws")}ws`)
              let first: ScenePayload | undefined
              let saved = 0
              const timer = setTimeout(() => reject(new Error("no update within 3 s")), 3000)
              ws.onmessage = (e) => {
                const msg = JSON.parse(e.data) as ServerMessage
                if (msg.type !== "scene") return reject(new Error(msg.message))
                if (!first) {
                  first = msg.scene
                  saved = performance.now()
                  // Recolour the mature stalk's top rows: the atlas must change.
                  writeFileSync(grid, readFileSync(grid, "utf8").replaceAll(".......cc.......", ".......dd......."))
                } else {
                  clearTimeout(timer)
                  ws.close()
                  resolve({ first, next: msg.scene, ms: performance.now() - saved })
                }
              }
            }),
        )
      }),
      Vanilla.none,
    )
    expect(updated.ms).toBeLessThan(1000)
    expect(updated.next.atlas.rgba).not.toBe(updated.first.atlas.rgba)
  })

  test("reports a broken input to the page instead of stopping", async () => {
    const dir = cornDir()
    writeFileSync(join(dir, "scene.toml"), `[[plot]]\nstages = "corn.stages"\n`)
    writeFileSync(join(dir, "mature/lower.grid"), "palette\n. transparent\ngrid\n.x\n")
    const msg = await run(
      Effect.gen(function* () {
        const { url } = yield* serveScene(join(dir, "scene.toml"), { port: 0 })
        return (yield* Effect.promise(() => fetch(`${url}api/scene`).then((r) => r.json()))) as ServerMessage
      }),
      Vanilla.none,
    )
    expect(msg).toEqual({ type: "error", message: `${join(dir, "mature/lower.grid")}:4:2: character "x" is not in the palette` })
  })
})
