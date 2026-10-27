import { SEED_USERS } from '@nexo/shared'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-lg bg-brand font-bold text-white"
          >
            N
          </span>
          <div>
            <h1 className="text-lg font-semibold">Nexo Assist</h1>
            <p className="text-sm text-ink-soft">Service desk de TI</p>
          </div>
        </div>
        <LoginForm
          users={SEED_USERS.map((u) => ({
            email: u.email,
            name: u.name,
            role: u.role,
            department: u.department,
          }))}
        />
      </div>
    </main>
  )
}
