# Imagem única para a demo: serviço de chamados (interno, porta 4010) + app web (porta $PORT).
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @nexo/web build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "scripts/start-demo.sh"]
