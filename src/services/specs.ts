// Reading spec files: each parse error comes back located in the file it came from.
import { Effect, FileSystem, Result } from "effect"
import { parseGrid } from "../core/grid.ts"
import { parsePalette } from "../core/palette.ts"
import { inFile, specError, type SpecError } from "../core/spec-error.ts"

const located = <A>(path: string, parse: (text: string) => Result.Result<A, SpecError>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const text = yield* fs.readFileString(path).pipe(Effect.mapError((e) => inFile(specError(`cannot read: ${e.message}`), path)))
    return yield* Effect.fromResult(parse(text)).pipe(Effect.mapError((e) => inFile(e, path)))
  })

export const readGrid = (path: string) => located(path, parseGrid)
export const readPalette = (path: string) => located(path, parsePalette)
