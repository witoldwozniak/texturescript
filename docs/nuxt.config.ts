// Served from https://witoldwozniak.github.io/texturescript/, so the deploy workflow sets
// NUXT_APP_BASE_URL=/texturescript/. Locally, the site is served from the root.
export default defineNuxtConfig({
  extends: ["docus"],
  site: {
    name: "TextureScript",
  },
  // GitHub Pages serves static files only: no MCP endpoint, and robots.txt can't live under a base path.
  mcp: { enabled: false },
  robots: { robotsTxt: false },
})
