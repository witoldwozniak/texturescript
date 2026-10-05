// Python number semantics the prototype's messages depend on, so output matches it exactly.

/** Python's round(x, digits): exact binary value, halves to even. */
export function pyRound(x: number, digits = 0): number {
  if (!Number.isFinite(x)) return x
  const s = Math.abs(x).toFixed(Math.min(100, digits + 30))
  const [int, frac = ""] = s.split(".")
  const keep = frac.slice(0, digits)
  const rest = frac.slice(digits)
  const last = Number((digits ? keep : int!).slice(-1))
  const up = rest[0]! > "5" || (rest[0] === "5" && (/[1-9]/.test(rest.slice(1)) || last % 2 === 1))
  let value = Number(`${int}.${keep || "0"}`)
  if (up) value += 10 ** -digits
  value = Number(value.toFixed(digits))
  return x < 0 ? -value : value
}

/** Python's str() of a float: whole numbers keep ".0". */
export const pyFloat = (x: number) => (Number.isInteger(x) ? `${x}.0` : String(x))

/** Python's f"{x:.0%}". */
export const pyPercent = (x: number) => `${pyRound(x * 100)}%`

/** colorsys.rgb_to_hsv on 8-bit channels; hue in degrees. */
export function hsv(r8: number, g8: number, b8: number): readonly [h: number, s: number, v: number] {
  const [r, g, b] = [r8 / 255, g8 / 255, b8 / 255]
  const maxc = Math.max(r, g, b)
  const minc = Math.min(r, g, b)
  if (minc === maxc) return [0, 0, maxc]
  const range = maxc - minc
  const s = range / maxc
  const rc = (maxc - r) / range
  const gc = (maxc - g) / range
  const bc = (maxc - b) / range
  const h = r === maxc ? bc - gc : g === maxc ? 2.0 + rc - bc : 4.0 + gc - rc
  return [((((h / 6.0) % 1.0) + 1.0) % 1.0) * 360.0, s, maxc]
}
