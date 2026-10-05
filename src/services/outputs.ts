// The files written for every rendered texture: PNG, ×16 preview and the grid as text.
import { Effect, FileSystem, Path } from "effect"
import { toAscii, type GridPalette } from "../core/grid.ts"
import * as R from "../core/raster.ts"
import { PngFiles } from "./png.ts"

/** Writes OUT.png, OUT_x16.png and OUT.txt; returns the ASCII rendering and the paths. */
export const saveOutputs = Effect.fn("saveOutputs")(function* (image: R.Raster, out: string, palette: GridPalette, scale = 16) {
  const png = yield* PngFiles
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const { dir, name } = path.parse(out)
  const files = [out, path.join(dir, `${name}_x${scale}.png`), path.join(dir, `${name}.txt`)] as const
  const ascii = toAscii(image, palette)
  yield* png.write(files[0], image)
  yield* png.write(files[1], R.scale(image, scale))
  yield* fs.writeFileString(files[2], ascii + "\n")
  return { ascii, files }
})
