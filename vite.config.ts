import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// SCORM paketinde göreceli yollar şart (LMS kök dizini farklı olabilir; §30)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // Görüntüler (public/assets/xray/runtime) aynen kopyalanır; yollar göreceli kalır.
    assetsInlineLimit: 0,
  },
})
