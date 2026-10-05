// Read-only, in-memory access to the game's own blocks, for comparison in scenes.
// Nothing read here is ever written to disk.
import { Context, Effect, FileSystem, Layer } from "effect"
import { GameJar, unzipEntries } from "./jar.ts"

export class Vanilla extends Context.Service<Vanilla, {
  /** The jar the files come from, if any. */
  readonly jar: string | null
  /** Bytes of a game file, e.g. assets/minecraft/blockstates/wheat.json. */
  readonly read: (path: string) => Uint8Array | undefined
}>()("texturescript/Vanilla") {}

/** Reads from the given jar, or the one your launcher downloaded most recently. */
export const live = (override?: string) =>
  Layer.effect(
    Vanilla,
    Effect.gen(function* () {
      const jar = yield* (yield* GameJar).find(override)
      const bytes = yield* (yield* FileSystem.FileSystem).readFile(jar)
      const cache = new Map<string, Uint8Array | undefined>()
      return Vanilla.of({
        jar,
        read: (path) => {
          if (!cache.has(path)) cache.set(path, unzipEntries(bytes, (name) => name === path)[path])
          return cache.get(path)
        },
      })
    }),
  )

/** No game files: scenes show only authored blocks. */
export const none = Layer.succeed(Vanilla, Vanilla.of({ jar: null, read: () => undefined }))

/** Authored stand-ins laid out like a jar, for tests. */
export const fixture = (files: Readonly<Record<string, Uint8Array>>) =>
  Layer.succeed(Vanilla, Vanilla.of({ jar: "fixture.jar", read: (path) => files[path] }))
