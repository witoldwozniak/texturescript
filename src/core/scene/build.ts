// Turns a scene file plus loaded inputs into the payload the viewer draws.
// Inputs come in through functions, so this stays free of IO.
import { decodePng } from "../png.ts"
import * as R from "../raster.ts"
import { packAtlas, toBase64 } from "./atlas.ts"
import { AUTHORED_MODELS } from "./models.ts"
import type { PlacedBlock, ScenePayload, Vec3 } from "./payload.ts"
import { normId, parseState, type SceneFile } from "./scene-file.ts"

/** Stage number → its rendered halves. */
export type StageSet = ReadonlyMap<number, { readonly lower?: R.Raster; readonly upper?: R.Raster }>

export interface SceneInputs {
  /** Bytes of a game file such as assets/minecraft/models/block/wheat.json, if there is a jar. */
  readonly vanilla: (path: string) => Uint8Array | undefined
  /** The stages behind a plot's `stages` path, as written in the scene. */
  readonly stages: (source: string) => StageSet | undefined
  readonly jar: string | null
}

/** Every `stages` path in the scene, so the caller can load them. */
export const stageSources = (scene: SceneFile): string[] => [
  ...new Set((scene.plot ?? []).flatMap((p) => (p.stages === undefined ? [] : typeof p.stages === "string" ? [p.stages] : Object.values(p.stages)))),
]

/** Variant names in first-seen order; a scene without named variants has one, "default". */
export function variantNames(scene: SceneFile): string[] {
  const names: string[] = []
  for (const p of scene.plot ?? []) if (p.stages && typeof p.stages !== "string") for (const n of Object.keys(p.stages)) if (!names.includes(n)) names.push(n)
  return names.length ? names : ["default"]
}

