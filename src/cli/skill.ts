import { Console, Effect, FileSystem, Option, Path } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { specError } from "../core/spec-error.ts"
import { SKILL_FILES } from "../skill/bundle.ts"
import { inRepoSkill } from "./fetch.ts"
import * as flags from "./flags.ts"
import { printJson, refuseSpecErrors } from "./report.ts"

export const skillCommand = Command.make(
  "skill",
  {
    out: Argument.String("out-dir").pipe(Argument.optional, Argument.withDescription("folder to export the skill into")),
    force: Flag.Boolean("force").pipe(Flag.withDefault(false), Flag.withDescription("overwrite skill files already there")),
    json: flags.json,
  },
  ({ out, force, json }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      if (Option.isNone(out)) {
        const dir = inRepoSkill()
        if (json) return yield* printJson({ skill: dir ?? null, files: Object.keys(SKILL_FILES) })
        return yield* Console.log(dir ?? "the skill is built into this binary; export it with: texturescript skill OUT_DIR")
      }
      const dir = path.resolve(out.value)
      const targets = Object.entries(SKILL_FILES).map(([name, text]) => [path.join(dir, name), text] as const)
      if (!force) {
        const existing: string[] = []
        for (const [file] of targets) if (yield* fs.exists(file)) existing.push(path.relative(dir, file))
        if (existing.length)
          return yield* specError(`${dir} already has ${existing.slice(0, 3).join(", ")}${existing.length > 3 ? " …" : ""}; pass --force to overwrite`)
      }
      for (const [file, text] of targets) {
        yield* fs.makeDirectory(path.dirname(file), { recursive: true })
        yield* fs.writeFileString(file, text)
      }
      if (json) return yield* printJson({ skill: dir, files: Object.keys(SKILL_FILES) })
      yield* Console.log(`wrote the skill to ${dir}`)
      yield* Console.log(`vanilla examples, from your own jar: texturescript fetch --skill ${dir}`)
    }).pipe(refuseSpecErrors(undefined, json)),
).pipe(Command.withDescription("print where the authoring skill is, or export it to a folder (without game textures)"))
