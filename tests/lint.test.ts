import { describe, expect, test } from "bun:test"
import { Result } from "effect"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { lint, type Finding, type LintOptions } from "../src/core/lint.ts"
import { parsePalette } from "../src/core/palette.ts"
import { pyRound } from "../src/core/py.ts"
import * as R from "../src/core/raster.ts"

/** Draws a sprite from rows of keys; '.' is transparent. */
function sprite(rows: string[], colours: Record<string, R.Pixel>): R.Raster {
  const out = R.make(rows[0]!.length, rows.length)
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && R.set(out, x, y, colours[ch]!)))
  return out
}

const G: Record<string, R.Pixel> = { a: [38, 99, 37, 255], b: [52, 122, 42, 255], c: [67, 146, 45, 255], d: [85, 171, 45, 255], k: [10, 30, 10, 255] }
/** A sparse, vanilla-like stalk that passes every rule. */
const STALK = Array.from({ length: 16 }, (_, y) => (y < 4 ? "................" : y % 3 ? "......bc........" : "....abcd........"))

const rules = (findings: Finding[], level: Finding["level"]) => findings.filter((f) => f.level === level).map((f) => f.rule)
const trips = (image: R.Raster, options: LintOptions = {}) => [...rules(lint(image, options), "FAIL"), ...rules(lint(image, options), "WARN")]

test("a clean sprite passes everything", () => {
  expect(trips(sprite(STALK, G))).toEqual([])
})

describe("each rule trips on an image made to break it", () => {
  test("size", () => expect(trips(R.make(16, 32, [1, 1, 1, 255]))).toContain("size"))
  test("alpha", () => {
    const img = sprite(STALK, G)
    R.set(img, 6, 5, [52, 122, 42, 128])
    expect(rules(lint(img), "FAIL")).toContain("alpha")
  })
  test("budget: warn above 10 colours, fail above 13", () => {
    const rainbow = (n: number) => {
      const img = sprite(STALK, G)
      for (let i = 0; i < n; i++) R.set(img, 16 - n + i, 3, [20 * i, 255 - 15 * i, 40, 255])
      return img
    }
    expect(rules(lint(rainbow(9)), "WARN")).toContain("budget")
    expect(rules(lint(rainbow(12)), "FAIL")).toContain("budget")
  })
  test("palette", () => {
    const family = Result.getOrThrow(parsePalette(readFileSync(join(import.meta.dir, "../skill/palettes/corn.palette"), "utf8")))
    const findings = lint(sprite(STALK, G), { palette: { name: "corn.palette", family } })
    expect(findings.find((f) => f.rule === "palette")).toMatchObject({ level: "OK", message: "all colours are palette shades; leaf 4" })
    const off = sprite(STALK, { ...G, a: [255, 0, 255, 255] })
    expect(lint(off, { palette: { name: "corn.palette", family } }).find((f) => f.rule === "palette")?.message).toBe("1 colours not in corn.palette: #ff00ff")
  })
  test("ramp", () => {
    const img = sprite(STALK, G)
    for (let i = 0; i < 8; i++) R.set(img, 4 + i, 2, [20 + 20 * i, 60 + 22 * i, 20 + 5 * i, 255])
    expect(rules(lint(img), "WARN")).toContain("ramp")
  })
  test("noise", () => {
    const checker = Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => ((x + y) % 2 ? "a" : "d")).join(""))
    expect(rules(lint(sprite(checker, G)), "FAIL")).toContain("noise")
    expect(rules(lint(sprite(checker, G)), "WARN")).toContain("dither")
  })
  test("islands", () => {
    const dots = Array.from({ length: 16 }, (_, y) => (y % 2 ? "................" : "a.a.a.a.a.a.a.a."))
    expect(rules(lint(sprite(dots, G)), "WARN")).toContain("islands")
  })
  test("solid", () => {
    expect(rules(lint(sprite(STALK.map((r, y) => (y === 8 || y === 9 ? "...bbbbbb......." : r)), G)), "WARN")).toContain("solid")
  })
  test("coverage, high and low", () => {
    expect(rules(lint(R.make(16, 16, [85, 171, 45, 255])), "WARN")).toContain("coverage")
    const speck = R.make(16, 16)
    R.set(speck, 8, 15, [85, 171, 45, 255])
    expect(rules(lint(speck), "WARN")).toContain("coverage")
  })
  test("outline: a crop must not have one, an item must", () => {
    const blob = Array.from({ length: 16 }, (_, y) => (y < 3 || y > 12 ? "................" : "..kkkkkkkkkkk..."))
    const outlined = blob.map((r, y) => (y > 3 && y < 12 ? "..kdddddddddk..." : r))
    expect(rules(lint(sprite(outlined, G)), "WARN")).toContain("outline")
    const flat = blob.map((r) => r.replaceAll("k", "c"))
    expect(rules(lint(sprite(flat, G), { kind: "item" }), "WARN")).toContain("outline")
  })
  test("light: items are lit from the top left", () => {
    const shaded = Array.from({ length: 16 }, (_, y) => (y < 3 || y > 12 ? "................" : `..k${(y > 8 ? "aaaaaaadd" : "aaaaaaaaa")}k...`))
    expect(rules(lint(sprite(shaded, G), { kind: "item" }), "WARN")).toContain("light")
  })
  test("seam: the upper half must continue into the lower", () => {
    const lower = sprite(STALK.map((r, y) => (y === 0 ? "......bc........" : r)), G)
    const floating = sprite(STALK.map((r, y) => (y === 15 ? "................" : r)), G)
    expect(lint(floating, { lower }).find((f) => f.rule === "seam")?.message).toBe("upper half's bottom row is empty; the plant floats")
    const stray = sprite(STALK.map((r, y) => (y === 15 ? "..a...bc........" : r)), G)
    expect(lint(stray, { lower }).find((f) => f.rule === "seam")?.message).toBe(
      "upper half's bottom row has opaque columns [2] that the lower half's top row lacks (lower has [6, 7])",
    )
  })
})

test("Python rounding in messages", () => {
  expect([pyRound(0.125, 2), pyRound(0.375, 2), pyRound(0.285, 2), pyRound(2.5), pyRound(0.0625, 3)]).toEqual([0.12, 0.38, 0.28, 2, 0.062])
})
