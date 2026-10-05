// The live 3D view: draws the scene the server pushes, the way the game would.
import { BlockDefinition, BlockModel, Identifier, Structure, StructureRenderer, TextureAtlas } from "deepslate"
import { mat4, vec4 } from "gl-matrix"
import type { ScenePayload, ServerMessage } from "../core/scene/payload.ts"

// The game's directional face shade: up 1.0, down 0.5, north/south 0.8, east/west 0.6.
const light = (x: number, y: number, z: number) => Math.min(1, x * x * 0.6 + y * y * (y > 0 ? 1 : 0.5) + z * z * 0.8)

// deepslate ignores `"shade": false`; cancel our shader's shade on those quads (crops, plants).
const proto = BlockModel.prototype as unknown as { getElementMesh: (e: { shade?: boolean }, ...rest: unknown[]) => any }
const getElementMesh = proto.getElementMesh
proto.getElementMesh = function (e, ...rest) {
  const mesh = getElementMesh.call(this, e, ...rest)
  if (e.shade === false)
    for (const q of mesh.quads) {
      const n = q.normal()
      const f = light(n.x, n.y, n.z)
      q.forEach((v: { color: number[] }) => (v.color = v.color.map((c) => c / f)))
    }
  return mesh
}

const VS = `
  attribute vec4 vertPos; attribute vec2 texCoord; attribute vec4 texLimit;
  attribute vec3 vertColor; attribute vec3 normal;
  uniform mat4 mView; uniform mat4 mProj;
  varying highp vec2 vTexCoord; varying highp vec4 vTexLimit;
  varying highp vec3 vTintColor; varying highp float vLighting;
  void main(void) {
    gl_Position = mProj * mView * vertPos;
    vTexCoord = texCoord; vTexLimit = texLimit; vTintColor = vertColor;
    vec3 n = normal;
    vLighting = min(1.0, n.x * n.x * 0.6 + n.y * n.y * (n.y > 0.0 ? 1.0 : 0.5) + n.z * n.z * 0.8);
  }`
const FS = `
  precision highp float;
  varying highp vec2 vTexCoord; varying highp vec4 vTexLimit;
  varying highp vec3 vTintColor; varying highp float vLighting;
  uniform sampler2D sampler; uniform highp float pixelSize;
  void main(void) {
    vec4 t = texture2D(sampler, clamp(vTexCoord, vTexLimit.xy + vec2(0.5) * pixelSize, vTexLimit.zw - vec2(0.5) * pixelSize));
    if (t.a < 0.5) discard;  // cutout, like the game's crop layer
    gl_FragColor = vec4(min(t.rgb * vTintColor * vLighting, 1.0), 1.0);
  }`

function program(gl: WebGLRenderingContext) {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader")
    return s
  }
  const p = gl.createProgram()!
  gl.attachShader(p, shader(gl.VERTEX_SHADER, VS))
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, FS))
  gl.linkProgram(p)
  return p
}

const canvas = document.getElementById("c") as HTMLCanvasElement
const hud = document.getElementById("hud")!
const err = document.getElementById("err")!
const labelsEl = document.getElementById("labels")!
const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true })!
const params = new URLSearchParams(location.search)

let scene: ScenePayload | null = null
let renderer: StructureRenderer | null = null
let variantNames: string[] = []
let variant = params.get("variant") ?? ""
let showLabels = params.get("labels") !== "0"
const cam = { yaw: 35, pitch: 25, dist: 7 }
const camFromUrl = params.has("cam")
if (camFromUrl) {
  const [yaw, pitch, dist] = params.get("cam")!.split(",").map(Number)
  Object.assign(cam, { yaw, pitch, dist })
}

function showError(msg: string) {
  err.textContent = msg
  err.style.display = msg ? "block" : "none"
}

function atlasFrom(a: ScenePayload["atlas"]): TextureAtlas {
  const bytes = Uint8ClampedArray.from(atob(a.rgba), (c) => c.charCodeAt(0))
  const uv: Record<string, [number, number, number, number]> = {}
  for (const [id, [x, y, w, h]] of Object.entries(a.uv)) uv[Identifier.parse(id).toString()] = [x / a.size, y / a.size, (x + w) / a.size, (y + h) / a.size]
  return new TextureAtlas(new ImageData(bytes, a.size, a.size), uv)
}

function structure(): Structure {
  const s = new Structure(scene!.size as [number, number, number])
  for (const b of scene!.variants[variant] ?? []) s.addBlock(b.pos as [number, number, number], b.name, b.props as Record<string, string>)
  return s
}

