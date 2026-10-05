// The skill's authored files, embedded so the single binary can export them.
// tests/skill.test.ts checks this list against the files in skill/.
import cornPalette from "../../skill/examples/crop/corn.palette" with { type: "text" }
import cornStages from "../../skill/examples/crop/corn.stages" with { type: "text" }
import cornScene from "../../skill/examples/crop/corn.toml" with { type: "text" }
import cornLower from "../../skill/examples/crop/mature/lower.grid" with { type: "text" }
import cornUpper from "../../skill/examples/crop/mature/upper.grid" with { type: "text" }
import manifest from "../../skill/examples/manifest.txt" with { type: "text" }
import glossary from "../../skill/glossary.md" with { type: "text" }
import familyCorn from "../../skill/palettes/corn.palette" with { type: "text" }
import cropRules from "../../skill/rules/crop.md" with { type: "text" }
import itemRules from "../../skill/rules/item.md" with { type: "text" }
import skill from "../../skill/SKILL.md" with { type: "text" }

export const SKILL_FILES: Readonly<Record<string, string>> = {
  "SKILL.md": skill,
  "glossary.md": glossary,
  "rules/crop.md": cropRules,
  "rules/item.md": itemRules,
  "palettes/corn.palette": familyCorn,
  "examples/manifest.txt": manifest,
  "examples/crop/corn.palette": cornPalette,
  "examples/crop/corn.stages": cornStages,
  "examples/crop/corn.toml": cornScene,
  "examples/crop/mature/lower.grid": cornLower,
  "examples/crop/mature/upper.grid": cornUpper,
}
