import { defineConfig, loadEnv } from 'vite'
import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

/**
 * Dev-only: serve netlify/functions/*.ts locally so `npm run dev` alone exercises the
 * live path (mic → /stt → Deepgram, transcript → /claude → Anthropic) with keys from
 * .env — no netlify-cli required. Production still uses the same function files.
 */
function netlifyFunctionsDev(): Plugin {
  return {
    name: 'netlify-functions-dev',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      // expose ALL .env vars (incl. non-VITE server secrets) to the function handlers
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const match = /^\/\.netlify\/functions\/(\w+)/.exec(req.url ?? '')
        if (!match) return next()
        try {
          const mod = await server.ssrLoadModule(`/netlify/functions/${match[1]}.ts`)
          const handler = mod.default as (r: Request) => Promise<Response>
          if (typeof handler !== 'function') { res.statusCode = 404; res.end('no handler'); return }

          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          })

          const response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), netlifyFunctionsDev()],
  // Honor the PORT env when the launcher assigns one (autoPort); else Vite's default.
  server: { port: process.env.PORT ? Number(process.env.PORT) : undefined },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
