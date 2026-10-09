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

export type Cam = readonly [yaw: number, pitch: number, distance: number]

const parseCam = (text: string): Cam | undefined => {
  const parts = text.split(",").map(Number)
  return parts.length === 3 && parts.every(Number.isFinite) ? (parts as unknown as Cam) : undefined
}

export interface ShootOptions {
  readonly scene: string
  readonly out: string
  /** Cameras to shoot from; none means the scene's own. */
  readonly cams: ReadonlyArray<Cam>
  /** Variants to shoot; none means all of them. */
  readonly variants: ReadonlyArray<string>
  readonly width: number
  readonly height: number
  readonly split: boolean
  readonly labels: boolean
}

/** Shoots a scene in one browser; writes one sheet, or one PNG per shot with `split`. */
export const shootScene = (o: ShootOptions) =>
  Effect.scoped(
    Effect.gen(function* () {
      const path = yield* Path.Path
      const png = yield* PngFiles
      const live = yield* serveScene(o.scene, { port: 0 })
      const current = live.current()
      if (current.type === "error") return yield* specError(current.message)
      const { camera, variants: all, missing } = current.scene
      const cams: ReadonlyArray<Cam> = o.cams.length ? o.cams : [[camera.yaw ?? 35, camera.pitch ?? 25, camera.distance ?? 7]]
      const names = o.variants.length ? o.variants : Object.keys(all)
      for (const v of names) if (!(v in all)) return yield* specError(`no variant ${JSON.stringify(v)}; the scene has ${Object.keys(all).join(", ")}`)

      // One browser and one page for every shot: set the view in the page, then capture.
      const page = yield* (yield* Browser.Browser).page(o.width, o.height)
      const shots: Array<{ variant: string; cam: Cam; image: Raster }> = []
      yield* Effect.tryPromise({
        try: async () => {
          await page.goto(`${live.url}?hud=0${o.labels ? "" : "&labels=0"}`)
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
      const written: Array<{ file: string; image: Raster }> = []
      if (o.split || shots.length === 1) {
        for (const [i, s] of shots.entries()) {
          const { dir, name, ext } = path.parse(o.out)
          const file = shots.length === 1 ? o.out : path.join(dir, `${name}-${s.variant}-${i % cams.length}${ext || ".png"}`)
          yield* png.write(file, s.image)
          written.push({ file, image: s.image })
        }
      } else {
        const laid = contactSheet(shots.map((s) => ({ name: caption(s), image: s.image })), { scale: 1, cols: cams.length, background: [40, 40, 40, 255], captionLength: 200 })
        const image = yield* Browser.drawCaptions(laid.image, laid.captions)
        yield* png.write(o.out, image)
        written.push({ file: o.out, image })
      }
      return { written, shots: shots.map((s) => ({ variant: s.variant, cam: s.cam })), variants: names.length, cams: cams.length, missing }
    }),
  )

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
    Effect.gen(function* () {
      const size = /^(\d+)x(\d+)$/.exec(o.size)
      if (!size) return yield* specError(`--size ${o.size}: expected WIDTHxHEIGHT, e.g. 960x540`)
      const cams: Cam[] = []
      for (const c of o.cam) {
        const cam = parseCam(c)
        if (!cam) return yield* specError(`--cam ${c}: expected YAW,PITCH,DISTANCE, e.g. 30,22,7`)
        cams.push(cam)
      }
      const r = yield* shootScene({
        scene: o.scene, out: o.out, cams, variants: o.variant,
        width: Number(size[1]), height: Number(size[2]), split: o.split, labels: !o.noLabels,
      })
      const files = r.written.map((w) => w.file)
      if (r.missing.length && !o.json) yield* Console.error(`missing: ${r.missing.join(", ")}`)
      yield* o.json
        ? printJson({ files, shots: r.shots, missing: r.missing })
        : Console.log(`${files.join(", ")}: ${r.shots.length} shot${r.shots.length === 1 ? "" : "s"} (${r.variants} variant${r.variants === 1 ? "" : "s"} × ${r.cams} camera${r.cams === 1 ? "" : "s"})`)
    }).pipe(
      Effect.provide(Browser.layer),
      Effect.provide(vanillaLayer(o.jar, o.noJar)),
      Effect.catchTag("BrowserFailed", (e) => {
        process.exitCode = 1
        return Console.error(`REFUSED ${e.message}`)
      }),
      refuseSpecErrors(undefined, o.json),
    ),
).pipe(Command.withDescription("screenshot a scene from one or more angles and variants, in one browser"))
