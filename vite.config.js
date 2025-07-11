import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  assetsInclude: ['.mjs', '.wasm'],
  server: {
    fs: {
      allow: ['/Users/rzh/Documents/GitHub/rmbg-tool', 'src/wasm']
    }
  }
})
