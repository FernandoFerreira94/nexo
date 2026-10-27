import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('mantém o tamanho da tipografia junto com a cor', () => {
    expect(cn('text-caption', 'text-muted-foreground')).toBe('text-caption text-muted-foreground')
  })
  it('resolve conflito entre dois tamanhos', () => {
    expect(cn('text-body', 'text-caption')).toBe('text-caption')
  })
})
