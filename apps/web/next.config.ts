import type { NextConfig } from 'next'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Um .env só, na raiz do monorepo, para os três apps.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url))
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

const nextConfig: NextConfig = {
  // Pacotes do monorepo são TypeScript puro: o Next compila junto.
  transpilePackages: ['@nexo/agent', '@nexo/shared', '@nexo/tickets-service'],
  // Driver do SQLite/Turso tem binário nativo: fica fora do bundle.
  serverExternalPackages: ['@libsql/client', 'libsql'],
  agentRules: false,
  poweredByHeader: false,
  // Cabeçalhos básicos de segurança em todas as rotas.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
