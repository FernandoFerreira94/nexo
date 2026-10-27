import type { Affected, Category, Intent, TicketType } from '@nexo/shared'
import { tokenize } from '../text'

/**
 * Heurísticas por palavra-chave usadas SÓ no modo mock (LLM_PROVIDER=mock).
 * Servem para rodar o sistema e os testes sem chave de API. Com o modelo real,
 * quem entende a mensagem é o LLM; estas funções não entram no caminho.
 */
const has = (text: string, terms: readonly string[]) => {
  const normalized = ` ${tokenize(text).join(' ')} `
  return terms.some((term) => normalized.includes(` ${tokenize(term).join(' ')} `))
}

export function guessIntent(text: string): Intent {
  if (has(text, ['analista', 'humano', 'atendente', 'pessoa de verdade'])) return 'talk_to_human'
  if (has(text, ['reabrir', 'reabre', 'voltou', 'voltou a acontecer', 'de novo'])) return 'reopen'
  if (has(text, ['complementar', 'adicionar informacao', 'acrescentar', 'mais uma informacao'])) {
    return 'add_info'
  }
  if (has(text, ['status', 'andamento', 'meus chamados', 'meu chamado', 'situacao'])) {
    return 'ticket_status'
  }
  if (has(text, ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'obrigado', 'obrigada'])) {
    if (tokenize(text).length <= 3) return 'greeting'
  }
  if (has(text, ['como', 'qual', 'quando', 'onde', 'horario', 'posso'])) {
    if (!has(text, ['nao funciona', 'erro', 'parou', 'quebrou', 'travou', 'caiu']))
      return 'question'
  }
  if (
    has(text, [
      'erro',
      'nao funciona',
      'nao consigo',
      'parou',
      'quebrou',
      'travou',
      'caiu',
      'preciso',
      'problema',
    ])
  ) {
    return 'new_issue'
  }
  return 'unknown'
}

export function guessCategory(text: string): Category {
  if (has(text, ['vpn', 'rede', 'internet', 'wifi', 'conexao'])) return 'network_vpn'
  if (has(text, ['senha', 'acesso', 'login', 'permissao', 'bloqueado', 'bloqueada']))
    return 'access'
  if (has(text, ['outlook', 'email', 'e-mail', 'caixa de entrada'])) return 'email'
  if (has(text, ['notebook', 'computador', 'impressora', 'monitor', 'teclado', 'mouse'])) {
    return 'hardware'
  }
  if (has(text, ['sistema', 'programa', 'teams', 'excel', 'instalar', 'software', 'licenca'])) {
    return 'software'
  }
  return 'other'
}

export function guessSignals(text: string): {
  type: TicketType
  affected: Affected
  blocksWork: boolean
  deadlineToday: boolean
} {
  const isRequest = has(text, [
    'preciso de acesso',
    'instalar',
    'solicitar',
    'pedir',
    'novo acesso',
  ])
  return {
    type: isRequest ? 'REQ' : 'INC',
    affected: has(text, ['empresa toda', 'todo mundo', 'todos'])
      ? 'company'
      : has(text, ['equipe', 'time', 'setor'])
        ? 'team'
        : 'one',
    blocksWork: has(text, ['parado', 'parada', 'parados', 'paradas', 'parou tudo', 'nao consigo']),
    deadlineToday: has(text, ['hoje', 'urgente', 'prazo']),
  }
}

export function guessIsCritical(text: string): boolean {
  const { affected, blocksWork } = guessSignals(text)
  return affected !== 'one' && blocksWork
}
