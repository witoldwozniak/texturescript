// Reading and writing PNG files; the core only ever sees Rasters.
import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect"
import { decodePng, encodePng } from "../core/png.ts"
import type { Raster } from "../core/raster.ts"

export class PngUnreadable extends Schema.TaggedError<PngUnreadable>()("PngUnreadable", {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.path}: ${this.reason}`
  }
}

export class PngFiles extends Context.Service<PngFiles, {
  readonly read: (path: string) => Effect.Effect<Raster, PngUnreadable>
  /** Writes the PNG, creating parent folders. */
  readonly write: (path: string, image: Raster) => Effect.Effect<void, PngUnreadable>
}>()("texturescript/PngFiles") {}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e))

export const layer = Layer.effect(
  PngFiles,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    return PngFiles.of({
      read: (file) =>
        fs.readFile(file).pipe(
          Effect.flatMap((bytes) => Effect.try({ try: () => decodePng(bytes), catch: reason })),
          Effect.mapError((e) => new PngUnreadable({ path: file, reason: typeof e === "string" ? e : reason(e) })),
        ),
      write: (file, image) =>
        fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(
          Effect.andThen(fs.writeFile(file, encodePng(image))),
          Effect.mapError((e) => new PngUnreadable({ path: file, reason: reason(e) })),
        ),
    })
  }),
)
