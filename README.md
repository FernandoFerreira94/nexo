# Nexo Assist

Agent de atendimento em chat para o service desk de TI da Nexo + console do analista.

## Como rodar

Pré-requisitos: Node 22+ e pnpm 10+.

```bash
cp .env.example .env
pnpm i && pnpm db:setup && pnpm dev
```

- Chat do funcionário: http://localhost:3000
- Serviço de chamados (legado simulado): http://localhost:4010

Sem chave de LLM o projeto roda em `LLM_PROVIDER=mock`.

## Qualidade

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Documentação: [docs/DECISOES.md](docs/DECISOES.md) · [docs/ESTUDO.md](docs/ESTUDO.md)
