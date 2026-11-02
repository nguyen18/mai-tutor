import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Mai offline (src/lib/offline) runs the functions' shared code from ../supabase/functions/_shared.
  server: { fs: { allow: ['..'] } },
  worker: { format: 'es' },
})
