import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// SCORM paketinde göreceli yollar şart (LMS kök dizin fromanyu; §30)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // WAV dosyaları public/ altından aynen kopyalanır; JS/CSS hash'li olur ama
    // manifest göreceli (./index.html) çalışır.
    assetsInlineLimit: 0,
  },
})
