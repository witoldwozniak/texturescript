// An MCP server over stdio, so agents can render, lint and shoot without a shell.
// stdout carries the protocol, so nothing on the tool path may print to it.
import { Console, Context, Effect, Layer, Logger, Schema } from "effect"
import { McpProtocol, McpSchema, McpServer } from "effect/ai"
import { Command, Flag } from "effect/cli"
import pkg from "../../package.json" with { type: "json" }
import { failures, type Finding } from "../core/lint.ts"
import { encodePng } from "../core/png.ts"
import type { Raster } from "../core/raster.ts"
import { inFile, SpecError } from "../core/spec-error.ts"
import * as R from "../core/raster.ts"
import * as Browser from "../services/browser.ts"
import { SKILL_FILES } from "../skill/bundle.ts"
import * as flags from "./flags.ts"
import { renderSpec } from "./grid.ts"
import { findingLines, lintFile } from "./lint.ts"
import { shootScene, type Cam } from "./shoot.ts"
import { vanillaLayer } from "./view.ts"

/** What a tool hands back: a summary for the agent, the same as data, and images to look at. */
interface Reply {
  readonly text: string
  readonly data: Record<string, unknown>
  readonly images?: ReadonlyArray<Raster>
}

const reply = (r: Reply) =>
  new McpSchema.CallToolResult({
    content: [
      { type: "text", text: r.text },
      ...(r.images ?? []).map((image) => ({ type: "image" as const, data: encodePng(image), mimeType: "image/png" })),
    ],
    structuredContent: r.data as Schema.Json,
  })

const refused = (message: string) => new McpSchema.CallToolResult({ isError: true, content: [{ type: "text", text: `REFUSED ${message}` }] })

/** Registers a tool whose arguments are decoded with `parameters`; any failure becomes an error result. */
const addTool = <S extends Schema.Top & { readonly DecodingServices: never }, E, R>(options: {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly parameters: S
  readonly readOnly: boolean
  readonly handle: (params: S["Type"]) => Effect.Effect<Reply, E, R>
}) =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer
    const context = yield* Effect.context<R>()
    const decode = Schema.decodeUnknownEffect(options.parameters)
    yield* server.addTool({
      tool: new McpSchema.Tool({
        name: options.name,
        title: options.title,
        description: options.description,
        inputSchema: Schema.toJsonSchemaDocument(options.parameters).schema as McpSchema.Tool["inputSchema"],
        annotations: { title: options.title, readOnlyHint: options.readOnly, destructiveHint: false, openWorldHint: false },
      }),
      annotations: Context.empty(),
      handle: (payload) =>
        decode(payload ?? {}).pipe(
          Effect.flatMap(options.handle),
          Effect.map(reply),
          Effect.catch((e) => Effect.succeed(refused(e instanceof Error ? e.message : String(e)))),
          Effect.provideContext(context),
        ),
    })
  })

const path = (description: string) => Schema.String.annotate({ description })

const lintReply = (texture: string, findings: ReadonlyArray<Finding>): Reply => {
  const fails = failures(findings)
  const warns = findings.filter((f) => f.level === "WARN").length
  return {
    text: [...findingLines(findings), `${fails ? "FAILED" : "PASSED"}: ${fails} fail, ${warns} warn`].join("\n"),
    data: { texture, passed: fails === 0, findings },
  }
}

const render = addTool({
  name: "render",
  title: "Render a grid",
  description:
    "Renders a character grid (.grid) to OUT.png, writing OUT_x16.png and OUT.txt beside it, and returns the ×16 preview. " +
    "Refuses a broken grid with file:line:col.",
  parameters: Schema.Struct({
    spec: path("character grid (.grid)"),
    out: path("PNG to write, e.g. out/lower.png"),
  }),
  readOnly: false,
  handle: ({ spec, out }) =>
    renderSpec(spec, out).pipe(
      Effect.mapError((e) => (e instanceof SpecError ? inFile(e, spec) : e)),
      Effect.map(({ image, paletteEntries, files }) => ({
        text: `rendered ${out} (${image.width}x${image.height}, ${paletteEntries} palette entries); wrote ${files.join(", ")}`,
        data: { width: image.width, height: image.height, paletteEntries, files: [...files] },
        images: [R.scale(image, 16)],
      })),
    ),
})

const lint = addTool({
  name: "lint",
  title: "Lint a texture",
  description:
    "Checks a 16×16 PNG against conventions measured on vanilla textures: size, colours, alpha, noise, islands, outline, " +
    "and with `lower` the seam between two halves. FAIL findings must be fixed; WARN findings are worth a look.",
  parameters: Schema.Struct({
    texture: path("16×16 PNG to check"),
    kind: Schema.optional(Schema.Literals(["block", "item"]).annotate({ description: "block (crops, plants; the default) or item" })),
    lower: Schema.optional(path("lower half; marks `texture` as the upper half and checks the seam")),
    palette: Schema.optional(path("family palette (.palette) every colour must come from")),
  }),
  readOnly: true,
  handle: (p) => lintFile({ texture: p.texture, kind: p.kind ?? "block", lower: p.lower, palette: p.palette }).pipe(Effect.map((findings) => lintReply(p.texture, findings))),
})

