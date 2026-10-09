---
name: texturescript
description: Author and refine Minecraft-style 16x16 crop and item textures using character grids, shared material palettes, deterministic rendering, a live 3D view and visual critique. Use for pixel texture creation and growth-stage sequences, not Java mod implementation or general illustration.
---

# TextureScript: drawing vanilla-style Minecraft 16 px textures as an agent

You draw textures as character grids, render them with a small toolkit, and judge them by
eye at the scale the game shows them. Colours are never your decision beyond two anchors
per material; shapes are entirely yours. The conventions were measured on a selected set
of Minecraft 26.2 textures. Use them as evidence, with visual judgement for shape.

## Files in this skill

- `rules/crop.md`: conventions for crop and plant block sprites (four-plane model, sparse, no outline).
- `rules/item.md`: conventions for item sprites (flat, outlined in the darkest ramp shade, lit top-left).
- `glossary.md`: names of plant parts and what makes each read at 16 px. Use these words in critiques.
- `examples/crop/`, `examples/item/`: vanilla textures as grids (`.txt`), upscales (`_x16.png`)
  and native 16 px PNGs. Read the grid of the closest vanilla thing before drawing. They are
  listed in `examples/manifest.txt` and extracted from the user's own client jar with
  `texturescript fetch --skill SKILL_DIR`; `--check` verifies them without writing. If no jar
  is available, use the authored corn example and say that vanilla comparison was unavailable.
- `examples/crop/corn.stages`, `corn.palette`, `mature/`, `corn.toml`: a self-contained
  authored corn example, with a scene that plants it beside vanilla wheat and sunflower.
  The upper half appears at stage 5; a mod's age mapping is a separate design choice.
- `palettes/`: family palettes. One per crop family; the plant, its stages and its items all use it.

The game textures are never part of this skill and must never be committed anywhere: fetch
refuses to write them where git would track them.

## Toolkit

Run `texturescript <tool>`; `texturescript <tool> --help` lists every flag. Relative paths
in `.stages` and scene files are relative to that file. Most tools take `--json` for machine-readable output.
`texturescript skill OUT_DIR` exports this skill, without fetched textures, to a writable
directory; pass that directory to `fetch --skill`.
If you have the `texturescript` MCP tools instead of a shell, `render` (the `grid` command), `lint` and `shoot`
take the same inputs as the commands below and return their pictures to you directly;
look at them.

| tool | what | when |
|---|---|---|
| `palette FAMILY.palette --out palette.txt --swatch swatch.png` | two anchors per material, interpolated in OKLCH into 3 to 6 shades with single-letter keys | once per family; paste the output at the top of every grid. The comment lines place each material's anchors against the measured vanilla envelope (lightness range, chroma cap) and warn when outside |
| `grid SPEC.grid OUT.png` | renders a 16-row grid; writes `OUT_x16.png` and `OUT.txt`; refuses with row and column | every edit |
| `lint OUT.png [--kind item] [--lower LOWER.png] [--palette FAMILY.palette]` | measured rules; `--lower` checks the seam of a two-block upper half; `--palette` checks ramps per material instead of by hue | before calling anything done |
| `stages CROP.stages OUT_DIR [--keep]` | all growth stages from the mature grids and a stage map, with shade shifts and recolours; lints every half and writes `strip.png` | growth stages |
| `view SCENE.toml` | a live 3D view in the browser on the game's block models, beside vanilla plants; updates on every save of a grid, palette, map or the scene | every crop edit; judge density and read here, not flat |
| `shoot SCENE.toml OUT.png [--cam YAW,PITCH,DIST]... [--variant NAME]...` | screenshots of the same scene, one sheet of every camera and variant | when you cannot see the browser, and for the critic and the human |
| `sheet OUT.png FILES_OR_DIRS... [--scale N]` | a labelled contact sheet of upscaled textures | items beside vanilla items at x3; any region in doubt at x16 or more |
| `diff NEW.png OLD.png [--sheet OUT.png] [--check]` | count and mask of changed pixels; `--check` exits 1 on differences | polishing: prove a fix stayed in its region |
| `togrid PNG OUT.grid` | any PNG into a grid with lightness-ordered keys | making a new example |

## Palette

