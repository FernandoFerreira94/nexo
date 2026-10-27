'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

type DemoUser = { email: string; name: string; role: 'employee' | 'analyst'; department: string }

export function LoginForm({ users }: { users: DemoUser[] }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function login(loginEmail: string, loginPassword: string) {
    setBusy(true)
    setError(null)
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    })
    const body = (await response.json().catch(() => ({}))) as { role?: string; error?: string }
    if (!response.ok) {
      setError(body.error ?? 'Não foi possível entrar.')
      setBusy(false)
      return
    }
    window.location.href = body.role === 'analyst' ? '/console' : '/chat'
  }

  return (
    <div className="grid gap-6">
      <form
        className="grid gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault()
          void login(email, password)
        }}
      >
        <label className="grid gap-1 text-sm">
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 rounded-lg border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Senha
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 rounded-lg border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          Entrar
        </Button>
      </form>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
          Acesso rápido (demonstração: qualquer senha)
        </p>
        <ul className="grid gap-1.5">
          {users.map((u) => (
            <li key={u.email}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void login(u.email, 'demo')}
                className="flex w-full items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm hover:border-brand"
              >
                <span>
                  <span className="font-medium">{u.name}</span>
                  <span className="text-ink-faint"> · {u.department}</span>
                </span>
                <span className="text-xs text-ink-soft">
                  {u.role === 'analyst' ? 'Analista' : 'Funcionário'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
