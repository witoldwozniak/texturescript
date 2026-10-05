#!/usr/bin/env bun
// Pre-commit check: refuses Minecraft game files (copies, re-encodes, upscales, model JSON).
// Usage: bun scripts/check-no-vanilla.ts [--staged | --tree | --history] [--jar CLIENT.jar]
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Console, Effect, Layer, Option } from "effect"
import { Command, Flag } from "effect/cli"
import * as flags from "../src/cli/flags.ts"
import { check, type Scope } from "../src/guard/check.ts"
import * as Jar from "../src/services/jar.ts"

const scopeFlag = (name: Scope, description: string) =>
  Flag.Boolean(name).pipe(Flag.withDefault(false), Flag.withDescription(description))

const command = Command.make(
  "check-no-vanilla",
  {
    staged: scopeFlag("staged", "check files staged for commit (default)"),
    tree: scopeFlag("tree", "check every tracked file"),
    history: scopeFlag("history", "check every blob in the repository's history"),
    jar: flags.jar,
  },
  (opts) => {
    const scope: Scope = opts.history ? "history" : opts.tree ? "tree" : "staged"
    return check(scope, Option.getOrUndefined(opts.jar)).pipe(
      Effect.flatMap(({ jar, checked, hits }) => {
        if (hits.length === 0) return Console.log(`check-no-vanilla: ${checked} ${scope} files clean against ${jar.split("/").pop()}`)
        process.exitCode = 1
        return Console.error(`Minecraft game files found:\n${hits.map(([file, game]) => `  ${file} == ${game}`).join("\n")}`)
      }),
      Effect.catchTag("JarNotFound", (e) => Console.error(`check-no-vanilla: ${e.message}; skipped`)),
    )
  },
).pipe(Command.withDescription("Refuse Minecraft game files in git."))

Command.run(command, { version: "0" }).pipe(
  Effect.provide(Jar.layer.pipe(Layer.provideMerge(BunServices.layer))),
  BunRuntime.runMain,
)