A `.palette` file has one `material NAME dark #hex light #hex shades N keys CHARS` line per
material, darkest key first, and a `transparent .` line naming the key for empty pixels.
You choose the two anchors and the shade count; the tool
refuses anchors closer than 15 OKLab lightness units. Never type an interior shade: you
cannot tell adjacent shades apart by eye, and the interpolation matches vanilla ramps
within what the eye can see. For items that need an outline darker than the plant uses,
lower that material's dark anchor and add one shade; keep the light anchor so plant and
item match.

Stage generation checks every declared material key against the exact generated family
colour, including unused keys and `--keep` overrides. Re-paste palette headers after
changing anchors; do not swap shade keys or alias opaque colours.

## Grid spec

```
palette
. transparent
a #266325
...
grid
................   (16 rows of exactly 16 characters)
```

The palette section is the output of `palette`, pasted as is; `grid` follows it. Rows 0
to 15 top to bottom, columns 0 to 15 left to right. Count characters; a wrong row width
is the most common refusal. `grid` counts the transparent key among its palette entries;
`lint` counts only colours.

Tools that name pixels print them as `(column,row)`, like `(13,6)`: x first, from the top
left. `lint` lists the pixels behind a measurement even when the rule passes; only WARN
and FAIL lines ask for attention.

## Scenes

A crop is judged on the block model, beside vanilla. Write a scene file next to the
`.stages` file; `view` and `shoot` compile the stages in memory, so there is no need to run
`stages` first. That shows the generated stages only: once you hand-edit stage grids (see
`--keep` below), point the plot at the output folder instead, or the scene keeps showing
the unedited version. A variant for each (`{ generated = "x.stages", edited = "out" }`)
shows both.

```toml
camera = { yaw = 30, pitch = 22, distance = 7 }
floor = "minecraft:grass_block"
ground = "minecraft:farmland[moisture=7]"

[[plot]]
label = "tomato"
stages = "tomato.stages"          # or a folder written by `stages`, or { a = "...", b = "..." } variants
ages = [0, 3, 7]                  # default: every stage, along +x
at = [0, 0]

[[plot]]
label = "wheat (vanilla)"
block = "minecraft:wheat[age=7]"  # read from the user's jar
at = [4, 0]
```

`at = [x, z]` places a plot's first block; each age takes the next block along +x, so
`ages = [0, 1, 2, 3]` at `[0, 0]` fills x 0 to 3. Leave one empty block between plots,
along both x and z: neighbours that touch merge into one bed, and their labels overlap.

`model = "cross"` plants on two diagonal planes (flowers, saplings) instead of the four
crop planes. Variants (`stages = { first = "a.stages", second = "b.stages" }`) are drafts to
compare: keys 1 to 9 switch between them in `view`, and `shoot` puts each in its own row.
`shoot` with no `--cam` uses the scene's camera; add two or three angles, for example
`--cam 30,22,7 --cam 120,10,5 --cam 0,60,6`, since one angle hides overlaps. Those frame
the whole scene; to judge one plant, move in (distance 3 to 5) and enlarge the shots with
`--size 900x600`. The view
renders the game's directional face shading and cutout, without biome tint or smooth
lighting. Check the final art in game.

Without a jar, `--no-jar` shows only your own blocks, and the vanilla neighbours are reported
as missing.

## The loop

1. Read the rules for the kind you are drawing and the grids of the two closest vanilla examples.
2. Write the palette, run the tool, paste the section.
3. Draw the grid. Render it. Look at `_x16.png` for shape, read `.txt` for exactness and,
   for crops, look at the scene in `view` or a `shoot` sheet for density and read.
4. Lint. Fix any FAIL. A WARN is a question, not an order.
5. Stop when it reads as the thing at game scale. Do not keep adding pixels; the model
   overlaps the sprite with itself.

Budgets that have been enough: 10 to 15 renders for a two-block plant plus a young stage, 12 for two items.

## Polishing: critic, drawer, human

The human judges by picking, not describing. So a polish pass has two agent roles:

