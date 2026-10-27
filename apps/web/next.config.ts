import type { NextConfig } from 'next'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Um .env só, na raiz do monorepo, para os três apps.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url))
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

const nextConfig: NextConfig = {
  // Pacotes do monorepo são TypeScript puro: o Next compila junto.
  transpilePackages: ['@nexo/agent', '@nexo/shared'],
  // Driver nativo do SQLite fica fora do bundle.
  serverExternalPackages: ['better-sqlite3'],
  agentRules: false,
}

export default nextConfig
