import { SEED_USERS } from '@nexo/shared'
import { CircleCheck, Headset, Zap } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { LoginPicker } from './login-picker'

const HIGHLIGHTS = [
  {
    icon: Zap,
    title: 'Resposta na hora',
    text: 'Dúvidas, status e chamados novos numa conversa só.',
  },
  {
    icon: CircleCheck,
    title: 'Nada sem sua confirmação',
    text: 'O assistente prepara o chamado; quem envia é você.',
  },
  {
    icon: Headset,
    title: 'Analista com contexto',
    text: 'Quando precisa de uma pessoa, ela já recebe o resumo.',
  },
]

export default function LoginPage() {
  const users = SEED_USERS.map(({ email, name, role, department }) => ({
    email,
    name,
    role,
    department,
  }))
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 -top-32 size-[28rem] rounded-full bg-brand-from/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 right-0 size-[24rem] rounded-full bg-brand-to/25 blur-3xl"
        />
        <Logo inverted subtitle="Service desk de TI" className="relative" />
        <div className="relative max-w-md">
          <h1 className="text-display">O service desk que resolve conversando.</h1>
          <ul className="mt-10 grid gap-6">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar-accent ring-1 ring-sidebar-border">
                  <Icon className="size-4 text-brand-to" />
                </span>
                <div>
                  <p className="text-heading">{title}</p>
                  <p className="text-body text-sidebar-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-caption text-sidebar-muted">
          © Nexo · ambiente de demonstração
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <Logo subtitle="Service desk de TI" className="mb-10 lg:hidden" />
          <h2 className="text-title">Entrar</h2>
          <p className="mt-1 text-body text-muted-foreground">
            Ambiente de demonstração: escolha um perfil e entre com um clique.
          </p>
          <LoginPicker users={users} />
        </div>
      </section>
    </main>
  )
}
