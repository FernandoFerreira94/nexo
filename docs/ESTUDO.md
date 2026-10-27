# Guia de estudo do Nexo Assist

Para a entrevista: onde fica cada coisa, como uma mensagem atravessa o sistema, as perguntas
prováveis com resposta, e onde mexer quando pedirem uma alteração ao vivo.

## 1. Mapa do código

**packages/shared** (regras e tipos usados por todos)

- `src/schemas/ticket.ts`: chamado, tipos (INC/REQ), categorias, prioridades, status e os rótulos em português.
- `src/schemas/conversation.ts`: conversa, intenções, rascunho, cartões, trace e os eventos do streaming.
- `src/rules/priority.ts`: `classifyPriority`, que decide a prioridade a partir dos sinais.
- `src/rules/sla.ts`: horário útil (8h–18h, seg–sex), prazo por prioridade, `computeDueAt`.
- `src/rules/ticket-rules.ts`: `isOverdue` (vencido) e `canReopen` (janela de 7 dias).
- `src/seed-users.ts`: usuários de demonstração.

**apps/tickets-service** (o "legado")

- `src/app.ts`: rotas HTTP (listar, detalhar, criar, atualizar, transferir), token, caos e erros.
- `src/domain/tickets.ts`: regras do serviço: dono do chamado, numeração, comentário, reabertura.
- `src/chaos.ts`: falhas simuladas (taxa de erro e janela de queda).
- `src/idempotency.ts`: mesma Idempotency-Key devolve a mesma resposta, sem duplicar.
- `src/db/seed.ts`: os 8 chamados de exemplo, com datas relativas a agora.

**packages/agent** (o assistente)

- `src/run-turn.ts`: **o coração**. Os 5 passos de um turno e a montagem do trace.
- `src/understanding.ts`: o passo "entender" com três motores: LLM, Jev e mock.
- `src/tools.ts`: as tools, quais valem para cada intenção (`TOOLS_BY_INTENT`) e o registro das ações.
- `src/prompts.ts`: todos os textos enviados ao modelo e as respostas fixas.
- `src/rules/`: escopo, confiança, transferência, duplicidade e limite de mensagens.
- `src/knowledge/`: os 8 artigos e a busca por palavras-chave.
- `src/tickets-client/`: cliente HTTP com timeout, retry e circuit breaker.
- `src/llm/model.ts`: escolhe o modelo (OpenRouter ou mock). `mock-model.ts` é o modelo roteirizado.
- `src/config.ts`: lê e valida o `.env`.

**apps/web** (Next.js)

- `src/server/chat.ts`: recebe a mensagem, decide se chama o agent, salva resposta, trace e rascunho.
- `src/server/conversations.ts`: regras das conversas (retomar, transferir, assumir, devolver, encerrar, rascunhos).
- `src/server/drafts.ts`: **o único lugar que grava no sistema de chamados** (botão Confirmar).
- `src/server/session.ts`: cookie assinado com HMAC. `src/server/http.ts`: usuário da sessão, erros HTTP, rate limit, NDJSON.
- `src/server/db/`: banco do app (users, conversations, messages, decision_traces, drafts).
- `src/app/api/`: rotas finas (validam com Zod e chamam `server/`).
- `src/components/chat/`: chat, cartões e o painel "Como decidi". `src/components/console/`: console do analista.
- `src/components/ui/`: componentes shadcn/ui (botão, card, badge, abas, avatar, select, menu, tooltip…).
- `src/components/brand/`: logo, splash de entrada, avatar com iniciais e menu do usuário.
- `src/app/globals.css`: **o sistema de design**: tokens de cor, raios e a escala tipográfica.
- `src/app/login/`: login de demonstração (perfil + pessoa, sem senha).

**evals** e **e2e**: cenários de avaliação e teste Playwright.

## 2. Fluxo de uma mensagem