function load(next: ScenePayload) {
  const first = scene === null
  scene = next
  showError(next.missing.length ? `missing: ${next.missing.join(", ")}` : "")
  variantNames = Object.keys(next.variants)
  if (!variantNames.includes(variant)) variant = variantNames[0]!
  if (first && !camFromUrl) {
    cam.yaw = next.camera.yaw ?? cam.yaw
    cam.pitch = next.camera.pitch ?? cam.pitch
    cam.dist = next.camera.distance ?? cam.dist
  }
  const defs: Record<string, BlockDefinition> = {}
  for (const [id, j] of Object.entries(next.blockstates)) defs[Identifier.parse(id).toString()] = BlockDefinition.fromJson(j as any)
  const models: Record<string, BlockModel> = {}
  for (const [id, j] of Object.entries(next.models)) models[Identifier.parse(id).toString()] = BlockModel.fromJson(j as any)
  for (const m of Object.values(models)) (m as any).flatten({ getBlockModel: (id: Identifier) => models[id.toString()] })
  const atlas = atlasFrom(next.atlas)
  const resources = {
    getBlockDefinition: (id: Identifier) => defs[id.toString()],
    getBlockModel: (id: Identifier) => models[id.toString()],
    getTextureUV: (id: Identifier) => atlas.getTextureUV(id),
    getTextureAtlas: () => atlas.getTextureAtlas(),
    getPixelSize: () => atlas.getPixelSize(),
    getBlockFlags: () => ({ opaque: false }),
    getBlockProperties: () => null,
    getDefaultBlockProperties: (id: Identifier) => next.defaults[id.toString()] ?? null,
  }
  renderer = new StructureRenderer(gl, structure(), resources as any)
  ;(renderer as any).shaderProgram = program(gl)
  resize()
  draw()
}

function view(): mat4 {
  const v = mat4.create()
  mat4.translate(v, v, [0, 0, -cam.dist])
  mat4.rotateX(v, v, (cam.pitch * Math.PI) / 180)
  mat4.rotateY(v, v, (-cam.yaw * Math.PI) / 180)
  const [x, , z] = scene!.size
  mat4.translate(v, v, [-x / 2, -1.6, -z / 2])
  return v
}

function resize() {
  const dpr = window.devicePixelRatio || 1
  canvas.width = canvas.clientWidth * dpr
  canvas.height = canvas.clientHeight * dpr
  renderer?.setViewport(0, 0, canvas.width, canvas.height)
}

function draw() {
  if (!renderer || !scene) return
  gl.clearColor(0.47, 0.65, 1, 1)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  const v = view()
  renderer.drawStructure(v)
  // Labels use the same perspective as deepslate (70° vertical field of view).
  const proj = mat4.perspective(mat4.create(), (70 * Math.PI) / 180, canvas.clientWidth / canvas.clientHeight, 0.1, 500)
  const pv = mat4.multiply(mat4.create(), proj, v)
  labelsEl.innerHTML = ""
  if (showLabels)
    for (const l of scene.labels) {
      const p = vec4.transformMat4(vec4.create(), [l.pos[0], l.pos[1], l.pos[2], 1], pv)
      if (p[3] <= 0) continue
      const el = document.createElement("div")
      el.className = "label"
      el.textContent = l.text
      el.style.left = `${((p[0] / p[3]) * 0.5 + 0.5) * canvas.clientWidth}px`
      el.style.top = `${(0.5 - (p[1] / p[3]) * 0.5) * canvas.clientHeight}px`
      labelsEl.append(el)
    }
  const names = variantNames.map((n, i) => (n === variant ? `<b>[${i + 1}] ${n}</b>` : `[${i + 1}] ${n}`)).join("  ")
  hud.innerHTML = `${names}\ndrag: orbit · wheel: zoom · 1-9/v: variant · l: labels\ncam=${cam.yaw.toFixed(0)},${cam.pitch.toFixed(0)},${cam.dist.toFixed(1)}`
  if (params.get("hud") === "0") hud.style.display = "none"
  if (!document.getElementById("ready")) {
    const ready = document.createElement("div")
    ready.id = "ready"
    document.body.append(ready)
  }
}

function setVariant(i: number) {
  if (!renderer || i < 0 || i >= variantNames.length) return
  variant = variantNames[i]!
  renderer.setStructure(structure())
  renderer.updateStructureBuffers()
  draw()
}

/** Lets a headless browser set the view for screenshots. */
Object.assign(window, {
  textureScript: {
    setCamera: (yaw: number, pitch: number, dist: number) => (Object.assign(cam, { yaw, pitch, dist }), draw()),
    setVariant: (name: string) => setVariant(variantNames.indexOf(name)),
    variants: () => [...variantNames],
  },
})

let drag: [number, number] | null = null
canvas.addEventListener("mousedown", (e) => (drag = [e.clientX, e.clientY]))
window.addEventListener("mouseup", () => (drag = null))
window.addEventListener("mousemove", (e) => {
  if (!drag) return
  cam.yaw -= (e.clientX - drag[0]) * 0.5
  cam.pitch = Math.max(-89, Math.min(89, cam.pitch + (e.clientY - drag[1]) * 0.5))
  drag = [e.clientX, e.clientY]
  requestAnimationFrame(draw)
})
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault()
    cam.dist = Math.max(1, cam.dist * Math.exp(e.deltaY / 500))
    requestAnimationFrame(draw)
  },
  { passive: false },
)
window.addEventListener("keydown", (e) => {
  if (e.key >= "1" && e.key <= "9") setVariant(Number(e.key) - 1)
  else if (e.key === "v") setVariant((variantNames.indexOf(variant) + 1) % variantNames.length)
  else if (e.key === "l") {
    showLabels = !showLabels
    draw()
  }
})
window.addEventListener("resize", () => (resize(), draw()))

// The server pushes the scene on connect and after every change; reconnect if it restarts.
function connect() {
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`)
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data) as ServerMessage
    try {
      if (msg.type === "scene") load(msg.scene)
      else showError(msg.message)
    } catch (e) {
      showError(String((e as Error)?.stack ?? e))
    }
  }
  ws.onclose = () => setTimeout(connect, 1000)
}
connect()