const Camera = Schema.Struct({
  yaw: Schema.Finite.annotate({ description: "degrees around the scene" }),
  pitch: Schema.Finite.annotate({ description: "degrees above the horizon" }),
  distance: Schema.Finite.annotate({ description: "blocks from the centre" }),
})

const shoot = addTool({
  name: "shoot",
  title: "Screenshot a scene",
  description:
    "Screenshots a scene (.toml) in the 3D viewer, beside vanilla blocks from the user's own game, and returns the picture. " +
    "Several cameras and variants go in one labelled sheet, one row per variant. Grids, palettes and .stages files are read fresh on every call.",
  parameters: Schema.Struct({
    scene: path("scene file (.toml)"),
    out: path("PNG to write: one shot, or a labelled sheet of all of them"),
    cameras: Schema.optional(Schema.Array(Camera).annotate({ description: "angles to shoot from; default: the scene's camera" })),
    variants: Schema.optional(Schema.Array(Schema.String).annotate({ description: "variants to shoot; default: all" })),
    width: Schema.optional(Schema.Int.annotate({ description: "width of each shot in pixels; default 960" })),
    height: Schema.optional(Schema.Int.annotate({ description: "height of each shot in pixels; default 540" })),
    labels: Schema.optional(Schema.Boolean.annotate({ description: "draw plot labels; default true" })),
  }),
  readOnly: false,
  handle: (p) =>
    shootScene({
      scene: p.scene,
      out: p.out,
      cams: (p.cameras ?? []).map((c): Cam => [c.yaw, c.pitch, c.distance]),
      variants: p.variants ?? [],
      width: p.width ?? 960,
      height: p.height ?? 540,
      split: false,
      labels: p.labels ?? true,
    }).pipe(
      Effect.map((r) => ({
        text:
          `${r.written[0]!.file}: ${r.shots.length} shot${r.shots.length === 1 ? "" : "s"} (${r.variants} variant${r.variants === 1 ? "" : "s"} × ${r.cams} camera${r.cams === 1 ? "" : "s"})` +
          (r.missing.length ? `\nmissing: ${r.missing.join(", ")}` : ""),
        data: { files: r.written.map((w) => w.file), shots: r.shots, missing: r.missing },
        images: r.written.map((w) => w.image),
      })),
      Effect.provide(Browser.layer),
    ),
})

/** The authoring skill, readable without exporting it. */
const skill = Effect.forEach(
  Object.entries(SKILL_FILES),
  ([file, text]) =>
    McpServer.registerResource({
      uri: `texturescript://skill/${file}`,
      name: file,
      description: file === "SKILL.md" ? "how to draw vanilla-style 16 px textures with these tools; read this first" : `part of the authoring skill: ${file}`,
      mimeType: file.endsWith(".md") ? "text/markdown" : "text/plain",
      content: Effect.succeed(text),
    }),
  { discard: true },
)

const INSTRUCTIONS =
  "TextureScript renders Minecraft textures written as character grids, lints them against vanilla conventions, " +
  "and screenshots them in 3D beside vanilla blocks. Read the resource texturescript://skill/SKILL.md before drawing. " +
  "Relative paths are relative to the directory the server was started in."

/** The server, its tools and the skill resources, on stdin and stdout. */
export const serverLayer = Layer.effectDiscard(Effect.all([render, lint, shoot, skill], { discard: true })).pipe(
  Layer.provide(
    McpServer.layerStdio({
      name: "texturescript",
      version: pkg.version,
      instructions: INSTRUCTIONS,
      protocols: [McpProtocol.v2025_11_25, McpProtocol.v2025_06_18, McpProtocol.v2025_03_26, McpProtocol.v2024_11_05],
    }),
  ),
)

export const mcpCommand = Command.make(
  "mcp",
  {
    jar: flags.jar,
    noJar: Flag.Boolean("no-jar").pipe(Flag.withDefault(false), Flag.withDescription("show only authored blocks in shots")),
  },
  ({ jar, noJar }) =>
    Effect.gen(function* () {
      yield* Console.error(`texturescript ${pkg.version} MCP server on stdio`)
      return yield* Layer.launch(serverLayer)
    }).pipe(Effect.provide(vanillaLayer(jar, noJar)), Effect.provideService(Logger.LogToStderr, true)),
).pipe(Command.withDescription("serve render, lint and shoot to agents over MCP (stdio)"))
