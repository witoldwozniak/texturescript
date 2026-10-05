// Finds the Minecraft client jar on this machine and reads entries from it into memory.
import { Context, Effect, FileSystem, Layer, Option, Path, Schema } from "effect"
import { unzipSync } from "fflate"
import { homedir } from "node:os"

export class JarNotFound extends Schema.TaggedError<JarNotFound>()("JarNotFound", {
  searched: Schema.Array(Schema.String),
}) {
  override get message() {
    return `no Minecraft client jar in ${this.searched.join(", ")}; pass --jar`
  }
}

export class JarUnreadable extends Schema.TaggedError<JarUnreadable>()("JarUnreadable", {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `cannot read ${this.path}: ${this.reason}`
  }
}

export type Launcher = "official" | "prism"

export interface Environment {
  readonly home: string
  readonly platform: string
  readonly env: Readonly<Record<string, string | undefined>>
}

/** Default data folders of the official launcher and Prism Launcher. */
export function launcherDirs({ home, platform, env }: Environment): ReadonlyArray<readonly [Launcher, string]> {
  if (platform === "win32") {
    const appdata = env.APPDATA || `${home}/AppData/Roaming`
    return [
      ["official", `${appdata}/.minecraft`],
      ["prism", `${appdata}/PrismLauncher`],
      ["prism", `${home}/scoop/persist/prismlauncher`],
    ]
  }
  if (platform === "darwin") {
    const support = `${home}/Library/Application Support`
    return [["official", `${support}/minecraft`], ["prism", `${support}/PrismLauncher`]]
  }
  const data = env.XDG_DATA_HOME || `${home}/.local/share`
  return [
    ["official", `${home}/.minecraft`],
    ["prism", `${data}/PrismLauncher`],
    ["prism", `${home}/.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher`],
  ]
}

/** Reads the entries whose names pass `keep`, without inflating the rest. */
export function unzipEntries(bytes: Uint8Array, keep: (name: string) => boolean): Record<string, Uint8Array> {
  return unzipSync(bytes, { filter: (file) => keep(file.name) })
}

export class GameJar extends Context.Service<GameJar, {
  /** The jar to use: `override` if given, else the most recently downloaded client jar. */
  readonly find: (override?: string) => Effect.Effect<string, JarNotFound>
  readonly entries: (jar: string, keep: (name: string) => boolean) => Effect.Effect<Record<string, Uint8Array>, JarUnreadable>
}>()("texturescript/GameJar") {}

export const makeGameJar = (environment: Environment) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dirs = launcherDirs(environment)

    const list = (dir: string) => fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => [] as string[]))
    const isFile = (p: string) =>
      fs.stat(p).pipe(Effect.map((s) => s.type === "File"), Effect.orElseSucceed(() => false))

    const clientJars = Effect.fn(function* (launcher: Launcher, folder: string) {
      const found: string[] = []
      if (launcher === "prism") {
        const root = path.join(folder, "libraries/com/mojang/minecraft")
        for (const version of yield* list(root)) {
          const jar = path.join(root, version, `minecraft-${version}-client.jar`)
          if (yield* isFile(jar)) found.push(jar)
        }
      } else {
        const root = path.join(folder, "versions")
        for (const version of yield* list(root)) {
          const jar = path.join(root, version, `${version}.jar`)
          if (yield* isFile(jar)) found.push(jar)
        }
      }
      return found
    })

    const mtime = (p: string) =>
      fs.stat(p).pipe(Effect.map((s) => Option.getOrElse(s.mtime, () => new Date(0)).getTime()), Effect.orElseSucceed(() => 0))

    const entries = (jar: string, keep: (name: string) => boolean) =>
      fs.readFile(jar).pipe(
        Effect.flatMap((bytes) => Effect.try({ try: () => unzipEntries(bytes, keep), catch: (e) => e })),
        Effect.mapError((e) => new JarUnreadable({ path: jar, reason: e instanceof Error ? e.message : String(e) })),
      )

    const containsTextures = (jar: string) =>
      fs.readFile(jar).pipe(
        Effect.map((bytes) => {
          let found = false
          try {
            unzipSync(bytes, {
              filter: (f) => {
                if (f.name.startsWith("assets/minecraft/textures/")) found = true
                return false
              },
            })
          } catch {
            return false
          }
          return found
        }),
        Effect.orElseSucceed(() => false),
      )

    const find = (override?: string) =>
      Effect.gen(function* () {
        if (override !== undefined) {
          if (yield* isFile(override)) return override
          return yield* new JarNotFound({ searched: [override] })
        }
        const jars: Array<readonly [string, number]> = []
        for (const [launcher, folder] of dirs) {
          for (const jar of yield* clientJars(launcher, folder)) jars.push([jar, yield* mtime(jar)])
        }
        jars.sort((a, b) => b[1] - a[1])
        for (const [jar] of jars) {
          if (yield* containsTextures(jar)) return jar
        }
        return yield* new JarNotFound({ searched: dirs.map(([, folder]) => folder) })
      })

    return GameJar.of({ find, entries })
  })

export const layer = Layer.effect(
  GameJar,
  makeGameJar({ home: homedir(), platform: process.platform, env: process.env }),
)
