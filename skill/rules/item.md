# Vanilla item sprite conventions, measured on Minecraft 26.2

Items are drawn flat (`item/generated`), seen only in the hotbar, inventory and hand. They
are NOT the crop sprite: vanilla never reuses a block texture as an item. Wheat's item is a
bundle of stalks, not stage 7. Measured on 19 vanilla farming items.

## Shape
- 16x16, binary alpha, one connected object (seeds: 3 to 4 small clusters).
- Coverage: foods and produce 27% to 55%; seeds 12% to 27%.
- The object fills a diagonal, usually bottom-left to top-right (wheat, carrot, pitcher
  pod), and leaves a 1 to 2 px margin to the edge.
- **Outline**: a one-pixel outline in the darkest shade of the object's own ramp, never
  black and never a different hue. Measured: 0.7 to 1.0 of edge pixels are darker than
  their neighbours; the outline is the darkest colour of the texture in every food item.
  Seeds have no outline (too small).
- **Light from top-left**: the lightest shades sit above and left of the darkest. Highlight
  1 to 3 px near the top-left of each form; the outline is thickest bottom-right.
- No dithering. Isolated-pixel fraction up to 0.4 is normal for items (small highlights).

## Colours
- 3 to 10 colours in 1 to 2 materials. One ramp per material, 3 to 6 shades, about 7
  OKLab-lightness units apart; hue shifts toward yellow as it lightens, like foliage.
- Items use the crop family's palette. Where the outline needs a shade darker than the
  block sprites use, the material's dark anchor is lowered and the ramp given one more
  shade; the light anchor stays so the item and the plant match.
- Examples: wheat item 6 colours from #5b6b0f to #dcbb65 (one ramp); carrot 10 colours in
  two ramps (orange #752802 to #ffc177, green #005000 to #33be30); pitcher pod 8 colours.

## Seeds
- 3 to 6 colours, 3 to 4 seed shapes of 2 to 4 px each, scattered along a diagonal, each
  with a dark side bottom-right and one light pixel top-left. Wheat seeds: 6 colours, 12%.
