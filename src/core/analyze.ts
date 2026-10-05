// Pixel statistics the lint rules are built on. Everything comes from the pixel array.
import { pyRound, hsv } from "./py.ts"
import type { Raster } from "./raster.ts"

const linear = (c: number) => {
  c /= 255.0
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** CIE L* in 0..100. */
export function lstar(r: number, g: number, b: number): number {
  const y = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  const f = y > 0.008856 ? y ** (1 / 3) : 7.787 * y + 16 / 116
  return 116 * f - 16
}

export interface Ramp {
  /** #rrggbb, darkest first. */
  readonly colors: ReadonlyArray<string>
  /** A low-saturation group: greys and near-grey browns. */
  readonly neutral: boolean
}

export interface Stats {
  readonly width: number
  readonly height: number
  readonly opaque: number
  readonly coverage: number
  readonly semiTransparent: number
  readonly colors: number
  readonly ramps: ReadonlyArray<Ramp>
  /** Share of edge pixels darker than their opaque neighbours; undefined without an interior. */
  readonly edgeDarker: number | undefined
  readonly lightDir: string | undefined
  /** Opaque pixels that differ from all of at least 3 opaque neighbours. */
  readonly isolated: number
  readonly isolatedAt: ReadonlyArray<readonly [x: number, y: number]>
  /** Largest one-colour rectangle at least 5 wide and 2 tall: [w, h, x, y]. */
  readonly solidBlock: readonly [number, number, number, number] | undefined
  readonly islands: number
  readonly thin: number
  readonly checker: number
}

type Rgb = readonly [number, number, number]
const hex = ([r, g, b]: Rgb) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")
const L = (c: Rgb) => lstar(c[0], c[1], c[2])
const H = (c: Rgb) => hsv(c[0], c[1], c[2])
const sortBy = <T>(xs: T[], key: (x: T) => number) => xs.map((x, i) => [x, key(x), i] as const).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([x]) => x)

/** Groups colours into materials by hue gaps (neutrals apart), each darkest first. */
export function clusterRamps(colors: Rgb[], hueGap = 28.0, neutralSat = 0.14): Ramp[] {
  const neutral = colors.filter((c) => H(c)[1] < neutralSat)
  const chroma = sortBy(colors.filter((c) => H(c)[1] >= neutralSat), (c) => H(c)[0])
  const clusters: Rgb[][] = []
  if (chroma.length) {
    const hues = chroma.map((c) => H(c)[0])
    const n = chroma.length
    const gaps = hues.map((h, i) => (((hues[(i + 1) % n]! - h) % 360.0) + 360.0) % 360.0)
    let widest = 0
    for (let i = 1; i < n; i++) if (gaps[i]! > gaps[widest]!) widest = i
    const start = (widest + 1) % n
    const order = Array.from({ length: n }, (_, k) => (start + k) % n)
    let current: Rgb[] = [chroma[order[0]!]!]
    for (let k = 1; k < n; k++) {
      if (gaps[order[k - 1]!]! > hueGap) {
        clusters.push(current)
        current = []
      }
      current.push(chroma[order[k]!]!)
    }
    clusters.push(current)
  }
  const groups: Array<[boolean, Rgb[]]> = [...clusters.map((c) => [false, c] as [boolean, Rgb[]]), ...(neutral.length ? [[true, neutral] as [boolean, Rgb[]]] : [])]
  const ramps = groups.map(([isNeutral, group]) => ({ colors: sortBy(group, L).map(hex), neutral: isNeutral }))
  return sortBy(ramps, (r) => -r.colors.length)
}

