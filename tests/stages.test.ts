import { describe, expect, test } from "bun:test"
import { Result } from "effect"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { decodePng } from "../src/core/png.ts"
import { hash } from "../src/core/raster.ts"
import { parseStages, shellWords } from "../src/core/stages.ts"
import { tempDir } from "./helpers.ts"

const root = join(import.meta.dir, "..")
const cli = (...args: string[]) => {
  const r = Bun.spawnSync(["bun", join(root, "src/cli/main.ts"), ...args], { cwd: root })
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() }
}

describe("stages match the prototype", () => {
  for (const [name, spec] of [["corn", "skill/examples/crop/corn.stages"], ["radish", "tests/fixtures/radish/radish.stages"]] as const) {
    test(name, () => {
      const expected = JSON.parse(readFileSync(join(root, `tests/fixtures/prototype/stages/${name}.json`), "utf8"))
      const out = tempDir()
      const r = cli("stages", spec, out)
      expect(r.code).toBe(0)
      expect(r.out.replaceAll(out, "OUT")).toBe(expected.log)
      const files: Record<string, string> = {}
      for (const f of (readdirSync(out, { recursive: true }) as string[]).sort()) {
        if (f === "strip.png" || !f.includes("/")) continue
        const bytes = readFileSync(join(out, f))
        files[f] = f.endsWith(".png") ? `pixels:${hash(decodePng(bytes))}` : bytes.toString()
      }
      expect(files).toEqual(expected.files)
    })
  }
})

describe("parseStages", () => {
  const map = (digit = "0") => `map lower\n${`${digit.repeat(16)}\n`.repeat(16)}`
  const refuse = (text: string) => {
    const r = parseStages(text)
    if (Result.isSuccess(r)) throw new Error("parsed")
    return r.failure.message
  }
  test("reads directives, comments and quoted paths", () => {
    const spec = Result.getOrThrow(parseStages(`# corn\npalette "my palette.palette"\ngrid lower a.grid  # mature\nstages 3\nshift 0 +2\nrecolour 1 e c\n${map()}`))
    expect(spec.palette).toBe("my palette.palette")
    expect(spec.grids).toEqual({ lower: "a.grid" })
    expect([...spec.shift]).toEqual([[0, 2]])
    expect(spec.recolour).toEqual([[1, "e", "c"]])
    expect(spec.maps.lower!.rows).toHaveLength(16)
  })
  test("refuses with locations", () => {
    expect(refuse(`grid lower a.grid\nstages 2\n${map("5")}`)).toBe("4:1: map lower: stage 5 outside 0..1")
    expect(refuse("grid lower a.grid\nmap lower\n.....\n")).toBe("3: map rows must contain 16 dots or ASCII stage digits")
    expect(refuse("grid middle a.grid\n")).toBe("1: half must be lower or upper")
    expect(refuse(`grid lower a.grid\nshift 0 +1\n${map()}`)).toBe("shade shifts require a family palette")
    expect(refuse(`grid lower a.grid\ngrid upper b.grid\n${map()}`)).toBe("each grid needs exactly one matching map")
    expect(refuse(`grid lower a.grid\nstages 11\n${map()}`)).toBe("stages must be between 1 and 10 (maps use single digits)")
    expect(refuse("bogus directive\n")).toBe("1: unexpected directive: bogus directive")
  })
  test("shell-style words", () => {
    expect(Result.getOrThrow(shellWords(`grid lower "a b.grid" # c`))).toEqual(["grid", "lower", "a b.grid"])
    expect(Result.getOrThrow(shellWords(`a#b c`))).toEqual(["a#b", "c"])
    expect(Result.isFailure(shellWords(`"open`))).toBe(true)
  })
})

describe("texturescript stages", () => {
  const copyCorn = () => {
    const dir = tempDir()
    for (const f of ["corn.stages", "corn.palette", "mature/lower.grid", "mature/upper.grid"]) {
      mkdirSync(join(dir, f, ".."), { recursive: true })
      writeFileSync(join(dir, f), readFileSync(join(root, "skill/examples/crop", f)))
    }
    return dir
  }

  test("--keep renders a hand-edited stage grid instead of generating it", () => {
    const dir = copyCorn()
    const out = join(dir, "out")
    expect(cli("stages", join(dir, "corn.stages"), out).code).toBe(0)
    const grid = join(out, "stage3/lower.grid")
    const edited = readFileSync(grid, "utf8").replace(/\n\.\.\.\.\.\.\.\.\.\.\.\.\.\.\.\.\n/, "\n...a............\n")
    writeFileSync(grid, edited)
    expect(cli("stages", join(dir, "corn.stages"), out, "--keep").code).toBe(0)
    expect(readFileSync(grid, "utf8")).toBe(edited)
    expect(readFileSync(join(out, "stage3/lower.txt"), "utf8")).toContain("...a............")
  })

  test("refuses stale outputs from a larger run", () => {
    const dir = copyCorn()
    const out = join(dir, "out")
    cli("stages", join(dir, "corn.stages"), out)
    writeFileSync(join(dir, "corn.stages"), readFileSync(join(dir, "corn.stages"), "utf8").replace("stages 8", "stages 8\n").replace(/^grid upper.*$/m, "").replace(/map upper[\s\S]*$/, ""))
    const r = cli("stages", join(dir, "corn.stages"), out)
    expect(r.code).toBe(1)
    expect(r.err).toContain("stale stage output")
  })

  test("refuses to overwrite its own inputs", () => {
    const dir = copyCorn()
    mkdirSync(join(dir, "stage0"))
    writeFileSync(join(dir, "corn.stages"), readFileSync(join(dir, "corn.stages"), "utf8").replace("mature/lower.grid", "stage0/lower.grid"))
    writeFileSync(join(dir, "stage0/lower.grid"), readFileSync(join(dir, "mature/lower.grid")))
    const r = cli("stages", join(dir, "corn.stages"), dir)
    expect(r.code).toBe(1)
    expect(r.err).toContain("would overwrite a mature input")
  })
})
