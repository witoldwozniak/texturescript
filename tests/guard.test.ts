import { describe, expect, test } from "bun:test"
import { unzipSync } from "fflate"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { encodePng } from "../src/core/png.ts"
import { buildIndex, match } from "../src/guard/check.ts"
import { crop } from "../src/guard/fingerprint.ts"
import { fakeJar, model, tempDir, texture, upscale } from "./helpers.ts"

const index = buildIndex(unzipSync(fakeJar()))
const json = (v: unknown, indent?: number) => new TextEncoder().encode(JSON.stringify(v, null, indent))

describe("match", () => {
  test("finds copies, re-encodes and integer upscales", () => {
    expect(match("a.png", encodePng(texture(1)), index)).toBe("assets/minecraft/textures/block/test_stage0.png")
    expect(match("a.png", encodePng(upscale(texture(1), 16)), index)).toBe("assets/minecraft/textures/block/test_stage0.png")
    expect(match("a.png", encodePng(upscale(texture(1), 3)), index)).toBe("assets/minecraft/textures/block/test_stage0.png")
  })

  test("finds the first frame of an animated texture", () => {
    const frame = crop(texture(2, 16, 64), 16, 16)
    expect(match("a.png", encodePng(upscale(frame, 4)), index)).toBe("assets/minecraft/textures/block/test_flow.png")
  })

  test("finds model JSON regardless of formatting and key order", () => {
    const reordered = { textures: model.textures, parent: model.parent }
    expect(match("m.json", json(reordered, 4), index)).toBe("assets/minecraft/models/block/test_stage0.json")
  })

  test("passes authored files", () => {
    expect(match("a.png", encodePng(texture(9)), index)).toBeUndefined()
    expect(match("m.json", json({ parent: "minecraft:block/cross" }), index)).toBeUndefined()
    expect(match("x.png", new Uint8Array([1, 2, 3]), index)).toBeUndefined()
  })
})

describe("pre-commit check", () => {
  const script = resolve(import.meta.dir, "../scripts/check-no-vanilla.ts")
  const repo = () => {
    const dir = tempDir()
    Bun.spawnSync(["git", "init", "-q", dir])
    const jar = join(dir, "..", `${dir.split("/").pop()}.jar`)
    writeFileSync(jar, fakeJar())
    return { dir, jar }
  }
  const stageAndCheck = (dir: string, jar: string, files: Record<string, Uint8Array>) => {
    for (const [name, bytes] of Object.entries(files)) {
      mkdirSync(join(dir, name, ".."), { recursive: true })
      writeFileSync(join(dir, name), bytes)
    }
    Bun.spawnSync(["git", "add", "-A"], { cwd: dir })
    return Bun.spawnSync(["bun", script, "--staged", "--jar", jar], { cwd: dir, env: { ...process.env, XDG_CACHE_HOME: join(dir, ".cache-test") } })
  }

  test("refuses a staged upscale of a game texture", () => {
    const { dir, jar } = repo()
    const r = stageAndCheck(dir, jar, { "art/up.png": encodePng(upscale(texture(1), 16)), "art/mine.png": encodePng(texture(5)) })
    expect(r.exitCode).toBe(1)
    expect(r.stderr.toString()).toContain("art/up.png == assets/minecraft/textures/block/test_stage0.png")
    expect(r.stderr.toString()).not.toContain("mine.png")
  })

  test("passes authored files", () => {
    const { dir, jar } = repo()
    const r = stageAndCheck(dir, jar, { "art/mine.png": encodePng(texture(5)), "scene.json": json({ a: 1 }) })
    expect(r.exitCode).toBe(0)
    expect(r.stdout.toString()).toContain("2 staged files clean")
  })
})
