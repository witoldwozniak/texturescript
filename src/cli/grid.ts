import { Console, Effect, FileSystem } from "effect"
import { Argument, Command } from "effect/cli"
import { parseGrid, renderGrid } from "../core/grid.ts"
import { saveOutputs } from "../services/outputs.ts"
import * as flags from "./flags.ts"
import { printJson, refuseSpecErrors } from "./report.ts"

export const gridCommand = Command.make(
  "grid",
  {
    file: Argument.String("spec").pipe(Argument.withDescription("character grid (.grid)")),
    out: Argument.String("out").pipe(Argument.withDescription("PNG to write; OUT_x16.png and OUT.txt are written beside it")),
    json: flags.json,
  },
  ({ file, out, json }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const grid = yield* Effect.fromResult(parseGrid(yield* fs.readFileString(file)))
      const image = renderGrid(grid)
      const { files } = yield* saveOutputs(image, out, grid.palette)
      yield* json
        ? printJson({ width: image.width, height: image.height, paletteEntries: grid.palette.size, files })
        : Console.log(`rendered ${out} (${image.width}x${image.height}, ${grid.palette.size} palette entries)`)
    }).pipe(refuseSpecErrors(file, json)),
).pipe(Command.withDescription("render a character grid to PNG, a ×16 preview and ASCII"))
