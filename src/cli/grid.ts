import { Console, Effect, FileSystem } from "effect"
import { Argument, Command } from "effect/cli"
import { parseGrid, renderGrid } from "../core/grid.ts"
import { saveOutputs } from "../services/outputs.ts"
import * as flags from "./flags.ts"
import { printJson, refuseSpecErrors } from "./report.ts"

/** Renders a .grid file to OUT.png, OUT_x16.png and OUT.txt. */
export const renderSpec = Effect.fn("renderSpec")(function* (file: string, out: string) {
  const fs = yield* FileSystem.FileSystem
  const grid = yield* Effect.fromResult(parseGrid(yield* fs.readFileString(file)))
  const image = renderGrid(grid)
  const { files } = yield* saveOutputs(image, out, grid.palette)
  return { image, paletteEntries: grid.palette.size, files }
})

export const gridCommand = Command.make(
  "grid",
  {
    file: Argument.String("spec").pipe(Argument.withDescription("character grid (.grid)")),
    out: Argument.String("out").pipe(Argument.withDescription("PNG to write; OUT_x16.png and OUT.txt are written beside it")),
    json: flags.json,
  },
  ({ file, out, json }) =>
    Effect.gen(function* () {
      const { image, paletteEntries, files } = yield* renderSpec(file, out)
      yield* json
        ? printJson({ width: image.width, height: image.height, paletteEntries, files })
        : Console.log(`rendered ${out} (${image.width}x${image.height}, ${paletteEntries} palette entries)`)
    }).pipe(refuseSpecErrors(file, json)),
).pipe(Command.withDescription("render a character grid to PNG, a ×16 preview and ASCII"))
