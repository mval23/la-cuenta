import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import './index.css'
import { aplicarTamanoDeLetra } from './lib/letra'

registerSW({ immediate: true })

// Si se cambia el tamaño del texto en Ajustes del iPad, se nota al volver a la app.
aplicarTamanoDeLetra()
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') aplicarTamanoDeLetra()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
