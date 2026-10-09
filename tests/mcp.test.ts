// texturescript mcp: the tools and the skill, served over stdio.
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { chromium } from "playwright-core"
import { decodePng } from "../src/core/png.ts"
import { SKILL_FILES } from "../src/skill/bundle.ts"
import { mcpClient, tempDir } from "./helpers.ts"

const root = join(import.meta.dir, "..")
const hasChromium = existsSync(chromium.executablePath())
const out = tempDir()
let client: Awaited<ReturnType<typeof mcpClient>>

beforeAll(async () => {
  client = await mcpClient(["bun", join(root, "src/cli/main.ts"), "mcp", "--no-jar"], { cwd: root })
})
afterAll(() => client.close())

const image = (result: any) => decodePng(Buffer.from(result.content.find((c: any) => c.type === "image").data, "base64"))

describe("texturescript mcp", () => {
  test("announces render, lint and shoot, and points at the skill", async () => {
    expect(client.init.serverInfo.name).toBe("texturescript")
    expect(client.init.instructions).toContain("texturescript://skill/SKILL.md")
    const { tools } = await client.request("tools/list")
    expect(tools.map((t: any) => t.name)).toEqual(["render", "lint", "shoot"])
    expect(tools[1].inputSchema.required).toEqual(["texture"])
  })

  test("render writes the files and returns the ×16 preview", async () => {
    const png = join(out, "lower.png")
    const r = await client.call("render", { spec: "skill/examples/crop/mature/lower.grid", out: png })
    expect(r.isError).toBeFalsy()
    expect(r.structuredContent.files).toEqual([png, join(out, "lower_x16.png"), join(out, "lower.txt")])
    expect(image(r).width).toBe(256)
    expect(Buffer.from(r.content[1].data, "base64")).toEqual(readFileSync(join(out, "lower_x16.png")))
  })

  test("render refuses a broken grid with file:line:col", async () => {
    const r = await client.call("render", { spec: "README.md", out: join(out, "x.png") })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toMatch(/^REFUSED README\.md:\d+:/)
  })

  test("lint returns the findings as text and data", async () => {
    await client.call("render", { spec: "skill/examples/crop/mature/upper.grid", out: join(out, "upper.png") })
    const r = await client.call("lint", { texture: join(out, "upper.png"), lower: join(out, "lower.png") })
    expect(r.structuredContent.passed).toBe(true)
    expect(r.structuredContent.findings.map((f: any) => f.rule)).toContain("seam")
    expect(r.content[0].text).toEndWith("PASSED: 0 fail, 0 warn")
  })

  test("bad arguments and missing files come back as tool errors", async () => {
    expect((await client.call("lint", { kind: "item" })).isError).toBe(true)
    const r = await client.call("lint", { texture: join(out, "nope.png") })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toContain("nope.png")
  })

  test("serves every skill file as a resource", async () => {
    const { resources } = await client.request("resources/list")
    expect(resources.map((r: any) => r.uri).sort()).toEqual(Object.keys(SKILL_FILES).map((f) => `texturescript://skill/${f}`).sort())
    const { contents } = await client.request("resources/read", { uri: "texturescript://skill/SKILL.md" })
    expect(contents[0].text).toBe(SKILL_FILES["SKILL.md"]!)
  })

  test.skipIf(!hasChromium)("shoot returns the sheet it wrote", async () => {
    const png = join(out, "shot.png")
    const r = await client.call("shoot", {
      scene: "skill/examples/crop/corn.toml",
      out: png,
      width: 320,
      height: 180,
      cameras: [{ yaw: 30, pitch: 22, distance: 7 }, { yaw: 210, pitch: 25, distance: 9 }],
    })
    expect(r.isError).toBeFalsy()
    expect(r.structuredContent.shots).toHaveLength(2)
    expect(image(r)).toEqual(decodePng(readFileSync(png)))
    expect(image(r).width).toBeGreaterThan(640)
  }, 60_000)
})
