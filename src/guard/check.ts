// Refuses Minecraft game files in git: exact copies, re-encodes, upscales and copied JSON.
import { Effect, FileSystem, Option, Path, Schema } from "effect"
import { createHash } from "node:crypto"
import { homedir } from "node:os"
import { GameJar } from "../services/jar.ts"
import { imageCandidates, jsonHash, vanillaImageHashes } from "./fingerprint.ts"

export type Scope = "staged" | "tree" | "history"

/** Fingerprint → game path. */
export type VanillaIndex = Record<string, string>

export class GitFailed extends Schema.TaggedError<GitFailed>()("GitFailed", {
  args: Schema.Array(Schema.String),
  stderr: Schema.String,
}) {
  override get message() {
    return `git ${this.args.join(" ")} failed: ${this.stderr.trim()}`
  }
}

const isGameJson = (name: string) => name.endsWith(".json") && (name.includes("/models/") || name.includes("/blockstates/"))

export function buildIndex(entries: Record<string, Uint8Array>): VanillaIndex {
  const index: VanillaIndex = {}
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.endsWith(".png")) {
      try {
        for (const h of vanillaImageHashes(bytes)) index[h] = name
      } catch {
        // a few game PNGs are not images we can decode; they cannot be matched either
      }
    } else if (isGameJson(name)) {
      const h = jsonHash(bytes)
      if (h) index[h] = name
    }
  }
  return index
}

export function match(label: string, bytes: Uint8Array, index: VanillaIndex): string | undefined {
  if (label.endsWith(".json")) {
    const h = jsonHash(bytes)
    return h ? index[h] : undefined
  }
  for (const h of imageCandidates(bytes)) if (index[h]) return index[h]
  return undefined
}

const cacheDir = () => `${process.env.XDG_CACHE_HOME || `${homedir()}/.cache`}/texturescript`

/** The game's fingerprints, cached per jar. Only hashes are written. */
export const loadIndex = Effect.fn("loadIndex")(function* (jar: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const games = yield* GameJar
  const stat = yield* fs.stat(jar)
  const key = createHash("sha1").update(`v1:${jar}:${Option.getOrElse(stat.mtime, () => new Date(0)).getTime()}`).digest("hex").slice(0, 16)
  const cache = path.join(cacheDir(), `vanilla-index-${key}.json`)
  if (yield* fs.exists(cache)) return JSON.parse(yield* fs.readFileString(cache)) as VanillaIndex
  const entries = yield* games.entries(jar, (n) => n.startsWith("assets/minecraft/") && (n.endsWith(".png") || isGameJson(n)))
  const index = buildIndex(entries)
  yield* fs.makeDirectory(cacheDir(), { recursive: true })
  yield* fs.writeFileString(cache, JSON.stringify(index))
  return index
})

const git = (...args: string[]) =>
  Effect.try({
    try: () => {
      const r = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" })
      if (r.exitCode !== 0) throw r.stderr.toString()
      return r.stdout as Uint8Array
    },
    catch: (stderr) => new GitFailed({ args, stderr: String(stderr) }),
  })

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
const checked = (p: string) => p.endsWith(".png") || p.endsWith(".json")

/** (label, bytes) for every PNG and JSON file in the scope. */
export const blobs = Effect.fn("blobs")(function* (scope: Scope) {
  const out: Array<readonly [string, Uint8Array]> = []
  if (scope === "staged") {
    const names = text(yield* git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z")).split("\0")
    for (const p of names.filter(checked)) out.push([p, yield* git("show", `:${p}`)])
  } else if (scope === "tree") {
    const fs = yield* FileSystem.FileSystem
    const names = text(yield* git("ls-files", "-z")).split("\0")
    for (const p of names.filter(checked)) out.push([p, yield* fs.readFile(p)])
  } else {
    const seen = new Set<string>()
    for (const line of text(yield* git("rev-list", "--all", "--objects")).split("\n")) {
      const [sha, p] = [line.slice(0, line.indexOf(" ")), line.slice(line.indexOf(" ") + 1)]
      if (!line.includes(" ") || !checked(p) || seen.has(sha)) continue
      seen.add(sha)
      out.push([`${p} (${sha.slice(0, 8)})`, yield* git("cat-file", "blob", sha)])
    }
  }
  return out
})

export interface Report {
  readonly jar: string
  readonly checked: number
  readonly hits: ReadonlyArray<readonly [string, string]>
}

export const check = Effect.fn("check")(function* (scope: Scope, jarOverride?: string) {
  const games = yield* GameJar
  const jar = yield* games.find(jarOverride)
  const index = yield* loadIndex(jar)
  const files = yield* blobs(scope)
  const hits: Array<readonly [string, string]> = []
  for (const [label, bytes] of files) {
    const m = match(label.split(" (")[0]!, bytes, index)
    if (m) hits.push([label, m])
  }
  return { jar, checked: files.length, hits } satisfies Report
})
