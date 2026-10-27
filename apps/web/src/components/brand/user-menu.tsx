'use client'

import { ChevronDown, Download, LogOut, Repeat2 } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useInstallApp } from '@/components/pwa/install'
import { logout } from '@/lib/api'
import { cn } from '@/lib/utils'
import { UserAvatar } from './user-avatar'

/**
 * Avatar com nome e o menu da conta, no topo do chat e do console.
 * `children` recebe itens próprios da tela (ex.: "Nova conversa" no chat).
 */
export function UserMenu({
  name,
  detail,
  role,
  inverted = false,
  children,
}: {
  name: string
  detail: string
  role: 'employee' | 'analyst'
  inverted?: boolean
  children?: ReactNode
}) {
  const { install } = useInstallApp()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Menu de ${name}`}
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
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="text-body font-medium">{name}</span>
          <span className="text-caption font-normal text-muted-foreground">
            {role === 'analyst' ? 'Analista' : 'Funcionário'} · {detail}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {children}
        {install && (
          <DropdownMenuItem onSelect={() => void install()}>
            <Download /> Instalar app
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void logout()}>
          <Repeat2 /> Trocar de perfil
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()} variant="destructive">
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
