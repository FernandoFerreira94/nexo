'use client'

import { ArrowRight, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { UserAvatar } from '@/components/brand/user-avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type DemoUser = { email: string; name: string; role: 'employee' | 'analyst'; department: string }

const ROLE_HINTS = {
  employee: 'Abre e acompanha chamados conversando com o assistente.',
  analyst: 'Atende a fila de conversas transferidas e vê como o assistente decidiu.',
}

/** Login de demonstração: escolher o perfil e a pessoa já entra (sem senha). */
export function LoginPicker({ users }: { users: DemoUser[] }) {
  const [busyEmail, setBusyEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function enter(user: DemoUser) {
    setBusyEmail(user.email)
    setError(null)
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    })
    const body = (await response.json().catch(() => ({}))) as { role?: string; error?: string }
    if (!response.ok) {
      setError(body.error ?? 'Não foi possível entrar.')
      setBusyEmail(null)
      return
    }
    window.location.href = body.role === 'analyst' ? '/console' : '/chat'
  }

  return (
    <Tabs defaultValue="employee" className="mt-8 gap-4">
      <TabsList className="w-full">
        <TabsTrigger value="employee">Funcionário</TabsTrigger>
        <TabsTrigger value="analyst">Analista</TabsTrigger>
      </TabsList>

      {(['employee', 'analyst'] as const).map((role) => (
        <TabsContent key={role} value={role} className="grid gap-3">
          <p className="text-caption text-muted-foreground">{ROLE_HINTS[role]}</p>
          <ul className="grid gap-2">
            {users
              .filter((u) => u.role === role)
              .map((user) => (
                <li key={user.email}>
                  <button
                    type="button"
                    disabled={busyEmail !== null}
                    onClick={() => void enter(user)}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left shadow-xs transition-all',
                      'hover:-translate-y-px hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      'disabled:pointer-events-none disabled:opacity-60',
                    )}
                  >
                    <UserAvatar name={user.name} role={user.role} className="size-10" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-heading">{user.name}</span>
                      <span className="block truncate text-caption text-muted-foreground">
                        {user.department} · {user.email}
                      </span>
                    </span>
                    {busyEmail === user.email ? (
                      <LoaderCircle className="size-4 animate-spin text-primary" />
                    ) : (
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    )}
                  </button>
                </li>
              ))}
          </ul>
        </TabsContent>
      ))}

      {error && (
        <p role="alert" className="text-body text-destructive">
          {error}
        </p>
      )}
    </Tabs>
  )
}
