---
seo:
  title: TextureScript
  description: Author Minecraft textures as text, then judge them in 3D without launching the game.
---

::u-page-hero
#title
Minecraft textures, written as text

#description
A texture is a character grid plus a palette of materials. TextureScript renders it, checks it
against conventions measured on vanilla textures, derives a crop's growth stages and shows the
result in a live 3D view, planted beside vanilla blocks. A person or an agent can iterate on one
texture in seconds.

#links
  :::u-button
  ---
  size: xl
  to: /tutorials/first-texture
  trailing-icon: i-lucide-arrow-right
  ---
  Draw your first texture
  :::

  :::u-button
  ---
  color: neutral
  icon: i-simple-icons-github
  size: xl
  to: https://github.com/witoldwozniak/texturescript
  variant: outline
  ---
  GitHub
  :::
::

::u-page-section
#title
How these docs are organised

#description
The documentation follows [Diátaxis](https://diataxis.fr): four kinds of page for four different needs.

#features
  :::u-page-feature
  ---
  icon: i-lucide-graduation-cap
  to: /tutorials/first-texture
  ---
  #title
  Tutorials

  #description
  Lessons you follow from start to finish. Start here if you have never used TextureScript.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-wrench
  to: /how-to/install
  ---
  #title
  How-to guides

  #description
  Recipes for a specific job: installing, comparing with vanilla, connecting an agent, hand-editing a stage.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-book-open
  to: /reference/commands
  ---
  #title
  Reference

  #description
  Every command, flag, file format, lint rule and MCP tool, described exactly.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-lightbulb
  to: /explanation/textures-as-text
  ---
  #title
  Explanation

  #description
  Why TextureScript works the way it does: text grids, two-anchor palettes, measured conventions, no game assets.
  :::
::
