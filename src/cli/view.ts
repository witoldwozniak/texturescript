import { Console, Effect, Layer, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import * as Vanilla from "../services/vanilla.ts"
import { serveScene } from "../services/live.ts"
import * as flags from "./flags.ts"

const opener = process.platform === "darwin" ? ["open"] : process.platform === "win32" ? ["cmd", "/c", "start", ""] : ["xdg-open"]

/** The game jar when there is one; scenes of authored blocks work without it. */
export const vanillaLayer = (jar: Option.Option<string>, noJar: boolean) =>
  noJar
    ? Vanilla.none
    : Layer.catchCause(Vanilla.live(Option.getOrUndefined(jar)), () =>
        Layer.effectDiscard(Console.error("no Minecraft client jar found; vanilla blocks are skipped (--jar to choose one)")).pipe(Layer.provideMerge(Vanilla.none)),
      )

export const viewCommand = Command.make(
  "view",
  {
    scene: Argument.String("scene").pipe(Argument.withDescription("scene file (.toml)")),
    port: Flag.Int("port").pipe(Flag.withDefault(8765), Flag.withDescription("port to serve on (another is used if it is taken)")),
    noOpen: Flag.Boolean("no-open").pipe(Flag.withDefault(false), Flag.withDescription("do not open a browser")),
    jar: flags.jar,
    noJar: Flag.Boolean("no-jar").pipe(Flag.withDefault(false), Flag.withDescription("show only authored blocks")),
  },
  ({ scene, port, noOpen, jar, noJar }) =>
    Effect.scoped(
      Effect.gen(function* () {
        const { url } = yield* serveScene(scene, { port })
        yield* Console.log(`viewing ${scene} at ${url} (Ctrl-C to stop)`)
        if (!noOpen) Bun.spawn([...opener, url], { stdout: "ignore", stderr: "ignore" })
        return yield* Effect.never
      }),
    ).pipe(Effect.provide(vanillaLayer(jar, noJar))),
).pipe(Command.withDescription("open a live 3D view of a scene; it updates when you save"))
