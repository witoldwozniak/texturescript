import { describe, expect, test } from "bun:test"
import { Result } from "effect"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseGrid } from "../src/core/grid.ts"
import { paletteSection, parsePalette, validateKeys } from "../src/core/palette.ts"

const root = join(import.meta.dir, "..")
const read = (p: string) => readFileSync(join(root, p)).toString()

describe("palette sections match the prototype", () => {
  for (const [name, source] of [
    ["corn-family", "skill/palettes/corn.palette"],
    ["corn-example", "skill/examples/crop/corn.palette"],
    ["radish", "tests/fixtures/radish/radish.palette"],
  ] as const) {
    test(name, () => {
      const family = Result.getOrThrow(parsePalette(read(source)))
      expect(paletteSection(family)).toBe(read(`tests/fixtures/prototype/grid/${name}.palette.txt`))
    })
  }
})

describe("parsePalette refuses", () => {
  const refuse = (text: string) => {
    const r = parsePalette(text)
    if (Result.isSuccess(r)) throw new Error("parsed")
    return r.failure.message
  }
  const m = (rest: string) => `material leaf dark #266325 light #55ab2d ${rest}`
  test("shade counts outside 3 to 6", () => expect(refuse(m("shades 7 keys abcdefg"))).toBe("1: material leaf has 7 shades; vanilla uses 3 to 6"))
  test("keys that do not match the shades", () => expect(refuse(m("shades 4 keys abca"))).toBe('1: material leaf needs 4 distinct single-character keys, got "abca"'))
  test("anchors too close", () => expect(refuse("material x dark #266325 light #2a6a29 shades 3 keys abc")).toMatch(/^1: material x: anchors only \d+ L apart/))
  test("a light anchor darker than the dark one", () => expect(refuse("material x dark #55ab2d light #266325 shades 3 keys abc")).toBe("1: material x: light anchor (L 44) is not lighter than dark (L 66)"))
  test("keys shared between materials", () =>
    expect(refuse(`${m("shades 3 keys abc")}\nmaterial y dark #a8741a light #f2d158 shades 3 keys cde`)).toBe('2: key "c" in material y already used by leaf'))
  test("an empty file", () => expect(refuse("# nothing\n")).toBe("no materials"))
})

describe("validateKeys", () => {
  const family = Result.getOrThrow(parsePalette(read("skill/examples/crop/corn.palette")))
  test("accepts the corn grids", () => {
    const grid = Result.getOrThrow(parseGrid(read("skill/examples/crop/mature/lower.grid")))
    expect(Result.isSuccess(validateKeys(grid.palette, family))).toBe(true)
  })
  test("refuses a key whose colour drifted from its shade", () => {
    const grid = Result.getOrThrow(parseGrid("palette\na #266326\ngrid\na\n"))
    const r = validateKeys(grid.palette, family)
    expect(Result.isFailure(r) && r.failure.message).toBe('palette key "a" is #266326, expected family shade #266325; regenerate the grid palette header')
  })
  test("refuses an opaque key the family lacks", () => {
    const grid = Result.getOrThrow(parseGrid("palette\nz #000000\ngrid\nz\n"))
    expect(Result.isFailure(validateKeys(grid.palette, family))).toBe(true)
  })
})
