// The embedded skill: complete, exportable, and usable on its own.
import { expect, test } from "bun:test"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { SKILL_FILES } from "../src/skill/bundle.ts"
import { tempDir } from "./helpers.ts"

const root = join(import.meta.dir, "..")
const cli = (cwd: string, ...args: string[]) => {
  const r = Bun.spawnSync(["bun", join(root, "src/cli/main.ts"), ...args], { cwd })
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() }
}

test("the bundle embeds every authored skill file, and nothing fetched", () => {
  const git = Bun.spawnSync(["git", "ls-files", "--cached", "--others", "--exclude-standard", "skill"], { cwd: root })
  const onDisk = git.stdout.toString().split("\n").filter(Boolean).map((p) => p.slice("skill/".length))
  expect(Object.keys(SKILL_FILES).sort()).toEqual(onDisk.sort())
  for (const [name, text] of Object.entries(SKILL_FILES)) expect(text).toBe(readFileSync(join(root, "skill", name), "utf8"))
})

test("skill exports, refuses to overwrite, and --force does", () => {
  const dir = join(tempDir(), "skill")
  expect(cli(root, "skill", dir).code).toBe(0)
  expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toBe(SKILL_FILES["SKILL.md"]!)
  writeFileSync(join(dir, "glossary.md"), "edited")
  const again = cli(root, "skill", dir)
  expect(again.code).toBe(1)
  expect(again.err).toContain("already has SKILL.md, glossary.md")
  expect(cli(root, "skill", dir, "--force").code).toBe(0)
  expect(readFileSync(join(dir, "glossary.md"), "utf8")).toBe(SKILL_FILES["glossary.md"]!)
})

test("the exported corn example generates its stages", () => {
  const dir = join(tempDir(), "skill")
  cli(root, "skill", dir)
  const crop = join(dir, "examples/crop")
  const r = cli(crop, "stages", "corn.stages", "out")
  expect(r.code).toBe(0)
  expect(existsSync(join(crop, "out/stage7/upper.png"))).toBe(true)
  expect(existsSync(join(crop, "out/strip.png"))).toBe(true)
})
