// togrid and fetch: vanilla references for authoring, kept out of git.
import { describe, expect, test } from "bun:test"
import { Result } from "effect"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseGrid, renderGrid } from "../src/core/grid.ts"
import { decodePng, encodePng } from "../src/core/png.ts"
import * as R from "../src/core/raster.ts"
import { parseManifest, toGrid } from "../src/core/togrid.ts"
import { zipSync } from "fflate"
import { tempDir } from "./helpers.ts"

const root = join(import.meta.dir, "..")

/** An authored 16×16 texture in four shades, with transparent corners. */
function plant(seed: number): R.Raster {
  const image = R.make(16, 16)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if ((x + y) % 7) R.set(image, x, y, [40 + 50 * ((x * y + seed) % 4), 120, 30, 255])
  return image
}
const cli = (cwd: string, ...args: string[]) => {
  const r = Bun.spawnSync(["bun", join(root, "src/cli/main.ts"), ...args], { cwd })
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() }
}

describe("togrid", () => {
  test("round-trips through grid, letters darkest first", () => {
    const image = R.make(4, 1)
    R.set(image, 0, 0, [250, 250, 250, 255])
    R.set(image, 1, 0, [10, 10, 10, 255])
    R.set(image, 3, 0, [100, 100, 100, 200])
    const text = Result.getOrThrow(toGrid(image, "x"))
    expect(text).toBe("# x: letters are shades darkest->lightest\npalette\n. transparent\na #0a0a0a\nb #646464\nc #fafafa\ngrid\nca.b\n")
    const back = renderGrid(Result.getOrThrow(parseGrid(text)))
    R.set(image, 3, 0, [100, 100, 100, 255]) // alpha 200 counts as opaque
    expect(R.equals(back, image)).toBe(true)
  })
  test("the CLI writes the grid", () => {
    const dir = tempDir()
    writeFileSync(join(dir, "t.png"), encodePng(plant(1)))
    expect(cli(dir, "togrid", "t.png", "out/t.grid").code).toBe(0)
    expect(R.equals(renderGrid(Result.getOrThrow(parseGrid(readFileSync(join(dir, "out/t.grid"), "utf8")))), plant(1))).toBe(true)
  })
})

test("parseManifest", () => {
  expect(Result.getOrThrow(parseManifest("# c\ncrop wheat_stage0\nitem carrot  # x\n"))).toEqual([["crop", "wheat_stage0"], ["item", "carrot"]])
  const bad = parseManifest("block stone\n")
  expect(Result.isFailure(bad) && bad.failure.message).toBe(`1: expected 'crop NAME' or 'item NAME', got "block stone"`)
})

describe("fetch", () => {
  const setup = (git: boolean, ignore?: string) => {
    const dir = tempDir()
    const jar = join(dir, "client.jar")
    writeFileSync(jar, zipSync({ "net/minecraft/Main.class": new Uint8Array([0xca, 0xfe]), "assets/minecraft/textures/block/test_stage0.png": encodePng(plant(2)) }))
    mkdirSync(join(dir, "skill/examples"), { recursive: true })
    writeFileSync(join(dir, "skill/examples/manifest.txt"), "crop test_stage0\ncrop not_there\n")
    if (git) Bun.spawnSync(["git", "init", "-q", dir])
    if (ignore) writeFileSync(join(dir, ".gitignore"), ignore)
    return { dir, jar }
  }

  test("writes PNG, grid and ×16 preview, and --check confirms them", () => {
    const { dir, jar } = setup(false)
    const r = cli(dir, "fetch", "--jar", jar, "--skill", "skill", "--json")
    expect(JSON.parse(r.out)).toMatchObject({ written: 1, missing: ["assets/minecraft/textures/block/not_there.png"] })
    expect(r.code).toBe(1) // something listed was not in the jar
    expect(R.equals(decodePng(readFileSync(join(dir, "skill/examples/crop/test_stage0.png"))), plant(2))).toBe(true)
    expect(decodePng(readFileSync(join(dir, "skill/examples/crop/test_stage0_x16.png"))).width).toBe(256)
    writeFileSync(join(dir, "skill/examples/manifest.txt"), "crop test_stage0\n")
    expect(cli(dir, "fetch", "--jar", jar, "--skill", "skill", "--check").out).toContain("1 examples match, 0 differ or absent")
  })

  test("refuses to write where git would track the files", () => {
    const { dir, jar } = setup(true)
    const r = cli(dir, "fetch", "--jar", jar, "--skill", "skill")
    expect(r.code).toBe(1)
    expect(r.err).toContain("refusing to write game textures where git would track them: examples/crop/test_stage0.png")
  })

  test("writes into ignored paths, and the commit check stays clean", () => {
    const { dir, jar } = setup(true, "skill/examples/*/*.png\nskill/examples/*/*.txt\n")
    expect(cli(dir, "fetch", "--jar", jar, "--skill", "skill").out).toContain("wrote 1 examples")
    Bun.spawnSync(["git", "add", "-A"], { cwd: dir })
    const check = Bun.spawnSync(["bun", resolve(root, "scripts/check-no-vanilla.ts"), "--tree", "--jar", jar], { cwd: dir, env: { ...process.env, XDG_CACHE_HOME: join(dir, ".cache") } })
    expect(check.exitCode).toBe(0)
    expect(check.stdout.toString()).toContain("tree files clean")
  })
})
