// Compiles the single-file texturescript binary, with the viewer and the skill built in.
//
//   bun scripts/build.ts                 this machine's platform, into dist/texturescript
//   bun scripts/build.ts --all           every release target, into dist/texturescript-OS-ARCH
//
// TEXTURESCRIPT_OUT overrides the output file of a single build.
//
// chromium-bidi is only for Firefox's protocol, which Playwright never loads for Chromium.
import { $ } from "bun"

const TARGETS = ["linux-x64", "linux-arm64", "darwin-arm64", "darwin-x64", "windows-x64"]
const builds = process.argv.includes("--all")
  ? TARGETS.map((t) => ({ target: `bun-${t}`, out: `dist/texturescript-${t}` }))
  : [{ target: "bun", out: process.env.TEXTURESCRIPT_OUT ?? "dist/texturescript" }]

for (const { target, out } of builds) {
  await $`bun build src/cli/main.ts --compile --minify --target=${target} --outfile ${out} --external chromium-bidi --external ${"chromium-bidi/*"}`.quiet()
  console.log(out + (target.includes("windows") ? ".exe" : ""))
}