export function analyze(image: Raster): Stats {
  const { width: w, height: h, data } = image
  // Opaque pixels in row-major order, as the prototype's dict iterated them.
  const op = new Map<number, Rgb>()
  const key = (x: number, y: number) => y * 100000 + x
  const pos = (k: number) => [k % 100000, Math.floor(k / 100000)] as const
  let semi = 0
  const colorOrder = new Map<string, Rgb>()
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const a = data[i + 3]!
      if (a > 0 && a < 255) semi++
      if (a > 0) {
        const c: Rgb = [data[i]!, data[i + 1]!, data[i + 2]!]
        op.set(key(x, y), c)
        if (!colorOrder.has(c.join())) colorOrder.set(c.join(), c)
      }
    }
  const colors = [...colorOrder.values()]
  const base = {
    width: w, height: h, opaque: op.size, coverage: pyRound(op.size / (w * h), 3), semiTransparent: semi, colors: colors.length,
  }
  if (op.size === 0)
    return { ...base, ramps: [], edgeDarker: undefined, lightDir: undefined, isolated: 0.0, isolatedAt: [], solidBlock: undefined, islands: 0, thin: 0.0, checker: 0.0 }

  const same = (a: Rgb | undefined, b: Rgb) => a !== undefined && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
  const at = (x: number, y: number) => op.get(key(x, y))
  const has = (x: number, y: number) => op.has(key(x, y))
  const n4 = (x: number, y: number) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const
  const nd = (x: number, y: number) => [[x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]] as const

  // Edges and outline.
  const edge: number[] = []
  const interior: number[] = []
  for (const k of op.keys()) {
    const [x, y] = pos(k)
    if (n4(x, y).some(([a, b]) => !has(a, b))) edge.push(k)
    else interior.push(k)
  }
  const Lp = new Map([...op].map(([k, c]) => [k, L(c)]))
  let edgeDarker: number | undefined
  if (edge.length && interior.length) {
    let darker = 0
    let judged = 0
    for (const k of edge) {
      const [x, y] = pos(k)
      const ns = n4(x, y).filter(([a, b]) => has(a, b)).map(([a, b]) => Lp.get(key(a, b))!)
      if (ns.length) {
        judged++
        if (Lp.get(k)! < ns.reduce((s, v) => s + v, 0) / ns.length - 0.5) darker++
      }
    }
    edgeDarker = judged ? pyRound(darker / judged, 2) : undefined
  }

  // Light direction: centroid of the lightest colours (at least 3 px) against the sprite's.
  const lightQ: number[] = []
  for (const c of sortBy(colors, (c) => -L(c))) {
    for (const [k, cc] of op) if (same(cc, c)) lightQ.push(k)
    if (lightQ.length >= 3) break
  }
  const mean = (ks: number[], i: 0 | 1) => ks.reduce((s, k) => s + pos(k)[i], 0) / ks.length
  const all = [...op.keys()]
  const dx = mean(lightQ, 0) - mean(all, 0)
  const dy = mean(lightQ, 1) - mean(all, 1)
  let lightDir: string
  if (Math.hypot(dx, dy) < 0.5) lightDir = "flat"
  else {
    const v = dy < -0.5 ? "top" : dy > 0.5 ? "bottom" : ""
    const hz = dx < -0.5 ? "left" : dx > 0.5 ? "right" : ""
    lightDir = [v, hz].filter(Boolean).join("-") || "centre"
  }

  // Solid one-colour rectangles at least 5 wide and 2 tall.
  let solidBlock: [number, number, number, number] | undefined
  for (const [k, c] of op) {
    const [x0, y0] = pos(k)
    let bh = 0
    while ([0, 1, 2, 3, 4].every((i) => same(at(x0 + i, y0 + bh), c))) bh++
    if (bh >= 2) {
      let ww = 5
      while (Array.from({ length: bh }, (_, j) => j).every((j) => same(at(x0 + ww, y0 + j), c))) ww++
      if (!solidBlock || ww * bh > solidBlock[0] * solidBlock[1]) solidBlock = [ww, bh, x0, y0]
    }
  }

  // Connectivity.
  const seen = new Set<number>()
  let islands = 0
  for (const s of op.keys()) {
    if (seen.has(s)) continue
    islands++
    const stack = [s]
    while (stack.length) {
      const c = stack.pop()!
      if (seen.has(c)) continue
      seen.add(c)
      const [x, y] = pos(c)
      for (const [a, b] of n4(x, y)) if (has(a, b) && !seen.has(key(a, b))) stack.push(key(a, b))
    }
  }
  const thin = pyRound(all.filter((k) => n4(...pos(k)).filter(([a, b]) => has(a, b)).length <= 1).length / op.size, 2)

  // Noise and dither.
  let isolated = 0
  let checker = 0
  const isolatedAt: Array<readonly [number, number]> = []
  for (const [k, c] of op) {
    const [x, y] = pos(k)
    const around = n4(x, y).filter(([a, b]) => has(a, b)).map(([a, b]) => at(a, b)!)
    if (around.length >= 3 && around.every((n) => !same(n, c))) {
      isolated++
      isolatedAt.push([x, y])
      if (nd(x, y).filter(([a, b]) => same(at(a, b), c)).length >= 2) checker++
    }
  }
  return {
    ...base, ramps: clusterRamps(colors), edgeDarker, lightDir, isolated: pyRound(isolated / op.size, 3), isolatedAt, solidBlock, islands, thin,
    checker: pyRound(checker / op.size, 3),
  }
}
