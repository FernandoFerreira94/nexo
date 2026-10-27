const STOPWORDS = new Set([
  'a',
  'o',
  'as',
  'os',
  'um',
  'uma',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'e',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'com',
  'para',
  'pra',
  'por',
  'que',
  'se',
  'meu',
  'minha',
  'meus',
  'minhas',
  'eu',
  'me',
  'ao',
  'esta',
  'esta',
  'ta',
  'nao',
  'mais',
  'muito',
  'ja',
  'foi',
  'ser',
  'tem',
  'estou',
  'isso',
])

/** Minúsculas, sem acento e sem pontuação: "Não conecto à VPN!" → ["conecto", "vpn"]. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOPWORDS.has(word))
}
