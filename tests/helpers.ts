// Authored test fixtures: fake game jars built in memory, never files from the game.
import { BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { zipSync } from "fflate"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { encodePng } from "../src/core/png.ts"
import type { Raster } from "../src/core/raster.ts"
import { GameJar, makeGameJar, type Environment } from "../src/services/jar.ts"

export const tempDir = () => mkdtempSync(join(tmpdir(), "texturescript-test-"))

/** A deterministic 16×16 authored texture; `seed` changes every pixel. */
export function texture(seed: number, width = 16, height = 16): Raster {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([(i * 37 + seed * 11) & 255, (i * 91 + seed * 7) & 255, (i * 13 + seed) & 255, i % 5 ? 255 : 0], i * 4)
  return { width, height, data }
}

export function upscale(image: Raster, k: number): Raster {
  const out = texture(0, image.width * k, image.height * k)
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++)
      out.data.set(image.data.subarray(((y / k | 0) * image.width + (x / k | 0)) * 4, ((y / k | 0) * image.width + (x / k | 0)) * 4 + 4), (y * out.width + x) * 4)
  return out
}

export const model = { parent: "minecraft:block/crop", textures: { crop: "minecraft:block/test_stage0" } }

/** Zip bytes laid out like a client jar. */
export function fakeJar(withTextures = true): Uint8Array {
  const files: Record<string, Uint8Array> = { "net/minecraft/Main.class": new Uint8Array([0xca, 0xfe]) }
  if (withTextures) {
    files["assets/minecraft/textures/block/test_stage0.png"] = encodePng(texture(1))
    files["assets/minecraft/textures/block/test_flow.png"] = encodePng(texture(2, 16, 64))
    files["assets/minecraft/models/block/test_stage0.json"] = new TextEncoder().encode(JSON.stringify(model))
  }
  return zipSync(files)
}

export const environment = (home: string): Environment => ({ home, platform: "linux", env: {} })

export const run = <A, E>(effect: Effect.Effect<A, E, GameJar | BunServices.BunServices>, home = tempDir()) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(Layer.effect(GameJar, makeGameJar(environment(home))).pipe(Layer.provideMerge(BunServices.layer)))),
  )

/** A minimal MCP client over a child's stdin and stdout, initialized and ready for requests. */
export async function mcpClient(command: string[], options: { cwd: string; env?: Record<string, string> }) {
  const proc = Bun.spawn(command, { ...options, stdin: "pipe", stdout: "pipe", stderr: "pipe" })
  const reader = proc.stdout.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let id = 0
  const send = (message: object) => {
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n")
    void proc.stdin.flush()
  }
  const request = async (method: string, params?: object): Promise<any> => {
    send({ id: ++id, method, params })
    for (;;) {
      const end = buffer.indexOf("\n")
      if (end >= 0) {
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 1)
        const message = JSON.parse(line)
        if (message.id === id) return message.result ?? Promise.reject(new Error(JSON.stringify(message.error)))
        continue
      }
      const { value, done } = await reader.read()
      if (done) throw new Error(`server exited: ${await new Response(proc.stderr).text()}`)
      buffer += decoder.decode(value, { stream: true })
    }
  }
  const init = await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } })
  send({ method: "notifications/initialized" })
  return {
    init,
    request,
    call: (name: string, args: object) => request("tools/call", { name, arguments: args }),
    close: () => {
      proc.stdin.end()
      return proc.exited
    },
  }
}
