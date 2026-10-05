// src/core must stay pure: it runs in the browser and has no file, network or process access.
import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const CORE = join(import.meta.dir, "../src/core")
const ALLOWED = [/^\.\.?\//, /^effect$/, /^fast-png$/]
const FORBIDDEN_GLOBALS = /\b(Bun|process|Deno|require)\s*[.(]|\bfetch\s*\(/

test("src/core imports only pure modules", () => {
  for (const file of readdirSync(CORE, { recursive: true }).map(String).filter((f) => f.endsWith(".ts"))) {
    const source = readFileSync(join(CORE, file), "utf8")
    for (const [, spec] of source.matchAll(/\bfrom\s+"([^"]+)"|\bimport\s*\(\s*"([^"]+)"/g)) {
      if (spec) expect({ file, spec, allowed: ALLOWED.some((re) => re.test(spec)) }).toEqual({ file, spec, allowed: true })
    }
    expect({ file, globals: source.match(FORBIDDEN_GLOBALS)?.[0] ?? null }).toEqual({ file, globals: null })
  }
})
