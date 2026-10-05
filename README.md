# TextureScript

Author Minecraft textures as text, then judge them in 3D without launching the game.

A texture is a character grid plus a palette of materials. TextureScript turns the
grid into a PNG, checks it against pixel-art rules, derives a crop's growth stages,
and opens a live 3D view that draws the result the way the game does: lit, cut out
and planted next to vanilla blocks for scale. It reloads when you save, so a person
or an agent can iterate on one texture in seconds.

**Status:** early, under construction. Built with Bun, TypeScript, Effect and
[deepslate](https://github.com/misode/deepslate).

## No game assets

This repository contains no Minecraft textures, models or other game files, and
never will. When a scene shows vanilla blocks for comparison, TextureScript reads
them at run time from the Minecraft client already installed on your machine and
keeps them in memory. Everything it renders goes to `out/`, which git ignores.

## Development

```sh
bun install        # also enables the pre-commit hook in .githooks/
bun test
bun run typecheck
bun src/cli/main.ts --help
```

The pre-commit hook runs `scripts/check-no-vanilla.ts`, which compares staged PNG
and JSON files against your Minecraft client jar and refuses copies, re-encodes,
nearest-neighbour upscales and model or blockstate JSON taken from the game. Run it
with `--tree` or `--history` to check the whole checkout or every past commit. It
needs a local jar; without one it skips.

## License

Apache License 2.0; see [LICENSE](LICENSE).

NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
