# TextureScript

Author Minecraft textures as text, then judge them in 3D without launching the game.

A texture is a character grid plus a palette of materials. TextureScript turns the
grid into a PNG, checks it against pixel-art rules, derives a crop's growth stages,
and opens a live 3D view that draws the result the way the game does: lit, cut out
and planted next to vanilla blocks for scale. It reloads when you save, so a person
or an agent can iterate on one texture in seconds.

**Status:** early. Built with Bun, TypeScript, Effect and
[deepslate](https://github.com/misode/deepslate).

## No game assets

This repository contains no Minecraft textures, models or other game files, and
never will. When a scene shows vanilla blocks for comparison, TextureScript reads
them at run time from the Minecraft client already installed on your machine and
keeps them in memory.

`texturescript fetch` is the one command that writes game textures to disk: the
vanilla reference examples for the authoring skill, from your own jar. It refuses to
write them anywhere git would track them. Please don't commit or publish them, or
anything traced from them.

## Install

**Binary.** Download `texturescript-OS-ARCH` from the
[releases](https://github.com/witoldwozniak/texturescript/releases), make it
executable and put it on your `PATH`. It includes the 3D viewer and the authoring
skill, and needs nothing else. Only the Linux x64 build has been tested so far.

**From source**, with [Bun](https://bun.sh):

```sh
git clone https://github.com/witoldwozniak/texturescript
cd texturescript
bun install
bun link           # puts `texturescript` on your PATH
```

`bun run build` compiles the binary into `dist/`.

**For screenshots** (`shoot`, and file names on `sheet`) TextureScript drives a
headless Chromium. It uses Google Chrome if that is installed. Otherwise, set
`TEXTURESCRIPT_CHROMIUM` to a Chromium executable, or download one with
`npx playwright-core install chromium`. `view` uses your own browser.

**Vanilla blocks** come from the newest client jar your launcher has downloaded: the
official launcher or Prism Launcher, including the Flatpak. Point at another one
with `--jar`, or pass `--no-jar` to show only your own blocks. `texturescript jar`
shows which jar is used.

## Quick start: corn

The authoring skill includes a finished corn crop: two mature grids, a palette, a
growth-stage file and a scene.

```sh
texturescript skill corn-skill          # export the skill
cd corn-skill/examples/crop

texturescript stages corn.stages out    # 8 growth stages, linted, plus out/strip.png
texturescript view corn.toml            # live 3D view in your browser
texturescript shoot corn.toml shot.png --cam 30,22,7 --cam 210,25,9
```

Leave `view` running, edit `mature/lower.grid` and save: the corn in the browser
changes in place. Keys 1 to 9 switch variants, `l` toggles labels, and the mouse
orbits and zooms.

## Commands

| command | does |
|---|---|
| `palette FAMILY.palette` | derives each material's shades from a dark and a light anchor |
| `grid SPEC.grid OUT.png` | renders a grid to PNG, a ×16 preview and ASCII |
| `lint TEXTURE.png` | checks size, colours, alpha, noise and the seam between halves |
| `stages CROP.stages OUT_DIR` | generates a crop's growth stages and lints each one |
| `view SCENE.toml` | live 3D view that updates on save |
| `shoot SCENE.toml OUT.png` | screenshots of a scene, several angles and variants in one sheet |
| `sheet OUT.png FILES…` | labelled contact sheet of upscaled textures |
| `diff RENDERED.png TARGET.png` | counts and marks the pixels that differ |
| `togrid PNG OUT.grid` | turns a PNG into an editable grid |
| `skill [OUT_DIR]` | shows or exports the authoring skill |
| `fetch` | extracts the skill's vanilla references from your jar (see above) |
| `jar` | prints the client jar in use |

`texturescript COMMAND --help` lists the flags. Most commands take `--json`.

## File formats

A **palette** file names each material with two anchors and a shade count; the
shades get one key each, darkest first:

```
material leaf    dark #266325  light #55ab2d  shades 4  keys abcd
material kernel  dark #a8741a  light #f2d158  shades 3  keys eEF
transparent .
```

A **grid** is the palette section that `palette` prints, then `grid` and 16 rows of
16 keys. A **stages** file names a crop's mature grids and maps the stage at which
each pixel appears; see [`skill/SKILL.md`](skill/SKILL.md) and
[`corn.stages`](skill/examples/crop/corn.stages).

### Scene files

A scene is TOML. Relative paths are relative to the scene file.

```toml
camera = { yaw = 30, pitch = 22, distance = 7 }   # degrees, degrees, blocks
floor = "minecraft:grass_block"                   # under the whole area
ground = "minecraft:farmland[moisture=7]"         # under each planted cell

[[plot]]
label = "corn"
stages = "corn.stages"   # a .stages file, a folder written by `stages`,
                         # or variants: { early = "a.stages", late = "b.stages" }
ages = [0, 3, 7]         # stages to plant along +x; default: all
model = "crop"           # crop (four planes, the default) or cross (two diagonals)
at = [0, 0]              # x, z of the first one

[[plot]]
label = "wheat (vanilla)"
block = "minecraft:wheat[age=7]"   # any block state from your jar
ground = "minecraft:grass_block"   # this plot's own ground
at = [4, 0]
```

Each plot has exactly one of `stages` and `block`. A `.stages` plot is compiled in
memory, so `view` follows edits to its grids, palette and maps without running
`stages`. Variants are alternatives to compare: `view` switches between them, and
`shoot` puts each in its own row. Blocks that can't be found are listed in the view
and on the command line, and left out.

## For agents

[`skill/SKILL.md`](skill/SKILL.md) is an authoring skill: how to draw crops and items
that sit next to vanilla, the measured conventions in [`skill/rules/`](skill/rules/),
and a loop of draw, render, lint and screenshot. `texturescript skill DIR` exports it.
Then `texturescript fetch --skill DIR` adds the vanilla reference grids from your
own jar.

## Development

```sh
bun install        # also enables the pre-commit hook in .githooks/
bun test
bun run typecheck
bun src/cli/main.ts --help
```

`src/core` is pure and synchronous, and also runs in the browser. `src/services`
holds the Effect services for files, the jar, the live server and the browser.
`src/cli` holds the commands, and `src/viewer` the 3D page.

The pre-commit hook runs `scripts/check-no-vanilla.ts`, which compares staged PNG
and JSON files against your Minecraft client jar and refuses copies, re-encodes,
nearest-neighbour upscales and model or blockstate JSON taken from the game. Run it
with `--tree` or `--history` to check the whole checkout or every past commit. It
needs a local jar; without one it skips.

## License

Apache License 2.0; see [LICENSE](LICENSE).

NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
