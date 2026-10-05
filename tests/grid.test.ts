import { describe, expect, test } from "bun:test"
import { Result } from "effect"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseGrid, renderGrid, serializeGrid, toAscii } from "../src/core/grid.ts"
import { decodePng } from "../src/core/png.ts"
import * as R from "../src/core/raster.ts"

const root = join(import.meta.dir, "..")
const read = (p: string) => readFileSync(join(root, p))
const expected = (name: string) => join("tests/fixtures/prototype/grid", name)

const CASES = [
  ["corn-lower", "skill/examples/crop/mature/lower.grid"],
  ["corn-upper", "skill/examples/crop/mature/upper.grid"],
  ["radish-mature", "tests/fixtures/radish/mature.grid"],
] as const

describe("grids match the prototype", () => {
  for (const [name, source] of CASES) {
    test(name, () => {
      const grid = Result.getOrThrow(parseGrid(read(source).toString()))
      const image = renderGrid(grid)
      expect(R.equals(image, decodePng(read(expected(`${name}.png`))))).toBe(true)
      expect(toAscii(image, grid.palette) + "\n").toBe(read(expected(`${name}.txt`)).toString())
      expect(Result.getOrThrow(parseGrid(serializeGrid(grid)))).toEqual(grid)
    })
  }
})

describe("parseGrid refuses broken grids, saying where", () => {
  const refuse = (text: string) => {
    const r = parseGrid(text)
    if (Result.isSuccess(r)) throw new Error("parsed")
    return r.failure.message
  }
  test("undeclared character, with line and column", () => {
    expect(refuse("palette\n. transparent\na #123456\ngrid\n..a.\n  ..b.\n")).toBe('6:5: character "b" is not in the palette')
  })
  test("ragged rows", () => {
    expect(refuse("palette\n. transparent\ngrid\n...\n..\n")).toBe("5: row is 2 wide, expected 3 like the first row")
  })
  test("bad colours, duplicates, order", () => {
    expect(refuse("palette\na #12345\ngrid\na\n")).toBe('2: colour "#12345" is not #rrggbb or \'transparent\'')
    expect(refuse("palette\na #123456\na #123456\ngrid\na\n")).toBe('3: duplicate palette key "a"')
    expect(refuse("grid\n..\n")).toBe("1: grid must follow a non-empty palette")
    expect(refuse("..\n")).toBe("1: content before a 'palette' or 'grid' header")
    expect(refuse("palette\na #123456\ngrid\n")).toBe("no grid rows")
  })
  test("allows comments, including after palette entries", () => {
    const grid = Result.getOrThrow(parseGrid("# c\npalette\na #123456  # leaf\ngrid\n# c\naa\n"))
    expect(grid.rows).toEqual(["aa"])
  })
})