1. A Ana digita e clica Enviar. `chat-view.tsx` faz `POST /api/chat` e lê a resposta em streaming (`lib/stream.ts`).
2. `app/api/chat/route.ts` pega o usuário da sessão, aplica o rate limit, valida o texto com Zod.
3. `server/chat.ts` (`handleEmployeeMessage`) busca a conversa ativa e salva a mensagem. Se a conversa está com analista, **para aqui** (o agent não responde). Confere o limite de 30 mensagens.
4. `runTurn` (`packages/agent/src/run-turn.ts`):
   1. `checkScope`: RH, financeiro ou facilities respondem por template, sem modelo.
   2. `decision.understand`: intenção, confiança, crítico (LLM com saída estruturada, ou Jev).
   3. `computeConfidence` + `decideHandoff`: transfere se pedido, crítico ou confiança < 0,6.
   4. `streamText` com as tools da intenção. Cada tool emite "consultando…" e anota a ação no trace.
   5. Pós-regras: vencido gera o botão de analista, falha gera aviso, e o trace é montado com tokens e custo.
5. Os eventos chegam à tela como linhas JSON: ação, pedaço de texto, cartão, botões, trace.
6. `server/chat.ts` salva a resposta, o trace (`decision_traces`), o rascunho e, se for o caso, a transferência.
7. Se houver rascunho, a Ana clica **Confirmar**: `POST /api/drafts/:id/confirm`, que confere dono e versão e chama o serviço com `Idempotency-Key`.

## 3. Perguntas prováveis e respostas

**Por que AI SDK direto e não Mastra?**
O fluxo tem cinco passos fixos e quero cada um visível no código. Um framework de agents traria memória e workflows que não preciso e esconderia o fluxo. O AI SDK dá streaming, tools, saída estruturada e troca de provedor; o resto é código simples.

**Por que regras em código e não no prompt?**
Prompt é sugestão, código é garantia. Prioridade, prazo, janela de 7 dias, privacidade e transferência precisam dar sempre o mesmo resultado e ser testáveis. O LLM interpreta a linguagem e propõe; o código valida e decide.

**Como evita criar chamado sem confirmação?**
O modelo não tem nenhuma tool de escrita. As tools só montam rascunhos. A gravação está em `server/drafts.ts`, chamada apenas pelo botão Confirmar, que confere dono, status e versão.

**E se o funcionário clicar duas vezes, ou a rede falhar no meio?**
A chave `draftId:versão` vai como Idempotency-Key. O serviço guarda a resposta da primeira vez e devolve a mesma, então não duplica. E o rascunho só pode ser confirmado uma vez.

**Como trata o legado fora do ar?**
Timeout de 3 s, até 3 tentativas com espera crescente e aleatória, e circuit breaker: depois de 5 falhas seguidas, recusa na hora por 10 s. A tool devolve um erro estruturado, o assistente avisa, a confiança cai e aparece o botão de analista. O console mostra "Sistema de chamados instável". O botão **Simular queda** demonstra isso.

**Como garante privacidade?**
O `requesterId` vem do cookie assinado, nunca do modelo nem do corpo da requisição; as tools fecham sobre ele. O serviço filtra por dono e responde 404 (não 403, para não confirmar que o chamado existe). O app faz o mesmo com conversas e rascunhos. Há testes negativos e um cenário de eval para isso.

**Como calcula horas úteis?**
`addBusinessMinutes` em `sla.ts`: converte para o relógio de São Paulo (UTC−3 fixo), pula noites e fins de semana e soma minuto útil a minuto útil por blocos. Crítico usa relógio corrido (1 h). Feriados ficaram fora (premissa D04).

**Como mede confiança e por que 0,6?**
A confiança que o modelo dá sobre si mesmo não é bem calibrada, então ela é limitada por tetos em código: intenção desconhecida (0,3), tool falhou (0,4), nenhum artigo bom (0,5). Vale o menor. Com 0,6, qualquer um desses sinais manda para um analista, e pedidos claros (0,8 ou mais) seguem com o assistente. É configurável em `CONFIDENCE_THRESHOLD`. Com o Jev, a confiança vem de probabilidades calibradas.

