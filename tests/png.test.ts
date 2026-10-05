import { describe, expect, test } from "bun:test"
import { encode } from "fast-png"
import { decodePng, encodePng } from "../src/core/png.ts"

const rgba = (...px: number[][]) => [...px.flat()]

describe("decodePng", () => {
  test("round-trips RGBA, including fully transparent pixels", () => {
    const data = new Uint8Array(rgba([255, 0, 0, 255], [1, 2, 3, 0], [0, 0, 255, 128], [9, 9, 9, 255]))
    const back = decodePng(encodePng({ width: 2, height: 2, data }))
    expect(back.data).toEqual(data)
  })

  test("expands grey, grey+alpha and RGB", () => {
    expect(decodePng(encode({ width: 1, height: 1, data: new Uint8Array([7]), channels: 1, depth: 8 })).data).toEqual(new Uint8Array([7, 7, 7, 255]))
    expect(decodePng(encode({ width: 1, height: 1, data: new Uint8Array([7, 9]), channels: 2, depth: 8 })).data).toEqual(new Uint8Array([7, 7, 7, 9]))
    expect(decodePng(encode({ width: 1, height: 1, data: new Uint8Array([1, 2, 3]), channels: 3, depth: 8 })).data).toEqual(new Uint8Array([1, 2, 3, 255]))
  })

  test("reduces 16-bit samples to 8 bits", () => {
    const png = encode({ width: 1, height: 1, data: new Uint16Array([0xff00, 0x1234, 0x0000, 0xffff]), channels: 4, depth: 16 })
    expect(decodePng(png).data).toEqual(new Uint8Array([255, 0x12, 0, 255]))
  })

  test("unpacks 1-bit grey", () => {
    const png = encode({ width: 3, height: 1, data: new Uint8Array([0b10100000]), channels: 1, depth: 1 })
    expect(decodePng(png).data).toEqual(new Uint8Array(rgba([255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255])))
  })

  test("applies palettes with transparency", () => {
    const png = encode({ width: 2, height: 1, data: new Uint8Array([0, 1]), channels: 1, depth: 8, palette: [[10, 20, 30, 0], [40, 50, 60, 255]] })
    expect(decodePng(png).data).toEqual(new Uint8Array(rgba([10, 20, 30, 0], [40, 50, 60, 255])))
  })
})

describe("PngFiles", () => {
  test("writes into new folders and reads back", async () => {
    const { BunServices } = await import("@effect/platform-bun")
    const { Effect, Layer } = await import("effect")
    const { PngFiles, layer } = await import("../src/services/png.ts")
    const { tempDir } = await import("./helpers.ts")
    const file = `${tempDir()}/a/b/c.png`
    const image = { width: 1, height: 1, data: new Uint8Array([1, 2, 3, 4]) }
    const back = await Effect.runPromise(
      Effect.gen(function* () {
        const png = yield* PngFiles
        yield* png.write(file, image)
        return yield* png.read(file)
      }).pipe(Effect.provide(layer.pipe(Layer.provideMerge(BunServices.layer)))),
    )
    expect(back).toEqual(image)
  })
})
