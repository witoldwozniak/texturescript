import { describe, expect, test } from "bun:test"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { decodePng } from "../src/core/png.ts"
import { tempDir } from "./helpers.ts"

const root = join(import.meta.dir, "..")
const cli = (...args: string[]) => {
  const r = Bun.spawnSync(["bun", join(root, "src/cli/main.ts"), ...args], { cwd: root })
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() }
}

describe("texturescript grid", () => {
  test("writes the PNG, a ×16 preview and the ASCII grid", () => {
    const out = join(tempDir(), "deep/lower.png")
    const r = cli("grid", "skill/examples/crop/mature/lower.grid", out, "--json")
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out).files).toEqual([out, out.replace(".png", "_x16.png"), out.replace(".png", ".txt")])
    expect(decodePng(readFileSync(out.replace(".png", "_x16.png"))).width).toBe(256)
  })

  test("refuses a broken grid with file:line:col and exit 1", () => {
    const bad = join(tempDir(), "bad.grid")
    writeFileSync(bad, "palette\n. transparent\ngrid\n.x\n")
    const r = cli("grid", bad, join(tempDir(), "x.png"))
    expect(r.code).toBe(1)
    expect(r.err.trim()).toBe(`REFUSED ${bad}:4:2: character "x" is not in the palette`)
  })
})

describe("texturescript palette", () => {
  test("prints the section and, with --json, the shades", () => {
    const r = cli("palette", "skill/palettes/corn.palette", "--json")
    expect(r.code).toBe(0)
    const { materials } = JSON.parse(r.out)
    expect(materials[0]).toMatchObject({ name: "leaf", keys: "abcd", hexes: ["#266325", "#347a2a", "#43922d", "#55ab2d"] })
  })
})
