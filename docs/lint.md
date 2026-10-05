# Lint rules

`texturescript lint` and `texturescript stages` check each 16×16 sprite against conventions
measured on a selection of vanilla Minecraft crop and item textures. Each finding has a level:
**FAIL** (exit code 1), **WARN** (worth a look, often fine) or **OK**.

The thresholds describe vanilla, not taste. A warning means the sprite does something vanilla
textures rarely or never do; it may still be the right call.

| Rule | Level | Triggers when | Why |
|---|---|---|---|
| `size` | FAIL | the image is not 16×16 | Block and item textures are 16×16. |
| `alpha` | FAIL | any pixel is semi-transparent | Vanilla alpha is 0 or 255; the game cuts out crops at 50%, so partial alpha renders unpredictably. |
| `budget` | WARN / FAIL | more than 10 / more than 13 colours | The vanilla median is 6 colours and the maximum 13. |
| `palette` | FAIL | a colour is not a shade of `--palette` | A crop, its stages and its items share one family palette. |
| `ramp` | WARN | a hue group has more than 6 shades (without `--palette`) | Vanilla materials use 3 to 6 shades. |
| `noise` | FAIL | more than half the opaque pixels differ from all of their (3 or 4) opaque neighbours | Vanilla reaches 0.48; programmer art sits between 0.45 and 0.77. |
| `islands` | WARN | coverage ≥ 10% and more than 12 disconnected pieces | No vanilla crop has more than 12; blades should touch and overlap into a body. |
| `solid` | WARN | one shade fills a rectangle at least 5 wide and 2 tall | Vanilla crops never fill more than a 4-wide band with one shade (the pitcher plant body excepted). |
| `dither` | WARN | checkerboard fraction above 0.15 | Vanilla never dithers at 16 px. |
| `coverage` | WARN | blocks: more than 60% or less than 2% opaque | Mature vanilla crops are 26% to 54% opaque; even stage 0 has a few pixels. |
| `outline` | WARN | blocks: edge pixels darker than the interior in more than 75% of cases; items: in less than 60% | Crops have no outline (vanilla 0.46); items carry a 1 px outline in the darkest shade (0.78). |
| `light` | WARN | items: the lightest pixels sit below or right of the centre | Vanilla items are lit from the top left. A weak proxy: 5 of 19 vanilla items trip it, so don't tune pixels just to silence it. |
| `seam` | FAIL | with `--lower`: the upper half's bottom row is empty, or has opaque columns the lower half's top row lacks | The two halves of a tall plant must join. |

`stages` runs lint on every generated half and checks the seam between halves automatically.
