import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { Intent } from '@nexo/shared'
import {
  experimental_decide,
  generateText,
  Output,
  type Experimental_DecisionModel,
  type LanguageModel,
} from 'ai'
import { z } from 'zod'
import type { AgentConfig } from './config'
import { guessIntent, guessIsCritical } from './llm/heuristics'
import { INTENT_DESCRIPTIONS, UNDERSTANDING_INSTRUCTIONS } from './prompts'
import { extractTicketId } from './ticket-summary'

/**
 * Primeiro passo de cada turno: entender o pedido ANTES de responder.
 * O resultado alimenta as regras (transferência, confiança) e escolhe quais tools o agent pode usar.
 */
export type Understanding = {
  intent: Intent
  /** 0 a 1. Ainda passa pelos tetos de computeConfidence. */
  confidence: number
  confidenceReason: string
  summary: string
  isCritical: boolean
  mentionedTicketId: string | null
  tokens: { input: number; output: number }
  /** Quem decidiu: 'llm', 'jev' ou 'mock' (aparece no trace). */
  engine: string
}

export type HistoryMessage = { role: 'user' | 'assistant'; content: string }

export interface DecisionEngine {
  understand(input: { text: string; history: HistoryMessage[] }): Promise<Understanding>
}

const UnderstandingSchema = z.object({
  intent: Intent,
  confidence: z.number().min(0).max(1),
  confidenceReason: z.string(),
  summary: z.string(),
  isCritical: z.boolean(),
  mentionedTicketId: z.string().nullable(),
})

/** LLM com saída estruturada (padrão). Uma chamada curta, sem tools. */
export function createLlmDecisionEngine(model: LanguageModel): DecisionEngine {
  return {
    async understand({ text, history }) {
      const result = await generateText({
        model,
        instructions: UNDERSTANDING_INSTRUCTIONS,
        messages: [...history, { role: 'user', content: text }],
        output: Output.object({ schema: UnderstandingSchema }),
      })
      const output = result.output
      return {
        ...output,
        mentionedTicketId: extractTicketId(text) ?? output.mentionedTicketId,
        tokens: {
          input: result.totalUsage.inputTokens ?? 0,
          output: result.totalUsage.outputTokens ?? 0,
        },
        engine: 'llm',
      }
    },
  }
}

/**
 * Jev (TypeSafe AI via OpenRouter): modelo que só decide, não conversa.
 * Devolve probabilidades calibradas, então a confiança vem da própria distribuição,
 * e não de uma autoavaliação do LLM. Opcional: DECISION_PROVIDER=jev.
 */
export function createJevDecisionEngine(config: AgentConfig): DecisionEngine {
  const openrouter = createOpenRouter({ apiKey: config.llmApiKey })
  // O provider da OpenRouter implementa a versão anterior da spec de decisão. A única diferença
  // de tipo é o formato de `state` em lista; aqui passamos um objeto JSON, que as duas aceitam.
  const model = openrouter.evaluationModel(
    config.decisionModel,
  ) as unknown as Experimental_DecisionModel

  return {
    async understand({ text, history }) {
      const recent = history.slice(-4)
      const result = await experimental_decide({
        model,
        state: { mensagemAtual: text, conversaRecente: recent },
        questions: {
          intent: {
            type: 'choice',
            instructions: 'O que o funcionário quer com a mensagem atual, num service desk de TI?',
            criteria: INTENT_DESCRIPTIONS,
          },
          isCritical: {
            type: 'boolean',
            instructions:
              'O problema deixa uma equipe inteira ou a empresa sem conseguir trabalhar, sem alternativa?',
          },
        },
      })
      const intentAnswer = result.answers.intent
      const intent = Intent.parse(intentAnswer.choice)
      const confidence = intentAnswer.probabilities?.[intent] ?? 0.5
      return {
        intent,
        confidence,
        confidenceReason: `Probabilidade de "${intent}" segundo o Jev.`,
        summary: text.slice(0, 200),
        isCritical: result.answers.isCritical.probability >= 0.5,
        mentionedTicketId: extractTicketId(text),
        tokens: {
          input: result.usage.inputTokens ?? 0,
          output: result.usage.outputTokens ?? 0,
        },
        engine: 'jev',
      }
    },
  }
}

/** Sem chave de API: palavras-chave. Só para desenvolvimento, testes e evals em CI. */
export function createMockDecisionEngine(): DecisionEngine {
  return {
    async understand({ text }) {
      const intent = guessIntent(text)
      return {
        intent,
        confidence: intent === 'unknown' ? 0.3 : 0.85,
        confidenceReason: 'Modo mock: intenção por palavras-chave.',
        summary: text.slice(0, 200),
        isCritical: guessIsCritical(text),
        mentionedTicketId: extractTicketId(text),
        tokens: { input: 0, output: 0 },
        engine: 'mock',
      }
    },
  }
}

export function createDecisionEngine(config: AgentConfig, model: LanguageModel): DecisionEngine {
  if (config.llmProvider === 'mock') return createMockDecisionEngine()
  if (config.decisionProvider === 'jev') return createJevDecisionEngine(config)
  return createLlmDecisionEngine(model)
}
