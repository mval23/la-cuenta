/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// En desarrollo, `npm run dev` atiende también las funciones de la carpeta
// api/ (en producción las corre Vercel), para no necesitar `vercel dev`.
function funcionesLocales(): Plugin {
  return {
    name: 'funciones-locales',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const ruta = req.url?.split('?')[0] ?? ''
        if (!/^\/api\/[a-z-]+$/.test(ruta)) return next()
        const modulo = await server.ssrLoadModule(`${ruta}.ts`)
        const funcion = modulo[req.method ?? 'GET'] as ((r: Request) => Promise<Response>) | undefined
        if (!funcion) {
          res.statusCode = 405
          return res.end()
        }
        const partes: Buffer[] = []
        for await (const parte of req) partes.push(parte as Buffer)
        const encabezados = new Headers()
        for (const [nombre, valor] of Object.entries(req.headers)) {
          if (typeof valor === 'string') encabezados.set(nombre, valor)
        }
        const respuesta = await funcion(
          new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: encabezados,
            body: partes.length > 0 ? Buffer.concat(partes) : undefined,
          }),
        )
        res.statusCode = respuesta.status
        respuesta.headers.forEach((valor, nombre) => res.setHeader(nombre, valor))
        res.end(Buffer.from(await respuesta.arrayBuffer()))
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Las funciones leen sus claves de process.env, igual que en Vercel.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    server: { port: 5180, strictPort: true },
    preview: { port: 5180, strictPort: true },
    plugins: [
      funcionesLocales(),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
        workbox: { navigateFallbackDenylist: [/^\/api\//] },
        manifest: {
          name: 'La Cuenta',
          short_name: 'La Cuenta',
          description: 'Crédito y cobro de la cocina',
          lang: 'es-CO',
          start_url: '/',
          display: 'standalone',
          background_color: '#f2f4f7',
          theme_color: '#f2f4f7',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    test: {
      environment: 'node',
    },
  }
})
