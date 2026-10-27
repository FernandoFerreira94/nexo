import { defineConfig } from '@playwright/test'

/**
 * Teste ponta a ponta com o modelo mock (sem chave, sem custo).
 * Sobe o serviço de chamados e o app em portas próprias, com bancos separados.
 */
const env = {
  LLM_PROVIDER: 'mock',
  AUTH_SECRET: 'segredo-e2e',
  TICKETS_SERVICE_TOKEN: 'token-e2e',
  TICKETS_SERVICE_PORT: '4110',
  TICKETS_SERVICE_URL: 'http://localhost:4110',
  TICKETS_DB_PATH: `${process.cwd()}/data/e2e-tickets.db`,
  APP_DB_PATH: `${process.cwd()}/data/e2e-app.db`,
}

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3100' },
  webServer: [
    {
      command:
        'pnpm --filter @nexo/tickets-service db:reset && pnpm --filter @nexo/tickets-service start',
      url: 'http://localhost:4110/health',
      env,
      reuseExistingServer: false,
    },
    {
      command:
        'pnpm --filter @nexo/web db:reset && pnpm --filter @nexo/web exec next dev --port 3100',
      url: 'http://localhost:3100/login',
      env,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
