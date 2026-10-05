// sheet and shoot: the commands for looking at results.
import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { chromium } from "playwright-core"
import { decodePng, encodePng } from "../src/core/png.ts"
import { contactSheet } from "../src/core/sheet.ts"
import { tempDir, texture } from "./helpers.ts"

const root = join(import.meta.dir, "..")
const cli = (...args: string[]) => {
  const r = Bun.spawnSync(["bun", join(root, "src/cli/main.ts"), ...args], { cwd: root })
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() }
}
const hasChromium = existsSync(chromium.executablePath())

describe("sheet", () => {
  test("lays tiles out with borders and caption rows", () => {
    const { image, captions } = contactSheet([{ name: "a", image: texture(1) }, { name: "b".repeat(30), image: texture(2) }], { scale: 2, cols: 1 })
    expect([image.width, image.height]).toEqual([32 + 12, 2 * (32 + 16 + 12)])
    expect(captions).toEqual([{ text: "a", x: 6, y: 40 }, { text: "b".repeat(22), x: 6, y: 100 }])
  })
  test("--no-labels works without a browser", () => {
    const dir = tempDir()
    for (const n of [1, 2, 3]) writeFileSync(join(dir, `t${n}.png`), encodePng(texture(n)))
    const out = join(dir, "sheet.png")
    expect(cli("sheet", out, dir, "--no-labels", "--cols", "2").out.trim()).toBe(`${out}: 3 tiles, 408x408`)
  })
  test.skipIf(!hasChromium)("captions are drawn by the browser", () => {
    const dir = tempDir()
    writeFileSync(join(dir, "t.png"), encodePng(texture(1)))
    const out = join(dir, "sheet.png")
    expect(cli("sheet", out, join(dir, "t.png")).code).toBe(0)
    const labelled = decodePng(readFileSync(out))
    expect([labelled.width, labelled.height]).toEqual([8 * 204, 220]) // eight columns, as in the prototype
    const captionRow = labelled.data.subarray(labelled.width * 4 * 200, labelled.width * 4 * 214)
    expect(captionRow.some((v, i) => i % 4 === 0 && v > 150)).toBe(true) // light text on the dark sheet
  })
})

describe.skipIf(!hasChromium)("shoot", () => {
  test("four cameras × two variants from one browser launch", () => {
    const dir = tempDir()
    for (const f of ["corn.stages", "corn.palette", "mature/lower.grid", "mature/upper.grid"]) {
      mkdirSync(join(dir, f, ".."), { recursive: true })
      writeFileSync(join(dir, f), readFileSync(join(root, "skill/examples/crop", f)))
    }
    writeFileSync(join(dir, "scene.toml"), `[[plot]]\nstages = { a = "corn.stages", b = "corn.stages" }\nages = [3, 7]\n`)
    const out = join(dir, "shots.png")
    const cams = ["30,22,7", "120,15,5", "210,30,6", "0,60,9"].flatMap((c) => ["--cam", c])
    const r = cli("shoot", join(dir, "scene.toml"), out, ...cams, "--size", "320x180", "--no-jar", "--json")
    expect(r.code).toBe(0)
    const result = JSON.parse(r.out)
    expect(result.shots).toHaveLength(8)
    expect(result.files).toEqual([out])
    const sheet = decodePng(readFileSync(out))
    expect([sheet.width, sheet.height]).toEqual([4 * (320 + 12), 2 * (180 + 16 + 12)])
  })
})
