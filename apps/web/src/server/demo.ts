import { buildHandoffSummary, HANDOFF_REPLIES } from '@nexo/agent'
import type { HandoffReason } from '@nexo/shared'
import { addMessage, assume, getActiveConversation, handOff } from './conversations'
import type { AppDb } from './db/client'

/**
 * Só para a demonstração: coloca pedidos de outros funcionários na fila do console,
 * para o analista ver crítico, pedido direto, baixa confiança e um já em atendimento.
 * Usa as mesmas funções do fluxo real (mensagens, transferência, resumo), sem chamar o LLM.
 */
type Simulation = {
  userId: string
  userName: string
  text: string
  reason: HandoffReason
  /** Se definido, outro analista já assumiu (aparece como "Atendendo"). */
  assumedBy?: string
}

export const SIMULATIONS: Simulation[] = [
  {
    userId: 'u_diego',
    userName: 'Diego Rocha',
    text: 'O sistema de faturamento parou para toda a equipe de Operações. Ninguém consegue emitir nota.',
    reason: 'critical',
  },
  {
    userId: 'u_carla',
    userName: 'Carla Mendes',
    text: 'Quero falar com um analista sobre o meu acesso ao Power BI de campanhas.',
    reason: 'requested',
  },
  {
    userId: 'u_bruno',
    userName: 'Bruno Lima',
    text: 'Meu notebook faz um barulho estranho e às vezes desliga sozinho.',
    reason: 'low_confidence',
  },
  {
    userId: 'u_elisa',
    userName: 'Elisa Nunes',
    text: 'O certificado digital não aparece no portal do tribunal e tenho um prazo hoje.',
    reason: 'requested',
    assumedBy: 'u_patricia',
  },
]

/** Cria os pedidos que ainda não estão na fila. Devolve quantos foram criados. */
export async function simulateQueue(db: AppDb): Promise<number> {
  let created = 0
  for (const sim of SIMULATIONS) {
    const conversation = await getActiveConversation(db, sim.userId)
    if (conversation.status !== 'with_agent') continue // já está na fila ou em atendimento

    await addMessage(db, {
      conversationId: conversation.id,
      role: 'employee',
      authorId: sim.userId,
      content: sim.text,
    })
    const summary = buildHandoffSummary({
      userName: sim.userName,
      reason: sim.reason,
      understoodSummary: sim.text,
      history: [{ role: 'user', content: sim.text }],
      ticketIds: [],
    })
    await handOff(db, conversation.id, sim.reason, summary)
    await addMessage(db, {
      conversationId: conversation.id,
      role: 'agent',
      content: HANDOFF_REPLIES[sim.reason],
    })
    if (sim.assumedBy) await assume(db, conversation.id, sim.assumedBy)
    created += 1
  }
  return created
}
