import type { ButtonHTMLAttributes } from 'react'

const VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-strong disabled:bg-ink-faint',
  secondary:
    'bg-surface text-ink ring-1 ring-inset ring-line hover:bg-canvas disabled:text-ink-faint',
  ghost: 'text-ink-soft hover:bg-canvas hover:text-ink',
  danger: 'bg-surface text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger-soft',
} as const

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: Props) {
  const sizing = size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm'
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed ${sizing} ${VARIANTS[variant]} ${className}`}
    />
  )
}