export function buildScene(scene: SceneFile, inputs: SceneInputs): ScenePayload {
  const blockstates: Record<string, unknown> = {}
  const models: Record<string, unknown> = { ...AUTHORED_MODELS }
  const textures = new Map<string, R.Raster>()
  const missing = new Set<string>()
  const json = (path: string) => {
    const bytes = inputs.vanilla(path)
    return bytes && JSON.parse(new TextDecoder().decode(bytes))
  }

  /** Loads a vanilla block's blockstate, models (with parents) and textures. */
  const addVanilla = (name: string): boolean => {
    if (name in blockstates) return true
    const [ns, id] = name.split(":") as [string, string]
    const state = ns === "minecraft" ? json(`assets/minecraft/blockstates/${id}.json`) : undefined
    if (!state) {
      missing.add(name)
      return false
    }
    blockstates[name] = state
    const queue = modelRefs(state)
    while (queue.length) {
      const mid = queue.pop()!
      if (mid in models) continue
      const model = json(`assets/minecraft/models/${mid.split(":")[1]}.json`)
      if (!model) {
        missing.add(mid)
        continue
      }
      models[mid] = model
      if (typeof model.parent === "string" && !model.parent.startsWith("builtin/")) queue.push(normId(model.parent))
      for (const tex of Object.values<string | { sprite: string }>(model.textures ?? {})) {
        const ref = typeof tex === "string" ? tex : tex.sprite
        if (ref.startsWith("#") || textures.has(normId(ref))) continue
        const bytes = inputs.vanilla(`assets/minecraft/textures/${normId(ref).split(":")[1]}.png`)
        if (!bytes) {
          missing.add(ref)
          continue
        }
        const image = decodePng(bytes)
        textures.set(normId(ref), R.crop(image, 0, 0, image.width, image.width)) // first animation frame
      }
    }
    return true
  }

  const names = variantNames(scene)
  const variants: Record<string, PlacedBlock[]> = Object.fromEntries(names.map((n) => [n, []]))
  // A label sits just above the plot's plants: one block of crop, or two.
  const [LABEL_SHORT, LABEL_TALL] = [2.2, 3.2]
  const labels: Array<{ text: string; pos: Vec3 }> = []
  /** Planted cells → the ground under them. */
  const cells = new Map<string, string | undefined>()
  const plant = (x: number, z: number, ground: string | undefined) => cells.set(`${x},${z}`, ground)
  for (const state of [scene.floor, scene.ground]) if (state) addVanilla(parseState(state)[0])

  for (const [i, plot] of (scene.plot ?? []).entries()) {
    const [x0, z0] = plot.at ?? [0, 2 * i]
    const label = plot.label ?? `plot ${i}`
    const ground = plot.ground ?? scene.ground
    if (plot.ground) addVanilla(parseState(plot.ground)[0])
    if (plot.block !== undefined) {
      const [name, props] = parseState(plot.block)
      if (addVanilla(name)) {
        for (const v of Object.values(variants)) {
          v.push({ pos: [x0, 1, z0], name, props })
          // Tall vanilla plants keep their upper half in the same blockstate.
          if (props.half === "lower") v.push({ pos: [x0, 2, z0], name, props: { ...props, half: "upper" } })
        }
      }
      plant(x0, z0, ground)
      labels.push({ text: label, pos: [x0 + 0.5, props.half === "lower" ? LABEL_TALL : LABEL_SHORT, z0 + 0.5] })
      continue
    }
    const perVariant: Record<string, string> = typeof plot.stages === "string" ? Object.fromEntries(names.map((n) => [n, plot.stages as string])) : { ...plot.stages }
    const parent = `texturescript:block/${plot.model ?? "crop"}`
    let width = 1
    let tall = false
    for (const [variant, source] of Object.entries(perVariant)) {
      const set = inputs.stages(source)
      if (!set) {
        missing.add(source)
        continue
      }
      const ages = plot.ages ?? [...set.keys()].sort((a, b) => a - b)
      width = Math.max(width, ages.length)
      ages.forEach((age, k) => {
        plant(x0 + k, z0, ground)
        const halves = set.get(age)
        if (!halves?.lower) missing.add(`${source} stage ${age}`)
        for (const [y, half] of [[1, "lower"], [2, "upper"]] as const) {
          const image = halves?.[half]
          if (!image) continue
          if (half === "upper") tall = true
          const key = `p${i}_${variant}_${age}_${half}`.toLowerCase().replace(/[^a-z0-9_]/g, "_")
          const [tex, mid, bid] = [`texturescript:${key}`, `texturescript:block/${key}`, `texturescript:${key}`]
          textures.set(tex, image)
          models[mid] = { parent, textures: { crop: tex, particle: tex } }
          blockstates[bid] = { variants: { "": { model: mid } } }
          variants[variant]!.push({ pos: [x0 + k, y, z0], name: bid, props: {} })
        }
      })
    }
    labels.push({ text: label, pos: [x0 + width / 2, tall ? LABEL_TALL : LABEL_SHORT, z0 + 0.5] })
  }

  // Shift to non-negative coordinates, pad for the floor, and lay floor and ground.
  const xs = [...cells.keys()].map((c) => Number(c.split(",")[0]))
  const zs = [...cells.keys()].map((c) => Number(c.split(",")[1]))
  if (!xs.length) xs.push(0), zs.push(0)
  const pad = scene.floor ? 1 : 0
  const dx = pad - Math.min(...xs)
  const dz = pad - Math.min(...zs)
  const size: Vec3 = [Math.max(...xs) - Math.min(...xs) + 1 + 2 * pad, 4, Math.max(...zs) - Math.min(...zs) + 1 + 2 * pad]
  const base: PlacedBlock[] = []
  for (let x = 0; x < size[0]; x++)
    for (let z = 0; z < size[2]; z++) {
      const key = `${x - dx},${z - dz}`
      const state = cells.has(key) ? (cells.get(key) ?? scene.floor) : scene.floor
      if (!state) continue
      const [name, props] = parseState(state)
      if (name in blockstates) base.push({ pos: [x, 0, z], name, props })
    }
  const shifted = Object.fromEntries(
    Object.entries(variants).map(([n, blocks]) => [n, [...base, ...blocks.map((b) => ({ ...b, pos: [b.pos[0] + dx, b.pos[1], b.pos[2] + dz] as Vec3 }))]]),
  )

  const defaults: Record<string, Record<string, string>> = {}
  for (const [name, state] of Object.entries(blockstates)) {
    const first = Object.keys((state as { variants?: object }).variants ?? {})[0] ?? ""
    defaults[name] = Object.fromEntries(first.split(",").filter((kv) => kv.includes("=")).map((kv) => kv.split("=", 2) as [string, string]))
  }
  const { image, uv } = packAtlas(textures)
  return {
    size, camera: scene.camera ?? {}, defaults,
    labels: labels.map((l) => ({ ...l, pos: [l.pos[0] + dx, l.pos[1], l.pos[2] + dz] as Vec3 })),
    variants: shifted, blockstates, models,
    atlas: { size: image.width, uv, rgba: toBase64(image.data) },
    missing: [...missing].sort(),
    jar: inputs.jar,
  }
}

function modelRefs(state: { variants?: Record<string, unknown>; multipart?: Array<{ apply: unknown }> }): string[] {
  const refs: string[] = []
  const take = (v: unknown) => {
    for (const m of Array.isArray(v) ? v : [v]) refs.push(normId((m as { model: string }).model))
  }
  for (const v of Object.values(state.variants ?? {})) take(v)
  for (const part of state.multipart ?? []) take(part.apply)
  return refs
}
