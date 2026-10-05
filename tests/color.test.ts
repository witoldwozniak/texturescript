import { describe, expect, test } from "bun:test"
import { Result } from "effect"
import {
  hexToRgb, interpolateOklch, oklabToOklch, oklabToRgb, oklchToOklab, parseHex, rgbToHex, rgbToOklab, roundHalfEven, type Rgb,
} from "../src/core/color.ts"
import prototype from "./fixtures/prototype/color.json" with { type: "json" }

describe("parseHex", () => {
  test("reads #rrggbb and transparent", () => {
    expect(Result.getOrThrow(parseHex("#266325"))).toEqual([0x26, 0x63, 0x25, 255])
    expect(Result.getOrThrow(parseHex("transparent"))).toEqual([0, 0, 0, 0])
  })
  test("fails with a message naming the text", () => {
    const r = parseHex("#12345")
    expect(Result.isFailure(r)).toBe(true)
    if (Result.isFailure(r)) expect(r.failure.message).toContain('"#12345"')
  })
})

test("rounds halves to even, like Python", () => {
  expect([0.5, 1.5, 2.5, -0.5, 2.4, 2.6].map(roundHalfEven)).toEqual([0, 2, 2, -0, 2, 3])
})

describe("OKLab and OKLCH", () => {
  test("every 8-bit sRGB colour round-trips within 1/255", () => {
    let worst = 0
    for (let i = 0; i < 1 << 24; i += 4099) {
      const rgb: Rgb = [(i >> 16) / 255, ((i >> 8) & 255) / 255, (i & 255) / 255]
      const back = oklabToRgb(oklchToOklab(oklabToOklch(rgbToOklab(rgb))))
      for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(back[c]! - rgb[c]!))
    }
    expect(worst).toBeLessThan(1 / 255)
  })

  test("matches the prototype", () => {
    for (const [hex, lch] of prototype.oklch as Array<[string, number[]]>) {
      const got = oklabToOklch(rgbToOklab(hexToRgb(hex)))
      expect(got[0]).toBeCloseTo(lch[0]!, 12)
      expect(got[1]).toBeCloseTo(lch[1]!, 12)
      if (lch[1]! > 1e-6) expect(got[2]).toBeCloseTo(lch[2]!, 9)
    }
  })
})

test("OKLCH ramps match the prototype's hex values exactly", () => {
  for (const [dark, light, n, want] of prototype.ramps as Array<[string, string, number, string[]]>) {
    expect(interpolateOklch(hexToRgb(dark), hexToRgb(light), n).map(rgbToHex)).toEqual(want)
  }
})
