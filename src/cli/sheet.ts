import { Console, Effect, FileSystem, Path } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { parseHex } from "../core/color.ts"
import { contactSheet } from "../core/sheet.ts"
import { specError } from "../core/spec-error.ts"
import * as Browser from "../services/browser.ts"
import { PngFiles } from "../services/png.ts"
import * as flags from "./flags.ts"
import { printJson, refuseSpecErrors } from "./report.ts"

export const sheetCommand = Command.make(
  "sheet",
  {
    out: Argument.String("out").pipe(Argument.withDescription("PNG to write")),
    inputs: Argument.String("inputs").pipe(Argument.variadic(), Argument.withDescription("PNG files, or folders of them")),
    scale: Flag.Int("scale").pipe(Flag.withDefault(12), Flag.withDescription("upscale factor")),
    cols: Flag.Int("cols").pipe(Flag.withDefault(8), Flag.withDescription("tiles per row")),
    bg: Flag.String("bg").pipe(Flag.withDefault("7f7f7f"), Flag.withDescription("tile background, six hex digits")),
    noLabels: Flag.Boolean("no-labels").pipe(Flag.withDefault(false), Flag.withDescription("no file names (works without a browser)")),
    json: flags.json,
  },
  ({ out, inputs, scale, cols, bg, noLabels, json }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const png = yield* PngFiles
      if (scale < 1 || cols < 1) return yield* specError("scale and columns must be positive")
      const background = parseHex(`#${bg}`)
      if (background._tag === "Failure" || !/^[0-9a-fA-F]{6}$/.test(bg)) return yield* specError("background must be six hex digits, e.g. 7f7f7f")
      const files: string[] = []
      for (const input of inputs) {
        const isDir = yield* fs.stat(input).pipe(Effect.map((s) => s.type === "Directory"), Effect.orElseSucceed(() => false))
        if (isDir) files.push(...(yield* fs.readDirectory(input)).filter((f) => f.endsWith(".png")).sort().map((f) => path.join(input, f)))
        else files.push(input)
      }
      if (files.length === 0) return yield* specError("no PNG files found")
      const tiles = []
      for (const f of files) tiles.push({ name: path.parse(f).name, image: yield* png.read(f).pipe(Effect.mapError((e) => specError(e.message))) })
      const laid = contactSheet(tiles, { scale, cols, background: background.success, labels: !noLabels })
      const image = noLabels ? laid.image : yield* Browser.drawCaptions(laid.image, laid.captions).pipe(Effect.provide(Browser.layer))
      yield* png.write(out, image)
      yield* json ? printJson({ out, tiles: files.length, width: image.width, height: image.height }) : Console.log(`${out}: ${files.length} tiles, ${image.width}x${image.height}`)
    }).pipe(
      Effect.catchTag("BrowserFailed", (e) => {
        process.exitCode = 1
        return Console.error(`REFUSED ${e.message} (or pass --no-labels)`)
      }),
      refuseSpecErrors(undefined, json),
    ),
).pipe(Command.withDescription("build a labelled contact sheet of upscaled textures"))
