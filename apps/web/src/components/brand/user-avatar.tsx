import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''}`.toUpperCase()
}

/** Avatar com iniciais: azul para funcionário, escuro para analista. */
export function UserAvatar({
  name,
  role = 'employee',
  className,
}: {
  name: string
  role?: 'employee' | 'analyst'
  className?: string
}) {
  return (
    <Avatar className={className}>
      <AvatarFallback
        className={cn(
          'font-semibold',
          role === 'analyst'
            ? 'bg-sidebar text-sidebar-foreground'
            : 'bg-accent text-accent-foreground',
        )}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}
