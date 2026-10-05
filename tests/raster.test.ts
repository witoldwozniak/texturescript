import { describe, expect, test } from "bun:test"
import * as R from "../src/core/raster.ts"
import prototype from "./fixtures/prototype/color.json" with { type: "json" }

describe("raster", () => {
  test("get, set, crop and paste", () => {
    const r = R.make(4, 4)
    R.set(r, 2, 1, [1, 2, 3, 255])
    expect(R.get(R.crop(r, 2, 1, 2, 2), 0, 0)).toEqual([1, 2, 3, 255])
    const dst = R.make(3, 3, [9, 9, 9, 255])
    R.paste(dst, R.crop(r, 1, 0, 2, 2), 2, 2)
    expect(R.get(dst, 2, 2)).toEqual([0, 0, 0, 0])
    expect(R.get(dst, 1, 1)).toEqual([9, 9, 9, 255])
  })

  test("nearest-neighbour scaling repeats each pixel k×k times", () => {
    const r = R.make(2, 1)
    R.set(r, 1, 0, [255, 0, 0, 255])
    const big = R.scale(r, 3)
    expect([big.width, big.height]).toEqual([6, 3])
    expect(R.get(big, 2, 2)).toEqual([0, 0, 0, 0])
    expect(R.get(big, 3, 2)).toEqual([255, 0, 0, 255])
  })

  test("composite matches Pillow's alpha_composite", () => {
    for (const [s, d, want] of prototype.composite as unknown as Array<[R.Pixel, R.Pixel, R.Pixel]>) {
      const dst = R.make(1, 1, d)
      R.composite(dst, R.make(1, 1, s), 0, 0)
      expect(R.get(dst, 0, 0)).toEqual(want)
    }
  })

  test("equals and hash see every pixel and the size", () => {
    const a = R.make(2, 2, [1, 2, 3, 4])
    const b = R.make(2, 2, [1, 2, 3, 4])
    expect(R.equals(a, b) && R.hash(a) === R.hash(b)).toBe(true)
    R.set(b, 1, 1, [1, 2, 3, 5])
    expect(R.equals(a, b) || R.hash(a) === R.hash(b)).toBe(false)
    expect(R.hash(R.make(1, 4))).not.toBe(R.hash(R.make(4, 1)))
  })
})
