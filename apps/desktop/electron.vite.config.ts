import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

// Pacotes do monorepo são TypeScript-fonte: precisam ser empacotados, não externalizados.
const workspacePackages = ['@sharescreen/shared', '@sharescreen/ui']

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: workspacePackages },
    },
  },
  preload: {
    // Preload roda com sandbox: tudo (exceto 'electron') precisa estar no bundle.
    build: {
      externalizeDeps: { exclude: workspacePackages },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      minify: true,
      rolldownOptions: {
        input: {
          pill: resolve(__dirname, 'src/renderer/pill/index.html'),
          panel: resolve(__dirname, 'src/renderer/panel/index.html'),
          picker: resolve(__dirname, 'src/renderer/picker/index.html'),
          people: resolve(__dirname, 'src/renderer/people/index.html'),
          chat: resolve(__dirname, 'src/renderer/chat/index.html'),
          viewer: resolve(__dirname, 'src/renderer/viewer/index.html'),
        },
      },
    },
  },
})
