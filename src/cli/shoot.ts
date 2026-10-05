import { Console, Effect, Path } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { decodePng } from "../core/png.ts"
import type { Raster } from "../core/raster.ts"
import { contactSheet } from "../core/sheet.ts"
import { specError } from "../core/spec-error.ts"
import * as Browser from "../services/browser.ts"
import { serveScene } from "../services/live.ts"
import { PngFiles } from "../services/png.ts"
import * as flags from "./flags.ts"
import { printJson, refuseSpecErrors } from "./report.ts"
import { vanillaLayer } from "./view.ts"

type Cam = readonly [yaw: number, pitch: number, distance: number]

const parseCam = (text: string): Cam | undefined => {
  const parts = text.split(",").map(Number)
  return parts.length === 3 && parts.every(Number.isFinite) ? (parts as unknown as Cam) : undefined
}

export const shootCommand = Command.make(
  "shoot",
  {
    scene: Argument.String("scene").pipe(Argument.withDescription("scene file (.toml)")),
    out: Argument.String("out").pipe(Argument.withDescription("PNG to write: one shot, or a labelled sheet of all of them")),
    cam: Flag.String("cam").pipe(Flag.atLeast(0), Flag.withDescription("YAW,PITCH,DISTANCE in degrees and blocks; repeat for more angles (default: the scene's camera)")),
    variant: Flag.String("variant").pipe(Flag.atLeast(0), Flag.withDescription("variant to shoot; repeat for more (default: all)")),
    size: Flag.String("size").pipe(Flag.withDefault("960x540"), Flag.withDescription("WIDTHxHEIGHT of each shot")),
    split: Flag.Boolean("split").pipe(Flag.withDefault(false), Flag.withDescription("write one PNG per shot (OUT-VARIANT-N.png) instead of a sheet")),
    noLabels: Flag.Boolean("no-labels").pipe(Flag.withDefault(false), Flag.withDescription("hide plot labels in the shots")),
    jar: flags.jar,
    noJar: Flag.Boolean("no-jar").pipe(Flag.withDefault(false), Flag.withDescription("show only authored blocks")),
    json: flags.json,
  },
  (o) =>
    Effect.scoped(
      Effect.gen(function* () {
        const path = yield* Path.Path
        const png = yield* PngFiles
        const size = /^(\d+)x(\d+)$/.exec(o.size)
        if (!size) return yield* specError(`--size ${o.size}: expected WIDTHxHEIGHT, e.g. 960x540`)
        const [width, height] = [Number(size[1]), Number(size[2])]
        const cams: Cam[] = []
        for (const c of o.cam) {
          const cam = parseCam(c)
          if (!cam) return yield* specError(`--cam ${c}: expected YAW,PITCH,DISTANCE, e.g. 30,22,7`)
          cams.push(cam)
        }

        const live = yield* serveScene(o.scene, { port: 0 })
        const current = live.current()
        if (current.type === "error") return yield* specError(current.message)
        const { camera, variants: all, missing } = current.scene
        if (cams.length === 0) cams.push([camera.yaw ?? 35, camera.pitch ?? 25, camera.distance ?? 7])
        const names = o.variant.length ? o.variant : Object.keys(all)
        for (const v of names) if (!(v in all)) return yield* specError(`no variant ${JSON.stringify(v)}; the scene has ${Object.keys(all).join(", ")}`)
        if (missing.length && !o.json) yield* Console.error(`missing: ${missing.join(", ")}`)

        // One browser and one page for every shot: set the view in the page, then capture.
        const page = yield* (yield* Browser.Browser).page(width, height)
        const shots: Array<{ variant: string; cam: Cam; image: Raster }> = []
        yield* Effect.tryPromise({
          try: async () => {
            await page.goto(`${live.url}?hud=0${o.noLabels ? "&labels=0" : ""}`)
            await page.waitForSelector("#ready", { state: "attached", timeout: 60_000 })
            for (const variant of names)
              for (const cam of cams) {
                await page.evaluate(
                  ([v, c]) =>
                    new Promise<void>((done) => {
                      const ts = (window as unknown as { textureScript: { setVariant(v: string): void; setCamera(y: number, p: number, d: number): void } }).textureScript
                      ts.setVariant(v)
                      ts.setCamera(c[0], c[1], c[2])
                      requestAnimationFrame(() => done())
                    }),
                  [variant, cam] as const,
                )
                shots.push({ variant, cam, image: decodePng(new Uint8Array(await page.screenshot())) })
              }
          },
          catch: (e) => new Browser.BrowserFailed({ reason: e instanceof Error ? e.message.split("\n")[0]! : String(e) }),
        })

        const caption = (s: (typeof shots)[number]) => `${s.variant} · cam ${s.cam.join(",")}`
        const files: string[] = []
        if (o.split || shots.length === 1) {
          for (const [i, s] of shots.entries()) {
            const { dir, name, ext } = path.parse(o.out)
            const file = shots.length === 1 ? o.out : path.join(dir, `${name}-${s.variant}-${i % cams.length}${ext || ".png"}`)
            yield* png.write(file, s.image)
            files.push(file)
          }
        } else {
          const laid = contactSheet(shots.map((s) => ({ name: caption(s), image: s.image })), { scale: 1, cols: cams.length, background: [40, 40, 40, 255], captionLength: 200 })
          yield* png.write(o.out, yield* Browser.drawCaptions(laid.image, laid.captions))
          files.push(o.out)
        }
        yield* o.json
          ? printJson({ files, shots: shots.map((s) => ({ variant: s.variant, cam: s.cam })), missing })
          : Console.log(`${files.join(", ")}: ${shots.length} shot${shots.length === 1 ? "" : "s"} (${names.length} variant${names.length === 1 ? "" : "s"} × ${cams.length} camera${cams.length === 1 ? "" : "s"})`)
      }),
    ).pipe(
      Effect.provide(Browser.layer),
      Effect.provide(vanillaLayer(o.jar, o.noJar)),
      Effect.catchTag("BrowserFailed", (e) => {
        process.exitCode = 1
        return Console.error(`REFUSED ${e.message}`)
      }),
      refuseSpecErrors(undefined, o.json),
    ),
).pipe(Command.withDescription("screenshot a scene from one or more angles and variants, in one browser"))
