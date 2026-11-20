import './lib/renameStorage.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The fonts ship with the app (they came from Google Fonts until 2026-11-19), so they work offline.
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/playpen-sans'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './lib/pwa'

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
