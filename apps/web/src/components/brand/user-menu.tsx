'use client'

import { ChevronDown, LogOut } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { logout } from '@/lib/api'
import { cn } from '@/lib/utils'
import { UserAvatar } from './user-avatar'

/** Avatar com nome e menu de sair, usado no topo do chat e do console. */
export function UserMenu({
  name,
  detail,
  role,
  inverted = false,
}: {
  name: string
  detail: string
  role: 'employee' | 'analyst'
  inverted?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-2 rounded-lg p-1 pr-2 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
          inverted ? 'hover:bg-sidebar-accent' : 'hover:bg-accent',
        )}
      >
        <UserAvatar name={name} role={role} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-body font-medium">{name}</span>
          <span
            className={cn(
              'block text-caption',
              inverted ? 'text-sidebar-muted' : 'text-muted-foreground',
            )}
          >
            {detail}
          </span>
        </span>
        <ChevronDown className="size-4 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-caption text-muted-foreground">
          {detail}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
