import { tokenize } from '../text'

/**
 * Escopo do Anexo A: só TI. RH, financeiro e facilities são redirecionados sem chamado.
 * Lista de termos como rede de segurança: mesmo se o LLM errar a intenção, a regra pega (decisão D09).
 */
const OUT_OF_SCOPE_AREAS = [
  {
    area: 'RH',
    channel: 'o portal do RH (rh.nexo.com)',
    terms: [
      'ferias',
      'holerite',
      'salario',
      'beneficio',
      'beneficios',
      'vale refeicao',
      'vale transporte',
      'plano de saude',
      'bater ponto',
      'banco de horas',
      'admissao',
      'demissao',
      'atestado',
    ],
  },
  {
    area: 'Financeiro',
    channel: 'o time financeiro (financeiro@nexo.com)',
    terms: [
      'reembolso',
      'nota fiscal',
      'pagamento de fornecedor',
      'adiantamento',
      'despesa',
      'cartao corporativo',
    ],
  },
  {
    area: 'Facilities',
    channel: 'o time de facilities (ramal 2000)',
    terms: ['ar condicionado', 'cadeira', 'cracha', 'estacionamento', 'limpeza', 'lampada', 'copa'],
  },
] as const

export type ScopeCheck = { inScope: true } | { inScope: false; area: string; channel: string }

export function checkScope(text: string): ScopeCheck {
  const normalized = ` ${tokenize(text).join(' ')} `
  for (const { area, channel, terms } of OUT_OF_SCOPE_AREAS) {
    if (terms.some((term) => normalized.includes(` ${tokenize(term).join(' ')} `))) {
      return { inScope: false, area, channel }
    }
  }
  return { inScope: true }
}

export function outOfScopeReply(check: Extract<ScopeCheck, { inScope: false }>): string {
  return (
    `Esse assunto é com ${check.area}, e eu cuido só de TI. ` +
    `O melhor caminho é ${check.channel}. Se tiver algum problema com computador, sistemas, acesso ou rede, é só me chamar.`
  )
}

export const GENERIC_OUT_OF_SCOPE_REPLY =
  'Esse assunto não é de TI, então não consigo abrir chamado para ele. ' +
  'Para RH, use o portal do RH; para financeiro, financeiro@nexo.com; para facilities, o ramal 2000.'
