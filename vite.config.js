import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import copy from 'rollup-plugin-copy'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  console.log('command', command);
  return {
    plugins: [react(), copy({
      targets: [{
        src: 'src/wasm/**/*',
        dest: 'dist/assets'
      }],
      hook: 'writeBundle'
    })],
    assetsInclude: ['.mjs', '.wasm'],
    server: {
      fs: {
        allow: ['/Users/rzh/Documents/GitHub/rmbg-tool', 'src/wasm']
      }
    }
  }
})
