import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Default: best DX for local dev/CI
  // Override for GitHub Pages build:
  //   VITE_BASE=/leaflet-starter/ VITE_OUTDIR=docs npm run build
  const env = loadEnv(mode, process.cwd(), '')
  const base = process.env.VITE_BASE ?? env.VITE_BASE ?? '/'
  const outDir = process.env.VITE_OUTDIR ?? env.VITE_OUTDIR ?? 'dist'

  return {
    base,
    build: {
      outDir,
      emptyOutDir: true,
    },
  }
})