**Quanto custa por conversa?**
Com Claude Haiku 5.5, cerca de US$ 0,0007 por turno, menos de US$ 0,01 por conversa. Fora de escopo, saudação e transferência não chamam o modelo para responder. Cada resposta mostra tokens e custo no trace, e o console soma por conversa.

**Por que login sem senha?**
O desafio pede login simples para os usuários do seed. Escolher a pessoa já entra; o resto do sistema só
confia no cookie assinado. Em produção, trocaria esta tela pelo SSO da empresa sem mexer no resto.

**Como o visual fica consistente?**
Todos os componentes vêm do shadcn/ui e leem as mesmas variáveis do `globals.css`. Ninguém usa cor ou
tamanho solto: é `bg-primary`, `text-muted-foreground`, `text-body`. Mudar o token muda o produto inteiro.

**O que é o Jev e por que está opcional?**
Um modelo que só decide (escolha, sim/não, nota) e devolve probabilidades. Encaixa no passo "entender": mais rápido, mais barato e com confiança calibrada. Está atrás da interface `DecisionEngine` para comparar com o LLM nos evals antes de virar padrão.

**Como escalaria?**
Postgres no lugar do SQLite, o app sem estado em várias instâncias, rate limit em Redis, SSE no console, fila para envios ao legado e cache da busca de artigos. O desenho já separa app, agent e legado.

**O que mudaria em produção?**
SSO real, observabilidade (OpenTelemetry com o trace), evals noturnos com o modelo real, teto de custo por usuário e global, e LGPD: retenção e mascaramento de dados pessoais nos traces.

## 4. Onde mexer ao vivo

| Pedido                                | Onde                                                                                                                                                                     | Teste a ajustar                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Nova categoria                        | `CATEGORIES` e `CATEGORY_LABELS` em `shared/src/schemas/ticket.ts`; enum em `tickets-service/src/db/schema.ts`                                                           | `tickets-service/src/app.test.ts`                     |
| Novo tipo de chamado                  | `TICKET_TYPES` e rótulos em `ticket.ts`; regex do `id` no schema `Ticket`; número inicial em `createTicket` (`tickets-service/src/domain/tickets.ts`)                    | `app.test.ts`, `priority.test.ts`                     |
| Mudar prazo (SLA)                     | `SLA_BY_PRIORITY` e `SLA_LABELS` em `shared/src/rules/sla.ts`                                                                                                            | `sla.test.ts`                                         |
| Mudar horário útil                    | `BUSINESS_HOURS` em `sla.ts`                                                                                                                                             | `sla.test.ts`                                         |
| Trocar o banco (arquivo ↔ Turso)      | Só variáveis: `APP_DB_PATH` local, `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` na Vercel (`apps/web/src/server/runtime.ts`)                                                  | `chat.test.ts`                                        |
| Separar de novo o serviço de chamados | `TICKETS_SERVICE_URL` com a URL dele em vez de `embedded` (`runtime.ts`)                                                                                                 | `client.test.ts`                                      |
| Teto de uso da demo                   | `LLM_DAILY_TURN_LIMIT` e `DEMO_RESET_HOURS` (`server/chat.ts`, `runtime.ts`)                                                                                             | `chat.test.ts`                                        |
| Mudar janela de reabertura            | `REOPEN_WINDOW_DAYS` em `shared/src/rules/ticket-rules.ts`                                                                                                               | `sla.test.ts` (canReopen), cenários `reabrir-*`       |
| Mudar limite de 30 mensagens          | `SESSION_MESSAGE_LIMIT` e `SESSION_MESSAGE_WARN_AT` no `.env`                                                                                                            | `apps/web/src/server/chat.test.ts`                    |
| Mudar limiar de confiança             | `CONFIDENCE_THRESHOLD` no `.env`                                                                                                                                         | `rules.test.ts`                                       |
| Nova regra de prioridade              | `classifyPriority` em `shared/src/rules/priority.ts`                                                                                                                     | `priority.test.ts`                                    |
| Nova regra de transferência           | `decideHandoff` em `agent/src/rules/handoff.ts`; motivo novo em `HANDOFF_REASONS` (`conversation.ts`) e texto em `HANDOFF_REPLIES` (`prompts.ts`)                        | `rules.test.ts`, novo cenário em `evals/scenarios.ts` |
| Nova tool                             | criar em `createTools` (`agent/src/tools.ts`) e liberar em `TOOLS_BY_INTENT`                                                                                             | cenário em `evals/scenarios.ts`                       |
| Novo artigo                           | `ARTICLES` em `agent/src/knowledge/articles.ts`                                                                                                                          | cenário de dúvida em `evals`                          |
| Trocar o modelo ou provedor           | `LLM_MODEL` no `.env`; outro provedor: `createChatModel` em `agent/src/llm/model.ts`                                                                                     | `pnpm eval`                                           |
| Novo filtro no console                | `ConsoleView` em `web/src/components/console/console-view.tsx` (estado do filtro e `items`)                                                                              | E2E                                                   |
| Novo campo no rascunho                | schema `Draft` (`conversation.ts`), `inputSchema` e `nextDraft` de `draftTicket` (`tools.ts`), `DraftCard` (`cards.tsx`), envio em `submit` (`web/src/server/drafts.ts`) | `chat.test.ts`                                        |
| Novo status de chamado                | `TICKET_STATUSES`, `TICKET_STATUS_LABELS` e, se contar como aberto, `OPEN_STATUSES` (`ticket.ts`); enum no schema do serviço; cor em `ticket-badges.tsx`                 | `app.test.ts`                                         |
| Mudar o tom das respostas             | `buildAgentInstructions` em `agent/src/prompts.ts`                                                                                                                       | `pnpm eval`                                           |
| Mudar cores ou raio                   | variáveis em `:root` de `web/src/app/globals.css`                                                                                                                        | —                                                     |
| Mudar tipografia                      | `@utility text-*` em `globals.css`; fonte em `web/src/app/layout.tsx`                                                                                                    | —                                                     |
| Mudar a logo                          | `LogoMark` em `web/src/components/brand/logo.tsx` e `public/icon.svg`                                                                                                    | —                                                     |
| Novo componente shadcn                | copiar para `web/src/components/ui/` (o `components.json` já está configurado para o CLI `npx shadcn add`)                                                               | —                                                     |

