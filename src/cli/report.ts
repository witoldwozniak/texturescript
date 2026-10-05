// How commands report results and refusals.
import { Console, Effect } from "effect"
import { SpecError, inFile } from "../core/spec-error.ts"

/** Prints a SpecError as `file:line:col: reason` (or JSON) and exits 1. */
export const refuseSpecErrors = (file: string, json: boolean) =>
  <A, E, R>(effect: Effect.Effect<A, E | SpecError, R>) =>
    effect.pipe(
      Effect.catchIf(
        (e): e is SpecError => e instanceof SpecError,
        (e) => {
          process.exitCode = 1
          const located = inFile(e, file)
          return json
            ? Console.log(JSON.stringify({ refused: { file: located.file, line: located.at?.line, column: located.at?.column, reason: located.reason, message: located.message } }))
            : Console.error(`REFUSED ${located.message}`)
        },
      ),
    )

export const printJson = (value: unknown) => Console.log(JSON.stringify(value, null, 2))
