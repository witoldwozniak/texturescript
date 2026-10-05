import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { mkdirSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { GameJar, launcherDirs } from "../src/services/jar.ts"

const find = (jar?: string) => Effect.gen(function* () {
  return yield* (yield* GameJar).find(jar)
})
import { fakeJar, run, tempDir } from "./helpers.ts"

const place = (path: string, bytes: Uint8Array, mtime: number) => {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, bytes)
  utimesSync(path, mtime, mtime)
}

describe("launcherDirs", () => {
  test("covers the official launcher and Prism on each platform", () => {
    expect(launcherDirs({ home: "/h", platform: "linux", env: {} })).toEqual([
      ["official", "/h/.minecraft"],
      ["prism", "/h/.local/share/PrismLauncher"],
      ["prism", "/h/.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher"],
    ])
    expect(launcherDirs({ home: "/h", platform: "linux", env: { XDG_DATA_HOME: "/d" } })[1]).toEqual(["prism", "/d/PrismLauncher"])
    expect(launcherDirs({ home: "/h", platform: "darwin", env: {} })[0]).toEqual(["official", "/h/Library/Application Support/minecraft"])
    expect(launcherDirs({ home: "C:/u", platform: "win32", env: { APPDATA: "C:/a" } })[1]).toEqual(["prism", "C:/a/PrismLauncher"])
  })
})

describe("GameJar.find", () => {
  test("picks the newest jar that has textures, skipping mod-loader stubs", async () => {
    const home = tempDir()
    const old = join(home, ".minecraft/versions/1.0/1.0.jar")
    const stub = join(home, ".minecraft/versions/fabric/fabric.jar")
    const prism = join(home, ".local/share/PrismLauncher/libraries/com/mojang/minecraft/2.0/minecraft-2.0-client.jar")
    place(old, fakeJar(), 1_000)
    place(prism, fakeJar(), 2_000)
    place(stub, fakeJar(false), 3_000)
    expect(await run(find(), home)).toBe(prism)
  })

  test("fails with the folders it searched", async () => {
    const home = tempDir()
    const result = await run(Effect.flip(find()), home)
    expect(result._tag).toBe("JarNotFound")
    expect(result.message).toContain(join(home, ".minecraft"))
  })

  test("uses an explicit jar", async () => {
    const jar = join(tempDir(), "client.jar")
    place(jar, fakeJar(), 1_000)
    expect(await run(find(jar))).toBe(jar)
  })
})
