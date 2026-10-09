import { Console, Effect, Option, Path } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { failures, lint, type Finding, type LintOptions } from "../core/lint.ts"
import { PngFiles } from "../services/png.ts"
import { readPalette } from "../services/specs.ts"
import * as flags from "./flags.ts"
import { printJson, refuseSpecErrors } from "./report.ts"

/** The palette option for lint: the family, or why it could not be read. */
export const lintPalette = (file: string) =>
  Effect.gen(function* () {
    const name = (yield* Path.Path).basename(file)
    return yield* readPalette(file).pipe(
      Effect.map((family): NonNullable<LintOptions["palette"]> => ({ name, family })),
      Effect.catchTag("SpecError", (e) => Effect.succeed({ name, error: e.message })),
    )
  })

export const findingLines = (findings: ReadonlyArray<Finding>) =>
  findings.map((f) => `${f.level.padEnd(4)} ${f.rule.padEnd(9)} ${f.message}`)

export interface LintFileOptions {
  readonly texture: string
  readonly kind: NonNullable<LintOptions["kind"]>
  readonly lower?: string | undefined
  readonly palette?: string | undefined
}

/** Lints a PNG file, reading the lower half and the family palette when given. */
export const lintFile = Effect.fn("lintFile")(function* (o: LintFileOptions) {
  const png = yield* PngFiles
  const options: LintOptions = {
    kind: o.kind,
    ...(o.lower !== undefined && { lower: yield* png.read(o.lower) }),
    ...(o.palette !== undefined && { palette: yield* lintPalette(o.palette) }),
  }
  return lint(yield* png.read(o.texture), options)
})

export const lintCommand = Command.make(
  "lint",
  {
    texture: Argument.String("texture").pipe(Argument.withDescription("16×16 PNG to check")),
    lower: Flag.String("lower").pipe(Flag.optional, Flag.withDescription("lower half; marks TEXTURE as the upper half and checks the seam")),
    kind: Flag.Literals("kind", ["block", "item"]).pipe(Flag.withDefault("block" as const), Flag.withDescription("block (crops, plants) or item")),
    palette: Flag.String("palette").pipe(Flag.optional, Flag.withDescription("family palette every colour must come from")),
    json: flags.json,
  },
  ({ texture, lower, kind, palette, json }) =>
    Effect.gen(function* () {
      const findings = yield* lintFile({ texture, kind, lower: Option.getOrUndefined(lower), palette: Option.getOrUndefined(palette) })
      const fails = failures(findings)
      const warns = findings.filter((f) => f.level === "WARN").length
      if (fails) process.exitCode = 1
      if (json) return yield* printJson({ texture, passed: fails === 0, findings })
      for (const line of findingLines(findings)) yield* Console.log(line)
      yield* Console.log(`${fails ? "FAILED" : "PASSED"}: ${fails} fail, ${warns} warn`)
    }).pipe(
      Effect.catchTag("PngUnreadable", (e) => {
        process.exitCode = 1
        return Console.error(`REFUSED ${e.message}`)
      }),
      refuseSpecErrors(texture, json),
    ),
).pipe(Command.withDescription("check texture size, colours, alpha, noise and seams against vanilla conventions"))
