#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { Command } from "effect/cli"
import pkg from "../../package.json" with { type: "json" }
import * as Jar from "../services/jar.ts"
import * as Png from "../services/png.ts"
import { gridCommand } from "./grid.ts"
import { jarCommand } from "./jar.ts"
import { lintCommand } from "./lint.ts"
import { paletteCommand } from "./palette.ts"

export const root = Command.make("texturescript").pipe(
  Command.withDescription("Author Minecraft textures as text and judge them in 3D."),
  Command.withSubcommands([paletteCommand, gridCommand, lintCommand, jarCommand]),
)

const services = Layer.mergeAll(Jar.layer, Png.layer).pipe(Layer.provideMerge(BunServices.layer))

if (import.meta.main) {
  Command.run(root, { version: pkg.version }).pipe(Effect.provide(services), BunRuntime.runMain)
}
