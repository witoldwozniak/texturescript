// The compiled binary on its own: an empty home, no checkout, only what is built in.
import { beforeAll, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright-core"
import { decodePng } from "../src/core/png.ts"
import { tempDir } from "./helpers.ts"

const root = join(import.meta.dir, "..")
const work = tempDir()
const bin = join(work, "texturescript")
const home = join(work, "home")
const hasChromium = existsSync(chromium.executablePath())

const run = (cwd: string, ...args: string[]) => {
  const r = Bun.spawnSync([bin, ...args], {
    cwd,
    env: { PATH: process.env.PATH ?? "", HOME: home, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), ".cache/ms-playwright") },
  })
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() }
}

beforeAll(() => {
  mkdirSync(home)
  const r = Bun.spawnSync(["bun", "scripts/build.ts"], { cwd: root, env: { ...process.env, TEXTURESCRIPT_OUT: bin } })
  expect(r.stderr.toString()).toBe("")
}, 60_000)

test("exports the skill and runs the corn quick start", () => {
  expect(run(work, "skill").out).toContain("built into this binary")
  expect(run(work, "skill", "skill").code).toBe(0)
  const crop = join(work, "skill/examples/crop")
  expect(run(crop, "stages", "corn.stages", "out").code).toBe(0)
  expect(existsSync(join(crop, "out/strip.png"))).toBe(true)
  const fetch = run(work, "fetch", "--skill", "skill")
  expect(fetch.code).toBe(1)
  expect(fetch.err).toContain("REFUSED") // no launcher in this home: no jar, nothing written
})

test.skipIf(!hasChromium)("shoots the corn scene with the built-in viewer", () => {
  const crop = join(work, "skill/examples/crop")
  const r = run(crop, "shoot", "corn.toml", "shot.png", "--size", "320x180", "--no-jar")
  expect(r.code).toBe(0)
  expect(decodePng(readFileSync(join(crop, "shot.png"))).width).toBe(320)
}, 60_000)
