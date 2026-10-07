import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Deve coincidere con il nome del repository GitHub (GitHub Pages)
  base: '/Fantacalcio-serieb/',
  plugins: [react(), tailwindcss()],
})
