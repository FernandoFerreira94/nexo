import type { DraftKind, HandoffReason, Intent, Priority, TicketType } from '@nexo/shared'

/**
 * Cenários do Anexo A e casos de borda. Cada um descreve as mensagens do funcionário
 * e o que o agent PRECISA fazer no último turno. O mesmo arquivo roda com o modelo mock
 * (CI, sem custo) e com o modelo real (`pnpm eval`, com relatório de custo).
 */
export type Expectation = {
  intent?: Intent
  /** null = não pode transferir. */
  handoff?: HandoffReason | null
  /** Tools que precisam ter sido chamadas. */
  toolsCalled?: string[]
  /** Tools que NÃO podem ter sido chamadas. */
  toolsNotCalled?: string[]
  /** null = não pode haver rascunho. */
  draft?: { kind: DraftKind; type?: TicketType; priority?: Priority } | null
  /** Botão de transferência oferecido (sem transferir sozinho). */
  quickReplyHandoff?: HandoffReason
  rulesApplied?: string[]
  /** Nenhum card ou texto pode mostrar estes números de chamado (privacidade). */
  mustNotReveal?: string[]
  /** Aviso de instabilidade mostrado. */
  notice?: boolean
  /** O modelo não pode ser chamado (regra resolve sem custo). */
  noTokens?: boolean
  /** Nenhuma tool pode ser chamada. */
  noTools?: boolean
}

export type Scenario = {
  id: string
  title: string
  requesterId: string
  userName: string
  messages: string[]
  expect: Expectation
  /** Probabilidade de falha do sistema de chamados no cenário (padrão 0). */
  chaos?: number
}

const ana = { requesterId: 'u_ana', userName: 'Ana Souza' }

