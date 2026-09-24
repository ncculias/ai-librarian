import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// server settings support container/reverse-proxy deployment:
// - host 0.0.0.0 so the dev server is reachable from outside the container
// - allowedHosts for the production domain behind nginx
// - VITE_HMR_OVERLAY=false hides the dev error overlay from site visitors
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: ['ai-librarian-ai.com', 'www.ai-librarian-ai.com'],
    hmr: { overlay: process.env.VITE_HMR_OVERLAY !== 'false' },
  },
})
