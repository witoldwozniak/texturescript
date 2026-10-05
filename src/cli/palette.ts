import { Console, Effect, FileSystem, Option, Path } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { anchorNotes, paletteSection, parsePalette, swatch } from "../core/palette.ts"
import { PngFiles } from "../services/png.ts"
import * as flags from "./flags.ts"
import { printJson, refuseSpecErrors } from "./report.ts"

export const paletteCommand = Command.make(
  "palette",
  {
    file: Argument.String("materials").pipe(Argument.withDescription("family palette (.palette)")),
    out: Flag.String("out").pipe(Flag.optional, Flag.withDescription("also write the palette section here")),
    swatch: Flag.String("swatch").pipe(Flag.optional, Flag.withDescription("write a PNG of the shades")),
    json: flags.json,
  },
  ({ file, out, swatch: swatchPath, json }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const family = yield* Effect.fromResult(parsePalette(yield* fs.readFileString(file)))
      const section = paletteSection(family)
      if (Option.isSome(out)) {
        yield* fs.makeDirectory(path.dirname(out.value), { recursive: true })
        yield* fs.writeFileString(out.value, section)
      }
      if (Option.isSome(swatchPath)) yield* (yield* PngFiles).write(swatchPath.value, swatch(family))
      if (json) {
        return yield* printJson({
          transparent: family.transparent,
          materials: family.materials.map((m) => ({ name: m.name, dark: m.dark, light: m.light, shades: m.shades, keys: m.keys.join(""), hexes: m.hexes, notes: anchorNotes(m) })),
          section,
        })
      }
      if (Option.isSome(out)) yield* Console.log(`wrote ${out.value}`)
      yield* Console.log(section)
      if (Option.isSome(swatchPath)) yield* Console.log(`swatch: ${swatchPath.value}`)
    }).pipe(refuseSpecErrors(file, json)),
).pipe(Command.withDescription("derive material shades from two colour anchors"))
