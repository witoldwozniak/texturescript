export default defineAppConfig({
  seo: {
    title: "TextureScript",
    description: "Author Minecraft textures as text, then judge them in 3D without launching the game.",
  },
  header: {
    title: "TextureScript",
  },
  navigation: {
    // One tab per Diátaxis section: tutorials, how-to guides, reference, explanation.
    sub: "header",
  },
  socials: {
    github: "https://github.com/witoldwozniak/texturescript",
  },
  github: {
    url: "https://github.com/witoldwozniak/texturescript",
    branch: "main",
    rootDir: "docs",
  },
})
