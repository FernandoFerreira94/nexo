import { fileURLToPath } from 'node:url'

/**
 * Arquivo do banco quando o serviço roda sozinho (`pnpm dev`, `db:setup`): <raiz>/data/tickets.db.
 * Fica fora de `client.ts` de propósito: o app web importa o client (modo embutido), e o bundler do
 * Next trata `new URL(..., import.meta.url)` como asset, o que quebrava as páginas em produção.
 */
export const DEFAULT_DB_PATH = fileURLToPath(
  new URL('../../../../data/tickets.db', import.meta.url),
)