export const SCENARIOS: Scenario[] = [
  {
    id: 'vpn-809-win10',
    title: 'VPN erro 809 no Windows 10 resolve com artigo, sem chamado',
    ...ana,
    messages: ['Minha VPN está dando erro 809. Uso Windows 10.'],
    expect: {
      intent: 'new_issue',
      toolsCalled: ['searchKnowledgeBase'],
      draft: null,
      handoff: null,
    },
  },
  {
    id: 'vpn-809-win11',
    title: 'VPN erro 809 no Windows 11 vira rascunho de chamado de rede',
    ...ana,
    messages: ['A VPN dá erro 809 e não consigo trabalhar. Meu computador é Windows 11.'],
    expect: {
      intent: 'new_issue',
      toolsCalled: ['searchKnowledgeBase', 'draftTicket'],
      draft: { kind: 'create', type: 'INC', priority: 'high' },
      handoff: null,
    },
  },
  {
    id: 'status-sem-numero',
    title: 'Status sem número lista os chamados e oferece analista para o vencido',
    ...ana,
    messages: ['Como está o meu chamado?'],
    expect: {
      intent: 'ticket_status',
      toolsCalled: ['listMyTickets'],
      quickReplyHandoff: 'overdue',
      handoff: null,
      mustNotReveal: ['INC-20333', 'REQ-10450', 'INC-20290'],
    },
  },
  {
    id: 'status-com-numero-vencido',
    title: 'Status de chamado vencido oferece analista, sem transferir sozinho',
    ...ana,
    messages: ['Qual o status do INC-20311?'],
    expect: {
      intent: 'ticket_status',
      toolsCalled: ['getTicket'],
      quickReplyHandoff: 'overdue',
      rulesApplied: ['OVERDUE_OFFER_ANALYST'],
      handoff: null,
    },
  },
  {
    id: 'chamado-de-outra-pessoa',
    title: 'Chamado de outra pessoa não é revelado',
    ...ana,
    messages: ['Qual o status do INC-20333?'],
    expect: { intent: 'ticket_status', toolsCalled: ['getTicket'], mustNotReveal: ['INC-20333'] },
  },
  {
    id: 'duplicado',
    title: 'Problema já aberto: pergunta antes de criar outro',
    ...ana,
    messages: ['O Teams continua sem áudio nas reuniões, não consigo ouvir ninguém.'],
    expect: {
      intent: 'new_issue',
      toolsCalled: ['findSimilarOpenTicket'],
      draft: null,
      rulesApplied: ['DUPLICATE_CHECK'],
    },
  },
  {
    id: 'reabrir-4-dias',
    title: 'Resolvido há 4 dias: monta a reabertura',
    ...ana,
    messages: ['O problema do INC-20150 voltou, quero reabrir.'],
    expect: {
      intent: 'reopen',
      toolsCalled: ['draftReopen'],
      draft: { kind: 'reopen' },
      rulesApplied: ['REOPEN_WITHIN_7_DAYS'],
    },
  },
  {
    id: 'reabrir-12-dias',
    title: 'Resolvido há 12 dias: não reabre, sugere chamado novo',
    ...ana,
    messages: ['Quero reabrir o INC-19876, voltou a acontecer.'],
    expect: {
      intent: 'reopen',
      toolsCalled: ['draftReopen'],
      draft: null,
      rulesApplied: ['REOPEN_DENIED_AFTER_7_DAYS'],
    },
  },
  {
    id: 'complementar',
    title: 'Complemento vira rascunho de atualização',
    ...ana,
    messages: ['Quero complementar o INC-20311: agora o notebook nem liga direito.'],
    expect: { intent: 'add_info', toolsCalled: ['draftTicketUpdate'], draft: { kind: 'update' } },
  },
  {
    id: 'rh-holerite',
    title: 'RH é redirecionado sem chamar o modelo',
    ...ana,
    messages: ['Como faço para ver meu holerite?'],
    expect: {
      intent: 'out_of_scope',
      rulesApplied: ['SCOPE_OUT_RH'],
      draft: null,
      handoff: null,
      noTokens: true,
    },
  },
  {
    id: 'facilities',
    title: 'Facilities é redirecionado',
    ...ana,
    messages: ['O ar condicionado da minha sala parou.'],
    expect: { intent: 'out_of_scope', rulesApplied: ['SCOPE_OUT_FACILITIES'], noTokens: true },
  },
  {
    id: 'pede-analista',
    title: 'Pedido de analista transfere na hora',
    ...ana,
    messages: ['Quero falar com um analista, por favor.'],
    expect: { intent: 'talk_to_human', handoff: 'requested', noTools: true },
  },
  {
    id: 'critico',
    title: 'Equipe inteira parada transfere como crítico',
    ...ana,
    messages: ['O sistema de faturamento caiu para a equipe toda, estamos parados.'],
    expect: { handoff: 'critical', rulesApplied: ['HANDOFF_CRITICAL'] },
  },
  {
    id: 'duvida-horario',
    title: 'Dúvida de horário responde com artigo',
    ...ana,
    messages: ['Qual o horário de atendimento do service desk?'],
    expect: {
      intent: 'question',
      toolsCalled: ['searchKnowledgeBase'],
      draft: null,
      handoff: null,
    },
  },
  {
    id: 'duvida-senha',
    title: 'Dúvida de senha responde com artigo',
    ...ana,
    messages: ['Como troco minha senha de rede?'],
    expect: { intent: 'question', toolsCalled: ['searchKnowledgeBase'], draft: null },
  },
  {
    id: 'pedido-acesso',
    title: 'Pedido de acesso vira REQ de prioridade baixa',
    ...ana,
    messages: ['Preciso de acesso ao sistema de compras para aprovar pedidos.'],
    expect: {
      intent: 'new_issue',
      toolsCalled: ['draftTicket'],
      draft: { kind: 'create', type: 'REQ', priority: 'low' },
    },
  },
  {
    id: 'saudacao',
    title: 'Saudação responde sem tools',
    ...ana,
    messages: ['Oi, bom dia!'],
    expect: { intent: 'greeting', noTools: true, handoff: null },
  },
  {
    id: 'mensagem-vaga',
    title: 'Mensagem vaga transfere por baixa confiança',
    ...ana,
    messages: ['hmm'],
    expect: { handoff: 'low_confidence' },
  },
  {
    id: 'sistema-fora',
    title: 'Sistema de chamados fora do ar: avisa e oferece analista',
    ...ana,
    chaos: 1,
    messages: ['Como está o meu chamado?'],
    expect: {
      intent: 'ticket_status',
      notice: true,
      quickReplyHandoff: 'requested',
      rulesApplied: ['CONFIDENCE_CAP_TOOL_FAILED'],
      handoff: null,
    },
  },
]
