// Block models for authored plants, so a scene of our own textures needs no game files.
// Same element layout as vanilla's crop and cross models.

const plane = (axis: "x" | "z", at: number, flip: boolean) => {
  const [a, b] = axis === "x" ? ["west", "east"] : ["north", "south"]
  const fwd = [0, 0, 16, 16]
  const rev = [16, 0, 0, 16]
  const [from, to] = axis === "x" ? [[at, -1, 0], [at, 15, 16]] : [[0, -1, at], [16, 15, at]]
  return {
    from, to, shade: false,
    faces: { [a!]: { uv: flip ? rev : fwd, texture: "#crop" }, [b!]: { uv: flip ? fwd : rev, texture: "#crop" } },
  }
}

const diagonal = (angle: number) => ({
  from: [0.8, 0, 8], to: [15.2, 16, 8], shade: false,
  rotation: { origin: [8, 8, 8], axis: "y", angle, rescale: true },
  faces: { north: { uv: [0, 0, 16, 16], texture: "#crop" }, south: { uv: [0, 0, 16, 16], texture: "#crop" } },
})

export const AUTHORED_MODELS: Readonly<Record<string, unknown>> = {
  "texturescript:block/crop": {
    ambientocclusion: false,
    elements: [plane("x", 4, false), plane("x", 12, true), plane("z", 4, false), plane("z", 12, true)],
  },
  "texturescript:block/cross": { ambientocclusion: false, elements: [diagonal(45), diagonal(-45)] },
}
