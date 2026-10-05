// What the server sends the viewer: one self-contained scene, typed on both sides.

export type Vec3 = readonly [x: number, y: number, z: number]

export interface PlacedBlock {
  readonly pos: Vec3
  /** Block id, e.g. minecraft:wheat or texturescript:p0_default_7_lower. */
  readonly name: string
  readonly props: Readonly<Record<string, string>>
}

export interface Camera {
  readonly yaw?: number | undefined
  readonly pitch?: number | undefined
  readonly distance?: number | undefined
}

export interface Atlas {
  /** Width and height of the square atlas in pixels. */
  readonly size: number
  /** Texture id → [x, y, width, height] in atlas pixels. */
  readonly uv: Readonly<Record<string, readonly [number, number, number, number]>>
  /** RGBA bytes, base64. */
  readonly rgba: string
}

export interface ScenePayload {
  readonly size: Vec3
  readonly camera: Camera
  readonly labels: ReadonlyArray<{ readonly text: string; readonly pos: Vec3 }>
  /** Variant name → every block in the scene for that variant. */
  readonly variants: Readonly<Record<string, ReadonlyArray<PlacedBlock>>>
  readonly blockstates: Readonly<Record<string, unknown>>
  readonly models: Readonly<Record<string, unknown>>
  /** Block properties a bare name stands for (its blockstate's first variant). */
  readonly defaults: Readonly<Record<string, Readonly<Record<string, string>>>>
  readonly atlas: Atlas
  /** Files, blocks and models the scene asked for but could not find. */
  readonly missing: ReadonlyArray<string>
  readonly jar: string | null
}

/** Server → viewer messages over the WebSocket. */
export type ServerMessage = { readonly type: "scene"; readonly scene: ScenePayload } | { readonly type: "error"; readonly message: string }
