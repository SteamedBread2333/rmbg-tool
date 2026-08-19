import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import copy from 'rollup-plugin-copy'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)))

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  console.log('command', command);
  return {
    base: command === 'build' ? '/rmbg-tool/' : '',
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
        allow: [root, path.join(root, 'src/wasm')]
      }
    }
  }
})