## 5. Comandos úteis

```bash
pnpm dev                 # sobe app (3000) e serviço de chamados (4010)
pnpm test                # unitários, fluxo do app e cenários com mock
pnpm test:e2e            # Playwright
pnpm eval                # cenários com o modelo do .env e relatório em docs/eval-report.md
pnpm typecheck && pnpm lint
pnpm db:reset            # recria os chamados (datas relativas a agora) e apaga as conversas

# derrubar o serviço de chamados por 30 s (também há o botão "Simular queda" no console)
curl -X POST localhost:4010/__chaos -H 'x-service-token: troque-este-token-local' \
  -H 'content-type: application/json' -d '{"downForSeconds":30}'
```

## 6. Perguntas sobre a publicação

**Por que Turso e não Postgres?** O app já era SQLite. O Turso é SQLite hospedado: mudou só o driver e o
acesso ficou assíncrono. Postgres exigiria reescrever schema e consultas no prazo.

**O serviço de chamados não deveria ser separado?** Ele continua separado no código e no contrato HTTP.
Na Vercel ele roda no mesmo processo porque lá não há um servidor de pé; o cliente chama o Hono direto
(`app.request`). Para separar, basta apontar `TICKETS_SERVICE_URL` para a URL dele.

**E se dois analistas clicarem em Assumir juntos?** O update só muda a linha se ela ainda estiver
"aguardando analista". O segundo recebe 409 "Outro analista já assumiu". Há teste para isso.

**Como protege o custo numa demo pública?** 20 mensagens por minuto por pessoa, 30 por conversa e um teto
diário global contado no banco (`LLM_DAILY_TURN_LIMIT`).
