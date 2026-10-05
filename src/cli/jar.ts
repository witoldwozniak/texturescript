import { Console, Effect, Option } from "effect"
import { Command } from "effect/cli"
import { GameJar } from "../services/jar.ts"
import * as flags from "./flags.ts"

export const jarCommand = Command.make("jar", { json: flags.json, jar: flags.jar }, ({ json, jar }) =>
  Effect.gen(function* () {
    const found = yield* (yield* GameJar).find(Option.getOrUndefined(jar))
    yield* Console.log(json ? JSON.stringify({ jar: found }) : found)
  }),
).pipe(Command.withDescription("print the Minecraft client jar TextureScript reads vanilla blocks from"))
