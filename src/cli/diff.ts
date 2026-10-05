import { Console, Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { binarize, compare, diffSheet } from "../core/diff.ts"
import { PngFiles } from "../services/png.ts"
import * as flags from "./flags.ts"
import { printJson } from "./report.ts"

export const diffCommand = Command.make(
  "diff",
  {
    rendered: Argument.String("rendered").pipe(Argument.withDescription("the texture to check")),
    target: Argument.String("target").pipe(Argument.withDescription("the texture it should match")),
    sheet: Flag.String("sheet").pipe(Flag.optional, Flag.withDescription("write rendered | target | wrong pixels, upscaled")),
    check: Flag.Boolean("check").pipe(Flag.withDefault(false), Flag.withDescription("exit 1 when any pixel differs")),
    json: flags.json,
  },
  ({ rendered, target, sheet, check, json }) =>
    Effect.gen(function* () {
      const png = yield* PngFiles
      const [r, t] = [binarize(yield* png.read(rendered)), binarize(yield* png.read(target))]
      const result = compare(r, t)
      if ("error" in result) {
        process.exitCode = 1
        return yield* json ? printJson(result) : Console.log(result.error)
      }
      if (Option.isSome(sheet)) yield* png.write(sheet.value, diffSheet(r, t, result.mask))
      if (check && result.mismatch) process.exitCode = 1
      if (json) return yield* printJson({ ...result, ...(Option.isSome(sheet) && { sheet: sheet.value }) })
      yield* Console.log(`mismatch ${result.mismatch}/${result.of}  (missing ${result.missing}, extra ${result.extra}, wrong colour ${result.wrongColour})`)
      yield* Console.log(result.mask)
      if (Option.isSome(sheet)) yield* Console.log(`sheet: ${sheet.value}  (rendered | target | wrong pixels in red)`)
    }).pipe(
      Effect.catchTag("PngUnreadable", (e) => {
        process.exitCode = 1
        return Console.error(`REFUSED ${e.message}`)
      }),
    ),
).pipe(Command.withDescription("compare pixels with a target; --check makes differences fail"))
