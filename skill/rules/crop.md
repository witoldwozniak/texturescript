# Vanilla crop sprite conventions, measured on Minecraft 26.2

These were measured on the game's own textures, not assumed. A lint command checks most of them.

## Pixels
- 16x16. Alpha is binary: a pixel is fully opaque or fully transparent, never in between.
- Crop sprites are sparse. A mature crop is 26% to 54% opaque; stage 0 is a handful of pixels.
- The block model draws the sprite as four vertical planes in a hash pattern, so the sprite overlaps itself from most angles. One-pixel stalks read fine in game.
- The bottom row is the soil line. Roots, bulbs, stems and the lowest sprout pixels touch row 15; a plant that stops at row 14 floats in game.
- Density by grammar, mature: stalk plants 22 to 36% (sunflower, pitcher, corn), cereal clumps 44 to 54% (wheat), root crops 32 to 45% (potatoes, carrots, beetroots). "30% looks full" is a stalk-plant measurement; a root crop at 30% reads thin beside carrots.
- Judge density on the model, not the flat sprite: `texturescript view` and `shoot` render it on the real model. Measured in game, a 30%-coverage sprite looks as full as a 43% one. Do not add pixels because the flat sprite looks thin.
- Two grammars. **Stalk plants** (corn, sunflower, tomato, pitcher): one stalk 1 or 2 pixels wide, vertical, centred at columns 7 and 8; leaves are 2-pixel-thick diagonal stepped runs off the stalk. **Cereal clumps** (wheat, rice): five or six 1-pixel vertical tillers spread across the width from a shared base, with 2-pixel stepped blades only on the few leaves that leave a tiller; a 1-pixel tiller is not a thin leaf. **Root crops** (beetroots, carrots, potatoes, onion): three plants across the width, a leaf mass or a fan of upright leaves on rows 2 to 11, and the root or bulb top in its own ramp on rows 12 to 15, absent until stage 2 or 3. Heads, ears and fruit are 2 to 3 pixel blobs. Read the wheat grids for the clump grammar, sunflower or corn for the stalk grammar, beetroots and carrots for the root grammar; do not draw one as another.
- Fruit gets its own ramp (beetroot: 3 reds beside 4 greens; sweet berries likewise). A fruit blob has its light shade top-left and one pixel of the darkest leaf shade where it meets the stem. Ripening is a shade shift or a recolour of the fruit pixels only.
- A stalk or vine may be its own material (olive, 3 shades) or reuse leaf shades. Two green materials will trip the ramp lint's hue clustering; pass the palette file to the lint (`--palette`) and it checks materials instead.
- No outlines. Crop sprite edges are no darker than their interiors. (Items have outlines; blocks don't.)
- No dithering, no per-pixel noise. Each shade is used in small solid clusters, never a flat slab: no vanilla crop fills a one-shade rectangle 5 wide and 2 tall (lint warns). Three plants at the same rows with the same shade band merge into one bar on the model; stagger their heights. The opposite failure is confetti: a mature vanilla crop is 1 to 12 connected pieces with most pixels in solid 2x2 groups (potatoes 58%, carrots 78%); blades touch and overlap into a body and only the tips separate (lint warns above 12 pieces).
- Light is not enforced on crops beyond "lighter shades higher up the plant".

## Colours
- A texture carries 6 to 13 colours in 1 to 3 materials. Each material is a ramp of 3 to 6 shades, adjacent shades about 7 OKLab-lightness units apart.
- Produce, grain, straw and bulb anchors, measured on 39 warm vanilla ramps: dark L 21 to 77, light L 41 to 93, chroma never above 19 (foliage never above 24). Warm materials also go yellower as they lighten (carrot 41° to 70°, golden carrot 59° to 111°). A red or gold that "pops" is above vanilla chroma; the palette tool prints each material's anchors against these envelopes and warns when one is outside.
- Vanilla foliage anchors: darkest shade around OKLab lightness 45, lightest around 66; chroma 11 to 18. Lighter shades are yellower and more saturated; the darkest shade is dull. Example vanilla crop-leaf ramp: #266325 to #55ab2d. Ripe wheat gold: #5b6b0f to #dcbb65.
- One palette per crop family. Every stage, both halves and the items use the same shades.

## Two-block plants
- Both halves share the palette. The stalk sits at the same columns in both.
- Seam rule: every opaque column in the upper texture's bottom row must also be opaque in the lower texture's top row, so the plant connects. Side tillers may cross the seam too; the rule is per column, not per stalk.
- Seam shade: the upper's bottom row uses the same shade as the lower's top row (corn and sunflower do), so the stalk does not step in colour at the block boundary.
- Coverage is per texture. Measured mature halves: pitcher crop 4 bottom 32%, top 47%; sunflower bottom 22%, top 12%. Either half may be the denser one; a half as low as 12% is fine when the other carries the plant.

## Growth (measured on wheat 0-7, pitcher crop 1-4, beetroots, carrots, potatoes)
- Stage counts: wheat 8 textures, pitcher crop 5 (two-block from stage 3 of 5), beetroots, carrots and potatoes 4.
- Wheat coverage by stage: 3, 6, 13, 23, 31, 41, 49, 54%. Roughly doubling early, then +8% a stage.
- Four-stage coverage: beetroots 6, 12, 34, 45%; carrots 7, 16, 32, 43%; potatoes 6, 10, 18, 32%. Their stage 0 to 2 grids are in the examples: sprouts sit on row 15, stage 1 is a few leaflets, stage 2 the leaf mass with no root showing. Stage 0 is a sprout, stage 1 a small plant, stage 2 most of the mature silhouette without fruit, stage 3 mature.
- Growth is additive in shape but not pixel-exact: 10 to 15% of a stage's pixels move in the next stage (a leaf tip re-angled, a stalk re-shaded). Pitcher crop redraws its lower half once (stage 2 to 3 loses pixels) when the plant changes character.
- Colour changes every stage. Wheat recolours most of its retained pixels between stages (green to gold); young stages use the mid and light shades, not the dark bottom of the ramp. A young sprout is bright.
- So: keep the stalk position and the leaf attachment points across stages; let leaf tips move, let shades shift upward for young stages, and let ripening recolour. "Additive" means the silhouette grows, not that pixels are frozen.
- Ears appear in the last two or three stages; the tassel last.
