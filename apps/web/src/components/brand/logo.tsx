import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * Logo da Nexo. O "N" liga dois pontos: a ideia de conexão (nexo) entre quem pede ajuda
 * e quem resolve. O degradê usa os tokens --brand-from e --brand-to do globals.css.
 */
export function LogoMark({ className }: { className?: string }) {
  // Id único por logo: um degradê dentro de um elemento escondido não pode ser reaproveitado por outro.
  const gradientId = useId()
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8 shrink-0', className)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-from)" />
          <stop offset="1" stopColor="var(--brand-to)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <path
        d="M10 22V10l12 12V10"
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.6" fill="white" />
      <circle cx="22" cy="22" r="2.6" fill="white" />
    </svg>
  )
}

export function Logo({
  className,
  inverted = false,
  subtitle,
}: {
  className?: string
  inverted?: boolean
  subtitle?: string
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <div className="leading-none">
        <p className="text-[1.0625rem] font-semibold tracking-tight">
          nexo
          <span
            className={cn('font-normal', inverted ? 'text-sidebar-muted' : 'text-muted-foreground')}
          >
            {' '}
            assist
          </span>
        </p>
        {subtitle && (
          <p
            className={cn(
              'mt-1 hidden whitespace-nowrap text-caption sm:block',
              inverted ? 'text-sidebar-muted' : 'text-muted-foreground',
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}
