import { Console, Effect, FileSystem, Option, Path } from "effect"
import { Command, Flag } from "effect/cli"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { decodePng } from "../core/png.ts"
import * as R from "../core/raster.ts"
import { specError } from "../core/spec-error.ts"
import { parseManifest, previewOnGrey, toGrid, type ExampleKind } from "../core/togrid.ts"
import { GameJar } from "../services/jar.ts"
import { PngFiles } from "../services/png.ts"
import * as flags from "./flags.ts"
import { printJson, refuseSpecErrors } from "./report.ts"

const KIND_DIR: Record<ExampleKind, string> = { crop: "block", item: "item" }

/** The skill folder of a source checkout; a compiled binary has none on disk. */
export const inRepoSkill = (): string | undefined => {
  const dir = resolve(import.meta.dir, "../../skill")
  return existsSync(`${dir}/SKILL.md`) ? dir : undefined
}

/** Where fetch writes without --skill: the checkout's skill, else ./texturescript-skill. */
export const defaultSkillDir = () => inRepoSkill() ?? "texturescript-skill"

const git = (cwd: string, args: string[], stdin?: string) => {
  const r = Bun.spawnSync(["git", ...args], { cwd, stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin), stdout: "pipe", stderr: "pipe" })
  return { code: r.exitCode, out: r.stdout.toString() }
}

/** Paths git would track: game files must never land there. */
export function trackablePaths(dir: string, paths: ReadonlyArray<string>): string[] {
  if (git(dir, ["rev-parse", "--is-inside-work-tree"]).out.trim() !== "true") return []
  const ignored = new Set(git(dir, ["check-ignore", "--stdin"], paths.join("\n") + "\n").out.split("\n").filter(Boolean))
  return paths.filter((p) => !ignored.has(p))
}

export const fetchCommand = Command.make(
  "fetch",
  {
    jar: flags.jar,
    skill: Flag.String("skill").pipe(Flag.optional, Flag.withDescription("skill folder whose examples/manifest.txt lists the textures")),
    check: Flag.Boolean("check").pipe(Flag.withDefault(false), Flag.withDescription("report missing or changed examples without writing")),
    json: flags.json,
  },
  ({ jar, skill, check, json }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const png = yield* PngFiles
      const dir = path.resolve(Option.getOrElse(skill, defaultSkillDir))
      const manifestPath = path.join(dir, "examples/manifest.txt")
      if (!(yield* fs.exists(manifestPath)))
        return yield* specError(`no example manifest in ${dir}; run 'texturescript skill ${dir}' first or pass --skill`)
      const entries = yield* Effect.fromResult(parseManifest(yield* fs.readFileString(manifestPath)))
      const games = yield* GameJar
      const found = yield* games.find(Option.getOrUndefined(jar))
      const members = new Map(entries.map(([kind, name]) => [`assets/minecraft/textures/${KIND_DIR[kind]}/${name}.png`, [kind, name] as const]))
      const files = yield* games.entries(found, (n) => members.has(n)).pipe(Effect.mapError((e) => specError(e.message)))
      const missing = [...members.keys()].filter((m) => !files[m])
      const outputs = [...members].filter(([m]) => files[m]).map(([m, [kind, name]]) => {
        const image = decodePng(files[m]!)
        const base = path.join(dir, "examples", kind, name)
        return { name, image, grid: Effect.runSync(Effect.fromResult(toGrid(image, name))), png: `${base}.png`, txt: `${base}.txt`, x16: `${base}_x16.png` }
      })

      if (check) {
        const differ: string[] = []
        for (const o of outputs) {
          const problems: string[] = []
          const text = yield* fs.readFileString(o.txt).pipe(Effect.orElseSucceed(() => undefined))
          if (text !== o.grid) problems.push(o.txt)
          for (const [file, want] of [[o.png, o.image], [o.x16, previewOnGrey(o.image)]] as const) {
            const got = yield* png.read(file).pipe(Effect.orElseSucceed(() => undefined))
            if (!got || !R.equals(got, want)) problems.push(file)
          }
          if (problems.length) differ.push(problems.join(", "))
        }
        if (missing.length || differ.length) process.exitCode = 1
        if (json) return yield* printJson({ jar: found, missing, differ, match: outputs.length - differ.length })
        yield* Console.log(`jar: ${found}`)
        if (missing.length) yield* Console.log(["not in jar:", ...missing].join("\n  "))
        yield* Console.log(`${outputs.length - differ.length} examples match, ${differ.length} differ or absent`)
        for (const d of differ) yield* Console.log(`   ${d}`)
        return
      }

      // Game textures go only where git ignores them.
      const tracked = trackablePaths(dir, outputs.flatMap((o) => [o.png, o.txt, o.x16]).map((p) => path.relative(dir, p)))
      if (tracked.length)
        return yield* specError(`refusing to write game textures where git would track them: ${tracked.slice(0, 3).join(", ")}${tracked.length > 3 ? " …" : ""}; add them to .gitignore or use --skill outside the repository`)
      for (const o of outputs) {
        yield* png.write(o.png, o.image)
        yield* fs.writeFileString(o.txt, o.grid)
        yield* png.write(o.x16, previewOnGrey(o.image))
      }
      if (missing.length) process.exitCode = 1
      if (json) return yield* printJson({ jar: found, missing, written: outputs.length, into: path.join(dir, "examples") })
      yield* Console.log(`jar: ${found}`)
      if (missing.length) yield* Console.log(["not in jar:", ...missing].join("\n  "))
      yield* Console.log(`wrote ${outputs.length} examples into ${path.join(dir, "examples")}`)
    }).pipe(
      Effect.catchTag("JarNotFound", (e) => {
        process.exitCode = 1
        return Console.error(`REFUSED ${e.message}`)
      }),
      refuseSpecErrors(undefined, json),
    ),
).pipe(Command.withDescription("extract the skill's vanilla reference examples from your own client jar"))

