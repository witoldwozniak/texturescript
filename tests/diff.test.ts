import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { decodePng } from "../src/core/png.ts"
import { hash } from "../src/core/raster.ts"
import { tempDir } from "./helpers.ts"

const root = join(import.meta.dir, "..")
const fixtures = join(root, "tests/fixtures/prototype/diff")
const cli = (...args: string[]) => {
  const r = Bun.spawnSync(["bun", join(root, "src/cli/main.ts"), ...args], { cwd: root })
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() }
}

describe("diff matches the prototype", () => {
  const sheets = JSON.parse(readFileSync(join(fixtures, "sheets.json"), "utf8"))
  for (const name of ["corn-4-5", "corn-upper-7-6", "radish-0-3"]) {
    test(name, () => {
      const sheet = join(tempDir(), "sheet.png")
      const r = cli("diff", join(fixtures, `${name}-rendered.png`), join(fixtures, `${name}-target.png`), "--sheet", sheet)
      expect(r.out.replace(sheet, "SHEET")).toBe(readFileSync(join(fixtures, `${name}.txt`), "utf8"))
      expect(hash(decodePng(readFileSync(sheet)))).toBe(sheets[name])
    })
  }
  test("--check fails on any difference, passes on none", () => {
    const a = join(fixtures, "corn-4-5-rendered.png")
    expect(cli("diff", a, join(fixtures, "corn-4-5-target.png"), "--check").code).toBe(1)
    expect(cli("diff", a, a, "--check").code).toBe(0)
  })
})
