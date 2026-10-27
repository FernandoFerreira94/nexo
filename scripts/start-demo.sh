#!/bin/sh
# Sobe a demo num processo só: cria os bancos, liga o serviço de chamados por dentro
# e o app web na porta pública. Os bancos são recriados a cada deploy (dados de exemplo).
set -e
pnpm db:setup
pnpm --filter @nexo/tickets-service start &
exec pnpm --filter @nexo/web exec next start --port "${PORT:-3000}"
