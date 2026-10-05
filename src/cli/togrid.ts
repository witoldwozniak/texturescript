import { Console, Effect, FileSystem, Option, Path } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { specError } from "../core/spec-error.ts"
import { toGrid } from "../core/togrid.ts"
import { PngFiles } from "../services/png.ts"
import * as flags from "./flags.ts"
import { printJson, refuseSpecErrors } from "./report.ts"

export const togridCommand = Command.make(
  "togrid",
  {
    png: Argument.String("png").pipe(Argument.withDescription("PNG to convert")),
    out: Argument.String("out").pipe(Argument.withDescription("grid file to write")),
    name: Flag.String("name").pipe(Flag.optional, Flag.withDescription("name for the header comment (default: the PNG's)")),
    json: flags.json,
  },
  ({ png, out, name, json }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const image = yield* (yield* PngFiles).read(png).pipe(Effect.mapError((e) => specError(e.message)))
      const text = yield* Effect.fromResult(toGrid(image, Option.getOrElse(name, () => path.parse(png).name)))
      yield* fs.makeDirectory(path.dirname(out), { recursive: true })
      yield* fs.writeFileString(out, text)
      yield* json ? printJson({ out }) : Console.log(`wrote ${out}`)
    }).pipe(refuseSpecErrors(png, json)),
).pipe(Command.withDescription("convert a PNG to an editable character grid, letters darkest first"))
