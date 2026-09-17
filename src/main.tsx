import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import { engine } from './audio/engineSingleton'

if (import.meta.env.DEV) {
  ;(window as unknown as { __auscultaEngine?: unknown }).__auscultaEngine = engine
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
