// A headless Chromium for screenshots and for laying out text, closed with its scope.
import { Context, Effect, Layer, Schema } from "effect"
import { chromium, type Page } from "playwright-core"
import { decodePng, encodePng } from "../core/png.ts"
import type { Raster } from "../core/raster.ts"
import { toBase64 } from "../core/scene/atlas.ts"
import type { Caption } from "../core/sheet.ts"

export class BrowserFailed extends Schema.TaggedError<BrowserFailed>()("BrowserFailed", { reason: Schema.String }) {
  override get message() {
    return this.reason
  }
}

const failed = (e: unknown) => {
  const text = e instanceof Error ? e.message : String(e)
  return new BrowserFailed({
    reason: /Executable doesn't exist|install/i.test(text)
      ? "Chromium for screenshots is not installed; run once: bunx playwright-core install chromium"
      : text.split("\n")[0]!,
  })
}

export class Browser extends Context.Service<Browser, {
  /** A fresh page of the given size, closed with the surrounding scope. */
  readonly page: (width: number, height: number) => Effect.Effect<Page, BrowserFailed, import("effect").Scope.Scope>
}>()("texturescript/Browser") {}

export const layer = Layer.effect(
  Browser,
  Effect.gen(function* () {
    const browser = yield* Effect.acquireRelease(
      Effect.tryPromise({ try: () => chromium.launch(), catch: failed }),
      (b) => Effect.promise(() => b.close()),
    )
    return Browser.of({
      page: (width, height) =>
        Effect.acquireRelease(
          Effect.tryPromise({ try: () => browser.newPage({ viewport: { width, height } }), catch: failed }),
          (p) => Effect.promise(() => p.close()),
        ),
    })
  }),
)

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

/** Draws captions onto an image (the core has no font, the browser does). */
export const drawCaptions = Effect.fn("drawCaptions")(function* (image: Raster, captions: ReadonlyArray<Caption>) {
  if (captions.length === 0) return image
  const page = yield* (yield* Browser).page(image.width, image.height)
  const html =
    `<body style="margin:0;background:#000"><div style="position:relative;width:${image.width}px;height:${image.height}px">` +
    `<img style="position:absolute;left:0;top:0;image-rendering:pixelated" src="data:image/png;base64,${toBase64(encodePng(image))}">` +
    captions
      .map((c) => `<div style="position:absolute;left:${c.x}px;top:${c.y}px;font:11px/13px system-ui,sans-serif;color:#e6e6e6;white-space:nowrap">${escape(c.text)}</div>`)
      .join("") +
    "</div></body>"
  return yield* Effect.tryPromise({
    try: async () => {
      await page.setContent(html)
      await page.waitForFunction(() => document.images[0]?.complete)
      return decodePng(new Uint8Array(await page.screenshot({ clip: { x: 0, y: 0, width: image.width, height: image.height } })))
    },
    catch: failed,
  })
}, Effect.scoped)