- **Critic** looks at the render at game scale (a `shoot` sheet for crops, a `sheet --scale 3`
  strip for items) beside vanilla, measures the draft against the nearest vanilla grids
  (longest one-shade run, rows identical to another row or to their own mirror, shades per
  row, coverage per stage, connected pieces and the fraction of pixels with at most one
  neighbour, lowest opaque row) and leads with that table, then writes at most six defects,
  most important first. Each defect: file, region (rows a-b, cols c-d), what is wrong in
  plain words as botany and as pixel art, what the fix should look like in palette keys and
  shape (never literal pixels), which vanilla example shows the technique, how to check.
  Then a "leave alone" list. Use the glossary's words.
- **Drawer** (the original author, with context kept, or a fresh agent) fixes defects in
  order, one render each, and after each runs `diff` against the pre-polish render to show
  the change stayed in its region. Deviates when a fix is over-constrained and says so.
- **Human** sees before and after in the same place (one scene with a variant for each, or
  side by side on a strip) and picks. "This one" is complete feedback.

## Two-block plants and stages

Both halves share the palette and the stalk columns (7 and 8). The upper half's bottom-row
opaque columns must be a subset of the lower half's top-row opaque columns.

Stages: read the growth section of `rules/crop.md` and the wheat stage grids in
`examples/crop/` before drawing. Draw the mature stage first. Derive younger stages by
removing whole parts (a leaf, the ear, the tassel) and shortening the stalk, keeping the
stalk position and leaf attachment points. Vanilla is additive in silhouette, not in
pixels: leaf tips may move and shades shift lighter for young stages. Decide the two-block
point where the lower stalk has reached the top rows (pitcher crop: stage 3 of 5). Check
coverage climbs monotonically along a curve like wheat's (3, 6, 13, 23, 31, 41, 49, 54%).

Write a `.stages` file that names the mature grids and gives a stage map per half, a 16-row
grid where every opaque pixel carries the digit of the first stage it appears in (`.` for
transparent). Add `shift N +k` lines so young stages render k shades lighter within each
material, as vanilla's young wheat is. Shifts that have worked: eight stages `+2 +2 +1 +1`,
four stages `+2 +1`. Where a part is a different material when young (a bulb that is still
leaf, unripe fruit), add `recolour N from to` instead of hand-editing: up to stage N, key
`from` renders as key `to`. The tool refuses a map that does not label exactly the mature
pixels, renders every stage, lints each half with the seam check, and writes `strip.png`.
Example: `examples/crop/corn.stages` in this skill (corn's whole growth design, 40 lines).

Re-running into the same output directory after editing the palette, the mature grids or
the maps is normal; it overwrites the generated stages. Use a fresh directory when
removing halves or reducing the stage count: the tool refuses stale outputs and leaves
existing files intact. Stage counts are 1 to 10. Every
lower stage must have pixels; an absent upper half is normal. Shift and recolour errors are
refused before writing. Lint failures leave rendered outputs for inspection.

Where a stage needs a pixel to move rather than appear, edit that stage's grid after
generation and re-run with `--keep`, which re-renders your edited grids instead of
overwriting them; point the scene's `stages` at the output folder to see them. A kept
grid is rendered exactly as drawn: shifts and recolours are not applied to it again. Keep
the generated grid's palette section and draw with its keys, choosing the shades the stage
should show. Expect this
for every crop whose fruit sits under the leaves (root crops): recolour handles the colour
change, but maps cannot move pixels, so young stages need a neck drawn down to the soil
line by hand. A shift that collapses a ramp into one shade is reported; use +1 on
four-shade ramps. A single-block crop gives `grid lower` only.

A root crop (beetroots, carrots, potatoes, a radish), four stages, has worked like this:
label the leaves stage by stage as usual, and label one root column per plant `0`, so the
sprouts reach the soil row from the start. Add `recolour 2 r a` and so on for every root
key, so the root reads as leaf until stage 3. Shift `+2 +1`. Generate, then look at stages 0
and 1: the root column makes a tall stick, not a sprout. Redraw those two by hand as low
sprouts on rows 12 to 15 and re-run with `--keep`. Aim for coverage near beetroots'
6, 12, 34, 45%.

## What not to do

- No dithering, no per-pixel noise, no outlines on crop sprites, no black outlines on items.
- No colours outside the palette section. If you want a colour, change an anchor.
- Do not judge crop density flat. A 30% sprite is full on the model.
- Do not argue with a lint by tuning pixel counts. If a rule is wrong, say so in the log.
- Do not copy, trace or commit game textures. Fetched examples are references to read.
