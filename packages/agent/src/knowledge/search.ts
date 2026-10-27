import { ARTICLES, type Article } from './articles'
import { tokenize } from '../text'

export type ArticleMatch = { article: Article; score: number }

/** Acima disso o artigo é considerado uma resposta forte (decisão A10). */
export const STRONG_MATCH_SCORE = 2

/**
 * Busca por palavras-chave, sem embeddings: com 8 artigos isso basta e é explicável.
 * Pontuação: +2 por palavra-chave (ou expressão) encontrada no texto, +1 por palavra do título.
 */
export function searchArticles(
  query: string,
  articles: readonly Article[] = ARTICLES,
): ArticleMatch[] {
  const normalizedQuery = ` ${tokenize(query).join(' ')} `
  const queryTokens = new Set(tokenize(query))

  return articles
    .map((article) => {
      let score = 0
      for (const keyword of article.keywords) {
        const normalizedKeyword = tokenize(keyword).join(' ')
        if (normalizedKeyword && normalizedQuery.includes(` ${normalizedKeyword} `)) score += 2
      }
      for (const word of tokenize(article.title)) {
        if (queryTokens.has(word)) score += 1
      }
      return { article, score }
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}
