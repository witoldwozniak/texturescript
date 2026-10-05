// The live server: serves the viewer, pushes the scene, and rebuilds when inputs change.
import { Effect, Queue } from "effect"
import { existsSync, watch as watchFs, type FSWatcher } from "node:fs"
import { join } from "node:path"
import type { ServerMessage } from "../core/scene/payload.ts"
import viewer from "../viewer/index.html"
import { loadScene, type LoadedScene } from "./scene.ts"

const viewerDir = join(import.meta.dir, "../viewer")

export interface LiveOptions {
  readonly port: number
}

/** Starts the server for the scope's lifetime; returns its URL. */
export const serveScene = Effect.fn("serveScene")(function* (sceneFile: string, options: LiveOptions) {
  let message: ServerMessage = { type: "error", message: "loading…" }
  let watch: LoadedScene["watch"] = []

  const build = loadScene(sceneFile).pipe(
    Effect.match({
      onSuccess: (loaded) => {
        message = { type: "scene", scene: loaded.payload }
        watch = loaded.watch
      },
      onFailure: (e) => {
        message = { type: "error", message: e.message }
      },
    }),
  )
  yield* build

  const serve = (port: number) =>
    Bun.serve({
      hostname: "127.0.0.1",
      port,
      development: false,
      routes: {
        "/": viewer,
        "/api/scene": () => Response.json(message),
      },
      fetch(req, server) {
        if (new URL(req.url).pathname === "/ws" && server.upgrade(req)) return undefined
        return new Response("not found", { status: 404 })
      },
      websocket: {
        open(ws) {
          ws.subscribe("scene")
          ws.send(JSON.stringify(message))
        },
        message() {},
      },
    })
  const server = yield* Effect.acquireRelease(
    Effect.try({
      try: () => {
        try {
          return serve(options.port)
        } catch {
          return serve(0) // the port is taken; any free one will do
        }
      },
      catch: (e) => new Error(`cannot start the server: ${e}`),
    }).pipe(Effect.orDie),
    (s) => Effect.sync(() => s.stop(true)),
  )

  // Bun bundles the viewer on its first request and names the chunks relative to the
  // working directory, so started elsewhere their URLs 404. Bundle it now, from its own
  // folder. A compiled binary has the bundle built in, and no such folder.
  if (existsSync(viewerDir)) {
    const cwd = process.cwd()
    process.chdir(viewerDir)
    yield* Effect.promise(() => fetch(server.url).then((r) => r.arrayBuffer())).pipe(Effect.ensuring(Effect.sync(() => process.chdir(cwd))))
  }

  // Watchers subscribe synchronously, so a save right after start-up is not missed.
  // Any change in a watched folder: let the burst of writes settle, rebuild, push.
  const changes = yield* Queue.sliding<void>(1)
  let watchers: FSWatcher[] = []
  let watching = ""
  const rewatch = () => {
    const key = JSON.stringify(watch)
    if (key === watching) return
    for (const w of watchers) w.close()
    watchers = watch.flatMap((w) => {
      try {
        return [watchFs(w.path, { recursive: w.recursive }, () => Queue.offerUnsafe(changes, undefined))]
      } catch {
        return [] // a folder that does not exist yet; the scene names it as missing
      }
    })
    watching = key
  }
  yield* Effect.acquireRelease(Effect.sync(rewatch), () => Effect.sync(() => watchers.forEach((w) => w.close())))
  yield* Effect.forkScoped(
    Effect.forever(
      Queue.take(changes).pipe(
        Effect.andThen(Effect.sleep("100 millis")),
        Effect.andThen(Queue.clear(changes)),
        Effect.andThen(build),
        Effect.andThen(Effect.sync(() => (rewatch(), server.publish("scene", JSON.stringify(message))))),
      ),
    ),
  )
  return { url: `http://127.0.0.1:${server.port}/`, current: () => message }
})
